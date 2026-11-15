-- =========================================================
-- AURALUCIS - 10: SALES RETURN, REFUND AND EXCHANGE
-- Run ONCE, after 01-09, as the schema owner. Take a backup first.
--   * order_items.returned_qty and orders.returned_amount/discount/vat: what has been returned
--   * order_returns / order_return_items: every return, with its refund
--   * pkg_returns: start_return, return_item, finish_return, settle_return
--   * a payment method 'Exchange' (credit moved from the returned order to the new order)
-- How the money is counted:
--   total_amount stays the original price. returned_amount = value of returned items
--   (item price - the order's discount share + VAT share). Amount still due = total - returned - paid.
--   A refund lowers paid_amount by the money handed back, so due stays right.
-- =========================================================

-- 1. COLUMNS
ALTER TABLE order_items ADD (returned_qty NUMBER(10) DEFAULT 0 NOT NULL);
ALTER TABLE order_items ADD CONSTRAINT chk_items_returned CHECK (returned_qty >= 0 AND returned_qty <= quantity);

ALTER TABLE orders ADD (
    returned_amount   NUMBER(12,2) DEFAULT 0 NOT NULL,
    returned_discount NUMBER(12,2) DEFAULT 0 NOT NULL,
    returned_vat      NUMBER(12,2) DEFAULT 0 NOT NULL
);
ALTER TABLE orders ADD CONSTRAINT chk_orders_returned CHECK (returned_amount >= 0 AND returned_discount >= 0 AND returned_vat >= 0);

-- 2. PAYMENT METHOD 'Exchange' (find the old check constraint of order_payments.method and replace it)
DECLARE
    v_text VARCHAR2(4000);
BEGIN
    FOR c IN (SELECT constraint_name, search_condition
              FROM user_constraints
              WHERE table_name = 'ORDER_PAYMENTS' AND constraint_type = 'C') LOOP
        v_text := c.search_condition;
        IF INSTR(v_text, 'Cash') > 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE order_payments DROP CONSTRAINT ' || c.constraint_name;
        END IF;
    END LOOP;
END;
/

ALTER TABLE order_payments ADD CONSTRAINT chk_payment_method
    CHECK (method IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank', 'Exchange'));

-- 3. RETURN TABLES
CREATE SEQUENCE returns_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE return_items_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE order_returns (
    return_id         NUMBER(10) PRIMARY KEY,
    order_id          NUMBER(10) NOT NULL REFERENCES orders(order_id),
    return_date       DATE DEFAULT SYSDATE NOT NULL,
    employee_id       NUMBER(10) REFERENCES employees(employee_id),
    reason            VARCHAR2(255) NOT NULL,
    items_amount      NUMBER(12,2) DEFAULT 0 NOT NULL,
    discount_amount   NUMBER(12,2) DEFAULT 0 NOT NULL,
    vat_amount        NUMBER(12,2) DEFAULT 0 NOT NULL,
    credit_amount     NUMBER(12,2) DEFAULT 0 NOT NULL,
    cost_amount       NUMBER(12,2) DEFAULT 0 NOT NULL,
    refundable_amount NUMBER(12,2) DEFAULT 0 NOT NULL,
    refund_amount     NUMBER(12,2) DEFAULT 0 NOT NULL,
    refund_method     VARCHAR2(20),
    exchange_order_id NUMBER(10) REFERENCES orders(order_id)
);

CREATE TABLE order_return_items (
    ri_id      NUMBER(10) PRIMARY KEY,
    return_id  NUMBER(10) NOT NULL REFERENCES order_returns(return_id),
    item_id    NUMBER(10) NOT NULL REFERENCES order_items(item_id),
    product_id NUMBER(10) NOT NULL REFERENCES products(product_id),
    quantity   NUMBER(10) NOT NULL CHECK (quantity > 0),
    unit_price NUMBER(12,2) NOT NULL,
    cost_price NUMBER(12,2) DEFAULT 0 NOT NULL
);

CREATE OR REPLACE TRIGGER trg_returns_bi
BEFORE INSERT ON order_returns FOR EACH ROW
BEGIN
    IF :NEW.return_id IS NULL THEN
        SELECT returns_seq.NEXTVAL INTO :NEW.return_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_return_items_bi
BEFORE INSERT ON order_return_items FOR EACH ROW
BEGIN
    IF :NEW.ri_id IS NULL THEN
        SELECT return_items_seq.NEXTVAL INTO :NEW.ri_id FROM DUAL;
    END IF;
END;
/

-- 4. ORDER SUMMARY VIEW: due = total - returned - paid (new column added at the end)
CREATE OR REPLACE VIEW vw_order_summary AS
SELECT 
    o.order_id,
    o.order_date,
    o.status,
    cust.first_name || ' ' || cust.last_name AS customer_name,
    emp.first_name || ' ' || emp.last_name   AS employee_name,
    o.total_amount AS order_total,
    NVL(COUNT(oi.item_id), 0) AS item_count,
    o.discount_amount,
    o.paid_amount,
    CASE WHEN o.status = 'Cancelled' THEN 0 ELSE o.total_amount - o.returned_amount - o.paid_amount END AS due_amount,
    o.vat_amount,
    o.returned_amount
FROM orders o
LEFT JOIN customers cust ON o.customer_id = cust.customer_id
LEFT JOIN employees emp  ON o.employee_id = emp.employee_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.order_date, o.status, cust.first_name, cust.last_name, emp.first_name, emp.last_name,
         o.total_amount, o.discount_amount, o.paid_amount, o.vat_amount, o.returned_amount;

-- 5. PACKAGE
-- All four steps run inside ONE transaction started by the API (no commit here).
CREATE OR REPLACE PACKAGE pkg_returns AS
    -- opens a return for a Completed order
    PROCEDURE start_return(
        p_return_id   IN NUMBER,
        p_order_id    IN NUMBER,
        p_employee_id IN NUMBER,
        p_reason      IN VARCHAR2
    );

    -- returns p_qty pieces of one order line: stock goes back, the line is marked returned
    PROCEDURE return_item(
        p_return_id IN NUMBER,
        p_item_id   IN NUMBER,
        p_qty       IN NUMBER
    );

    -- works out the credit (price - discount share + VAT share) and how much money the customer is owed back
    PROCEDURE finish_return(
        p_return_id IN NUMBER
    );

    -- pays the refund back (Cash/Card/bKash/Nagad/Bank), or moves it to a new order as 'Exchange'
    PROCEDURE settle_return(
        p_return_id    IN NUMBER,
        p_method       IN VARCHAR2,
        p_amount       IN NUMBER,
        p_new_order_id IN NUMBER,
        p_employee_id  IN NUMBER
    );
END pkg_returns;
/

CREATE OR REPLACE PACKAGE BODY pkg_returns AS

    PROCEDURE start_return(
        p_return_id   IN NUMBER,
        p_order_id    IN NUMBER,
        p_employee_id IN NUMBER,
        p_reason      IN VARCHAR2
    ) IS
        v_status VARCHAR2(30);
    BEGIN
        IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0 THEN
            RAISE_APPLICATION_ERROR(-20021, 'A reason is required for a return.');
        END IF;

        SELECT status INTO v_status
        FROM orders
        WHERE order_id = p_order_id
        FOR UPDATE;

        IF v_status <> 'Completed' THEN
            RAISE_APPLICATION_ERROR(-20020, 'Only a completed order can have items returned.');
        END IF;

        INSERT INTO order_returns (return_id, order_id, employee_id, reason)
        VALUES (p_return_id, p_order_id, p_employee_id, TRIM(p_reason));
    END start_return;

    PROCEDURE return_item(
        p_return_id IN NUMBER,
        p_item_id   IN NUMBER,
        p_qty       IN NUMBER
    ) IS
        v_order      NUMBER;
        v_item_order NUMBER;
        v_product    NUMBER;
        v_qty        NUMBER;
        v_returned   NUMBER;
        v_price      NUMBER;
        v_cost       NUMBER;
    BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Quantity must be greater than 0.');
        END IF;

        SELECT order_id INTO v_order
        FROM order_returns
        WHERE return_id = p_return_id;

        SELECT order_id, product_id, quantity, returned_qty, unit_price, NVL(cost_price, 0)
        INTO v_item_order, v_product, v_qty, v_returned, v_price, v_cost
        FROM order_items
        WHERE item_id = p_item_id
        FOR UPDATE;

        IF v_item_order <> v_order THEN
            RAISE_APPLICATION_ERROR(-20024, 'This item is not part of the order.');
        END IF;

        IF p_qty > v_qty - v_returned THEN
            RAISE_APPLICATION_ERROR(-20025, 'You cannot return more than was sold and not yet returned.');
        END IF;

        INSERT INTO order_return_items (return_id, item_id, product_id, quantity, unit_price, cost_price)
        VALUES (p_return_id, p_item_id, v_product, p_qty, v_price, v_cost);

        UPDATE order_items
        SET returned_qty = returned_qty + p_qty
        WHERE item_id = p_item_id;

        -- the pieces go back on the shelf
        UPDATE products
        SET stock_quantity = stock_quantity + p_qty
        WHERE product_id = v_product;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (v_product, 'RETURN', p_qty, 'Return #' || p_return_id || ' (order #' || v_order || ')');

        UPDATE order_returns
        SET items_amount = items_amount + (v_price * p_qty),
            cost_amount  = cost_amount + (v_cost * p_qty)
        WHERE return_id = p_return_id;
    END return_item;

    PROCEDURE finish_return(
        p_return_id IN NUMBER
    ) IS
        v_order      NUMBER;
        v_items      NUMBER;
        v_count      NUMBER;
        v_sub        NUMBER;
        v_disc_total NUMBER;
        v_vat_pct    NUMBER;
        v_total      NUMBER;
        v_paid       NUMBER;
        v_returned   NUMBER;
        v_disc       NUMBER;
        v_net        NUMBER;
        v_vat        NUMBER;
        v_credit     NUMBER;
        v_refundable NUMBER;
    BEGIN
        SELECT order_id, items_amount INTO v_order, v_items
        FROM order_returns
        WHERE return_id = p_return_id
        FOR UPDATE;

        SELECT COUNT(*) INTO v_count
        FROM order_return_items
        WHERE return_id = p_return_id;

        IF v_count = 0 THEN
            RAISE_APPLICATION_ERROR(-20022, 'Choose at least one item to return.');
        END IF;

        SELECT discount_amount, vat_percent, total_amount, paid_amount, returned_amount
        INTO v_disc_total, v_vat_pct, v_total, v_paid, v_returned
        FROM orders
        WHERE order_id = v_order;

        SELECT NVL(SUM(line_total), 0) INTO v_sub
        FROM order_items
        WHERE order_id = v_order;

        -- the returned items carry their share of the order's discount and of its VAT
        IF v_sub > 0 THEN
            v_disc := ROUND(v_items * v_disc_total / v_sub, 2);
        ELSE
            v_disc := 0;
        END IF;
        v_net    := v_items - v_disc;
        v_vat    := ROUND(v_net * v_vat_pct / 100, 2);
        v_credit := v_net + v_vat;

        -- rounding must never push the returned value above the order total
        IF v_returned + v_credit > v_total THEN
            v_credit := v_total - v_returned;
        END IF;

        UPDATE orders
        SET returned_amount   = returned_amount + v_credit,
            returned_discount = returned_discount + v_disc,
            returned_vat      = returned_vat + v_vat
        WHERE order_id = v_order;

        -- money the customer is owed back = what they paid - what they still have to pay for the kept items
        v_refundable := v_paid - (v_total - (v_returned + v_credit));
        IF v_refundable < 0 THEN
            v_refundable := 0;
        END IF;

        UPDATE order_returns
        SET discount_amount   = v_disc,
            vat_amount        = v_vat,
            credit_amount     = v_credit,
            refundable_amount = v_refundable
        WHERE return_id = p_return_id;
    END finish_return;

    PROCEDURE settle_return(
        p_return_id    IN NUMBER,
        p_method       IN VARCHAR2,
        p_amount       IN NUMBER,
        p_new_order_id IN NUMBER,
        p_employee_id  IN NUMBER
    ) IS
        v_order      NUMBER;
        v_refundable NUMBER;
        v_refunded   NUMBER;
        v_amt        NUMBER;
    BEGIN
        v_amt := ROUND(NVL(p_amount, 0), 2);
        IF v_amt <= 0 THEN
            RAISE_APPLICATION_ERROR(-20026, 'The refund amount must be greater than 0.');
        END IF;

        IF p_method IS NULL OR p_method NOT IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank', 'Exchange') THEN
            RAISE_APPLICATION_ERROR(-20010, 'Invalid payment method.');
        END IF;

        IF p_method = 'Exchange' AND p_new_order_id IS NULL THEN
            RAISE_APPLICATION_ERROR(-20027, 'An exchange needs the new order.');
        END IF;

        SELECT order_id, refundable_amount, refund_amount
        INTO v_order, v_refundable, v_refunded
        FROM order_returns
        WHERE return_id = p_return_id
        FOR UPDATE;

        IF v_amt > v_refundable - v_refunded THEN
            RAISE_APPLICATION_ERROR(-20028, 'The refund is more than the customer is owed for this return.');
        END IF;

        -- the money leaves the old order ...
        UPDATE orders
        SET paid_amount = paid_amount - v_amt
        WHERE order_id = v_order;

        UPDATE order_returns
        SET refund_amount     = refund_amount + v_amt,
            refund_method     = p_method,
            exchange_order_id = p_new_order_id
        WHERE return_id = p_return_id;

        -- ... and, for an exchange, arrives on the new order as a payment of type 'Exchange'
        IF p_method = 'Exchange' THEN
            INSERT INTO order_payments (order_id, amount, method, received_by, note)
            VALUES (p_new_order_id, v_amt, 'Exchange', p_employee_id, 'Exchange credit from return #' || p_return_id);

            UPDATE orders
            SET paid_amount = paid_amount + v_amt
            WHERE order_id = p_new_order_id;
        END IF;
    END settle_return;

END pkg_returns;
/

SHOW ERRORS
SELECT constraint_name, constraint_type FROM user_constraints WHERE table_name IN ('ORDER_RETURNS', 'ORDER_RETURN_ITEMS', 'ORDER_PAYMENTS');
