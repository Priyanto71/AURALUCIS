-- =========================================================
-- AURALUCIS - 08: SALES, PAYMENTS, VAT, COST/PROFIT, AUDIT, STOCK ADJUSTMENT
-- Run ONCE, after 01-07, as the schema owner.
--   * orders: discount, VAT, paid amount, public receipt code
--   * order_payments  (every payment: cash/card/bKash..., so a customer can pay in parts)
--   * shop_settings   (VAT %, shop name/address/phone, website link for the receipt QR code)
--   * products.cost_price, order_items.cost_price, stock_transactions.unit_cost/supplier_id (profit report)
--   * audit_log       (who did what, and when)
--   * pkg_jewelry final version: finalize_order, add_payment, receive_payment, adjust_stock, restock with cost
-- total_amount now means "amount the customer must pay" = items - discount + VAT.
-- =========================================================

-- 1. ORDER COLUMNS
ALTER TABLE orders ADD (
    discount_amount NUMBER(12,2) DEFAULT 0 NOT NULL,
    vat_percent     NUMBER(5,2)  DEFAULT 0 NOT NULL,
    vat_amount      NUMBER(12,2) DEFAULT 0 NOT NULL,
    paid_amount     NUMBER(12,2) DEFAULT 0 NOT NULL,
    public_code     VARCHAR2(40)
);
ALTER TABLE orders ADD CONSTRAINT chk_orders_amounts
    CHECK (discount_amount >= 0 AND vat_amount >= 0 AND paid_amount >= 0);

-- a hard-to-guess code for the public receipt page (the QR code on the receipt opens it)
UPDATE orders SET public_code = RAWTOHEX(SYS_GUID()) WHERE public_code IS NULL;
ALTER TABLE orders ADD CONSTRAINT uq_orders_public_code UNIQUE (public_code);

-- 2. PAYMENTS
CREATE SEQUENCE payments_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE order_payments (
    payment_id  NUMBER(10) PRIMARY KEY,
    order_id    NUMBER(10) NOT NULL REFERENCES orders(order_id),
    amount      NUMBER(12,2) NOT NULL CHECK (amount > 0),
    method      VARCHAR2(20) NOT NULL CHECK (method IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank')),
    paid_at     DATE DEFAULT SYSDATE NOT NULL,
    received_by NUMBER(10) REFERENCES employees(employee_id),
    note        VARCHAR2(255)
);

CREATE OR REPLACE TRIGGER trg_payments_bi
BEFORE INSERT ON order_payments FOR EACH ROW
BEGIN
    IF :NEW.payment_id IS NULL THEN
        SELECT payments_seq.NEXTVAL INTO :NEW.payment_id FROM DUAL;
    END IF;
END;
/

-- orders that were already completed count as fully paid in cash
INSERT INTO order_payments (order_id, amount, method, paid_at, received_by, note)
SELECT order_id, total_amount, 'Cash', order_date, employee_id, 'Migrated payment'
FROM orders
WHERE status = 'Completed' AND total_amount > 0;

UPDATE orders SET paid_amount = total_amount WHERE status = 'Completed';
COMMIT;

-- 3. SHOP SETTINGS (edited by a Manager on the Setup page)
CREATE TABLE shop_settings (
    setting_key   VARCHAR2(50) PRIMARY KEY,
    setting_value VARCHAR2(500)
);

INSERT INTO shop_settings (setting_key, setting_value) VALUES ('shop_name', 'AURALUCIS');
INSERT INTO shop_settings (setting_key, setting_value) VALUES ('shop_tagline', 'Where Luxury Meets Precision.');
INSERT INTO shop_settings (setting_key, setting_value) VALUES ('shop_address', '');
INSERT INTO shop_settings (setting_key, setting_value) VALUES ('shop_phone', '');
INSERT INTO shop_settings (setting_key, setting_value) VALUES ('vat_percent', '0');
INSERT INTO shop_settings (setting_key, setting_value) VALUES ('website_url', 'http://localhost:5173');
COMMIT;

-- 4. COST PRICE (for the profit report)
ALTER TABLE products ADD (cost_price NUMBER(12,2) DEFAULT 0 NOT NULL);
ALTER TABLE products ADD CONSTRAINT chk_products_cost CHECK (cost_price >= 0);
ALTER TABLE order_items ADD (cost_price NUMBER(12,2) DEFAULT 0 NOT NULL);
ALTER TABLE stock_transactions ADD (unit_cost NUMBER(12,2), supplier_id NUMBER(10) REFERENCES suppliers(supplier_id));

-- 5. AUDIT LOG
CREATE SEQUENCE audit_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE audit_log (
    audit_id    NUMBER(10) PRIMARY KEY,
    created_at  DATE DEFAULT SYSDATE NOT NULL,
    employee_id NUMBER(10),
    action      VARCHAR2(40) NOT NULL,
    entity      VARCHAR2(40) NOT NULL,
    entity_id   VARCHAR2(40),
    details     VARCHAR2(500)
);

CREATE OR REPLACE TRIGGER trg_audit_bi
BEFORE INSERT ON audit_log FOR EACH ROW
BEGIN
    IF :NEW.audit_id IS NULL THEN
        SELECT audit_seq.NEXTVAL INTO :NEW.audit_id FROM DUAL;
    END IF;
END;
/

-- 6. VIEWS (new columns are added at the end)
CREATE OR REPLACE VIEW vw_product_catalog AS
SELECT 
    p.product_id,
    p.product_name,
    c.category_name,
    s.supplier_name,
    p.metal_type,
    p.purity,
    p.weight_grams,
    p.making_charge,
    p.unit_price,
    p.stock_quantity,
    (p.stock_quantity * p.unit_price) AS stock_value,
    p.cost_price
FROM products p
LEFT JOIN categories c ON p.category_id = c.category_id
LEFT JOIN suppliers s  ON p.supplier_id = s.supplier_id;

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
    CASE WHEN o.status = 'Cancelled' THEN 0 ELSE o.total_amount - o.paid_amount END AS due_amount,
    o.vat_amount
FROM orders o
LEFT JOIN customers cust ON o.customer_id = cust.customer_id
LEFT JOIN employees emp  ON o.employee_id = emp.employee_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.order_date, o.status, cust.first_name, cust.last_name, emp.first_name, emp.last_name,
         o.total_amount, o.discount_amount, o.paid_amount, o.vat_amount;

-- 7. FINAL PACKAGE
CREATE OR REPLACE PACKAGE pkg_jewelry AS
    -- p_public_code: random code for the public receipt page (created here if the caller sends none)
    PROCEDURE create_order(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_order_id    IN NUMBER,
        p_status      IN VARCHAR2 DEFAULT 'Completed',
        p_public_code IN VARCHAR2 DEFAULT NULL
    );

    PROCEDURE add_order_item(
        p_order_id   IN NUMBER,
        p_product_id IN NUMBER,
        p_qty        IN NUMBER
    );

    -- Applies the discount and the shop's VAT and fixes the final total.
    -- p_max_pct is the biggest discount (in %) the seller may give.
    PROCEDURE finalize_order(
        p_order_id       IN NUMBER,
        p_discount_type  IN VARCHAR2 DEFAULT 'NONE',   -- NONE, AMOUNT or PERCENT
        p_discount_value IN NUMBER   DEFAULT 0,
        p_max_pct        IN NUMBER   DEFAULT 100
    );

    -- Records one payment (no commit). A customer may pay in several parts.
    PROCEDURE add_payment(
        p_order_id    IN NUMBER,
        p_amount      IN NUMBER,
        p_method      IN VARCHAR2,
        p_employee_id IN NUMBER,
        p_note        IN VARCHAR2 DEFAULT NULL
    );

    -- Same as add_payment but commits (used for a payment taken later)
    PROCEDURE receive_payment(
        p_order_id    IN NUMBER,
        p_amount      IN NUMBER,
        p_method      IN VARCHAR2,
        p_employee_id IN NUMBER,
        p_note        IN VARCHAR2 DEFAULT NULL
    );

    -- One-call sale of a single product, paid in full in cash (handy in SQL*Plus)
    PROCEDURE record_sale(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_order_id    OUT NUMBER
    );

    -- p_unit_cost (optional) updates the product's average cost price
    PROCEDURE restock_product(
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_remarks     IN VARCHAR2 DEFAULT 'RESTOCK',
        p_unit_cost   IN NUMBER   DEFAULT NULL,
        p_supplier_id IN NUMBER   DEFAULT NULL
    );

    -- Damaged / lost / found / counting correction. p_qty_change is negative to remove stock.
    PROCEDURE adjust_stock(
        p_product_id IN NUMBER,
        p_qty_change IN NUMBER,
        p_reason     IN VARCHAR2
    );

    PROCEDURE complete_order(
        p_order_id IN NUMBER
    );

    PROCEDURE cancel_order(
        p_order_id IN NUMBER
    );
END pkg_jewelry;
/

CREATE OR REPLACE PACKAGE BODY pkg_jewelry AS

    PROCEDURE create_order(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_order_id    IN NUMBER,
        p_status      IN VARCHAR2 DEFAULT 'Completed',
        p_public_code IN VARCHAR2 DEFAULT NULL
    ) IS
        v_code VARCHAR2(40);
    BEGIN
        IF p_status IS NULL OR p_status NOT IN ('Completed', 'Pending') THEN
            RAISE_APPLICATION_ERROR(-20006, 'Invalid order status.');
        END IF;

        v_code := NVL(p_public_code, RAWTOHEX(SYS_GUID()));

        INSERT INTO orders (order_id, customer_id, employee_id, status, total_amount, public_code)
        VALUES (p_order_id, p_customer_id, p_employee_id, p_status, 0, v_code);
    END create_order;

    PROCEDURE add_order_item(
        p_order_id   IN NUMBER,
        p_product_id IN NUMBER,
        p_qty        IN NUMBER
    ) IS
        v_stock  NUMBER;
        v_price  NUMBER;
        v_making NUMBER;
        v_cost   NUMBER;
        v_unit   NUMBER;
    BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Quantity must be greater than 0.');
        END IF;

        -- FOR UPDATE locks the product row until commit, so two sellers cannot take the same last item
        SELECT stock_quantity, unit_price, NVL(making_charge, 0), NVL(cost_price, 0)
        INTO v_stock, v_price, v_making, v_cost
        FROM products
        WHERE product_id = p_product_id
        FOR UPDATE;

        IF v_stock < p_qty THEN
            RAISE_APPLICATION_ERROR(-20001, 'Insufficient stock available.');
        END IF;

        -- price per piece = unit price + making charge; the cost price is copied for the profit report
        v_unit := v_price + v_making;

        INSERT INTO order_items (order_id, product_id, quantity, unit_price, cost_price)
        VALUES (p_order_id, p_product_id, p_qty, v_unit, v_cost);

        UPDATE products
        SET stock_quantity = stock_quantity - p_qty
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (p_product_id, 'SALE', -p_qty, 'Order #' || p_order_id);

        UPDATE orders
        SET total_amount = NVL(total_amount, 0) + (v_unit * p_qty)
        WHERE order_id = p_order_id;
    END add_order_item;

    PROCEDURE finalize_order(
        p_order_id       IN NUMBER,
        p_discount_type  IN VARCHAR2 DEFAULT 'NONE',
        p_discount_value IN NUMBER   DEFAULT 0,
        p_max_pct        IN NUMBER   DEFAULT 100
    ) IS
        v_sub     NUMBER;
        v_type    VARCHAR2(10);
        v_value   NUMBER;
        v_disc    NUMBER;
        v_pct     NUMBER;
        v_vat_pct NUMBER;
        v_vat     NUMBER;
        v_net     NUMBER;
    BEGIN
        v_type  := NVL(UPPER(p_discount_type), 'NONE');
        v_value := NVL(p_discount_value, 0);

        SELECT NVL(SUM(line_total), 0) INTO v_sub
        FROM order_items
        WHERE order_id = p_order_id;

        IF v_type = 'NONE' THEN
            v_disc := 0;
        ELSIF v_type = 'PERCENT' THEN
            v_disc := ROUND(v_sub * v_value / 100, 2);
        ELSIF v_type = 'AMOUNT' THEN
            v_disc := ROUND(v_value, 2);
        ELSE
            RAISE_APPLICATION_ERROR(-20007, 'Invalid discount type.');
        END IF;

        IF v_value < 0 OR v_disc < 0 OR v_disc > v_sub THEN
            RAISE_APPLICATION_ERROR(-20007, 'Discount must be between 0 and the order total.');
        END IF;

        IF v_sub > 0 THEN
            v_pct := v_disc / v_sub * 100;
        ELSE
            v_pct := 0;
        END IF;

        IF v_pct > NVL(p_max_pct, 100) + 0.0001 THEN
            RAISE_APPLICATION_ERROR(-20008, 'Discount is above your allowed limit of ' || p_max_pct || '%.');
        END IF;

        -- the shop's VAT percentage (Setup > Shop settings); 0 if it is missing or not a number
        BEGIN
            SELECT TO_NUMBER(setting_value) INTO v_vat_pct
            FROM shop_settings
            WHERE setting_key = 'vat_percent';
        EXCEPTION
            WHEN OTHERS THEN v_vat_pct := 0;
        END;
        v_vat_pct := NVL(v_vat_pct, 0);
        IF v_vat_pct < 0 OR v_vat_pct > 100 THEN
            v_vat_pct := 0;
        END IF;

        -- VAT is charged on the price after the discount
        v_net := v_sub - v_disc;
        v_vat := ROUND(v_net * v_vat_pct / 100, 2);

        UPDATE orders
        SET discount_amount = v_disc,
            vat_percent     = v_vat_pct,
            vat_amount      = v_vat,
            total_amount    = v_net + v_vat
        WHERE order_id = p_order_id;
    END finalize_order;

    PROCEDURE add_payment(
        p_order_id    IN NUMBER,
        p_amount      IN NUMBER,
        p_method      IN VARCHAR2,
        p_employee_id IN NUMBER,
        p_note        IN VARCHAR2 DEFAULT NULL
    ) IS
        v_status VARCHAR2(30);
        v_total  NUMBER;
        v_paid   NUMBER;
        v_amt    NUMBER;
    BEGIN
        v_amt := ROUND(NVL(p_amount, 0), 2);
        IF v_amt <= 0 THEN
            RAISE_APPLICATION_ERROR(-20011, 'Payment amount must be greater than 0.');
        END IF;

        IF p_method IS NULL OR p_method NOT IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank') THEN
            RAISE_APPLICATION_ERROR(-20010, 'Invalid payment method.');
        END IF;

        SELECT status, total_amount, paid_amount
        INTO v_status, v_total, v_paid
        FROM orders
        WHERE order_id = p_order_id
        FOR UPDATE;

        IF v_status = 'Cancelled' THEN
            RAISE_APPLICATION_ERROR(-20012, 'A cancelled order cannot take payments.');
        END IF;

        IF v_paid + v_amt > v_total THEN
            RAISE_APPLICATION_ERROR(-20009, 'Payment is more than the amount due.');
        END IF;

        INSERT INTO order_payments (order_id, amount, method, received_by, note)
        VALUES (p_order_id, v_amt, p_method, p_employee_id, p_note);

        UPDATE orders
        SET paid_amount = paid_amount + v_amt
        WHERE order_id = p_order_id;
    END add_payment;

    PROCEDURE receive_payment(
        p_order_id    IN NUMBER,
        p_amount      IN NUMBER,
        p_method      IN VARCHAR2,
        p_employee_id IN NUMBER,
        p_note        IN VARCHAR2 DEFAULT NULL
    ) IS
    BEGIN
        add_payment(p_order_id, p_amount, p_method, p_employee_id, p_note);
        COMMIT;
    END receive_payment;

    PROCEDURE record_sale(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_order_id    OUT NUMBER
    ) IS
        v_total NUMBER;
    BEGIN
        SELECT orders_seq.NEXTVAL INTO p_order_id FROM DUAL;
        create_order(p_customer_id, p_employee_id, p_order_id, 'Completed', NULL);
        add_order_item(p_order_id, p_product_id, p_qty);
        finalize_order(p_order_id, 'NONE', 0, 100);

        SELECT total_amount INTO v_total FROM orders WHERE order_id = p_order_id;
        IF v_total > 0 THEN
            add_payment(p_order_id, v_total, 'Cash', p_employee_id, 'Payment at sale');
        END IF;

        COMMIT;
    END record_sale;

    PROCEDURE restock_product(
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_remarks     IN VARCHAR2 DEFAULT 'RESTOCK',
        p_unit_cost   IN NUMBER   DEFAULT NULL,
        p_supplier_id IN NUMBER   DEFAULT NULL
    ) IS
        v_stock NUMBER;
        v_cost  NUMBER;
    BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Quantity must be greater than 0.');
        END IF;

        IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
            RAISE_APPLICATION_ERROR(-20016, 'Cost price cannot be negative.');
        END IF;

        BEGIN
            SELECT stock_quantity, NVL(cost_price, 0)
            INTO v_stock, v_cost
            FROM products
            WHERE product_id = p_product_id
            FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20003, 'Product not found.');
        END;

        -- weighted-average cost: (old stock x old cost + new qty x new cost) / total stock
        IF p_unit_cost IS NOT NULL THEN
            v_cost := ROUND((v_stock * v_cost + p_qty * p_unit_cost) / (v_stock + p_qty), 2);
        END IF;

        UPDATE products
        SET stock_quantity = stock_quantity + p_qty,
            cost_price     = v_cost
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks, unit_cost, supplier_id)
        VALUES (p_product_id, 'RESTOCK', p_qty, p_remarks, p_unit_cost, p_supplier_id);

        COMMIT;
    END restock_product;

    PROCEDURE adjust_stock(
        p_product_id IN NUMBER,
        p_qty_change IN NUMBER,
        p_reason     IN VARCHAR2
    ) IS
        v_stock NUMBER;
    BEGIN
        IF p_qty_change IS NULL OR p_qty_change = 0 THEN
            RAISE_APPLICATION_ERROR(-20013, 'Adjustment quantity cannot be zero.');
        END IF;

        IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0 THEN
            RAISE_APPLICATION_ERROR(-20014, 'A reason is required for a stock adjustment.');
        END IF;

        SELECT stock_quantity INTO v_stock
        FROM products
        WHERE product_id = p_product_id
        FOR UPDATE;

        IF v_stock + p_qty_change < 0 THEN
            RAISE_APPLICATION_ERROR(-20015, 'Adjustment would make the stock negative.');
        END IF;

        UPDATE products
        SET stock_quantity = stock_quantity + p_qty_change
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (p_product_id, 'ADJUSTMENT', p_qty_change, SUBSTR('Adjustment: ' || p_reason, 1, 255));

        COMMIT;
    END adjust_stock;

    PROCEDURE complete_order(
        p_order_id IN NUMBER
    ) IS
        v_status VARCHAR2(30);
    BEGIN
        SELECT status INTO v_status
        FROM orders
        WHERE order_id = p_order_id
        FOR UPDATE;

        IF v_status <> 'Pending' THEN
            RAISE_APPLICATION_ERROR(-20005, 'Only a pending order can be completed.');
        END IF;

        UPDATE orders
        SET status = 'Completed'
        WHERE order_id = p_order_id;

        COMMIT;
    END complete_order;

    PROCEDURE cancel_order(
        p_order_id IN NUMBER
    ) IS
        v_status VARCHAR2(30);
    BEGIN
        -- lock the order row and refuse a second cancel (prevents restocking twice)
        SELECT status INTO v_status
        FROM orders
        WHERE order_id = p_order_id
        FOR UPDATE;

        IF v_status = 'Cancelled' THEN
            RAISE_APPLICATION_ERROR(-20004, 'Order is already cancelled.');
        END IF;

        FOR item IN (SELECT product_id, quantity FROM order_items WHERE order_id = p_order_id) LOOP
            UPDATE products
            SET stock_quantity = stock_quantity + item.quantity
            WHERE product_id = item.product_id;

            INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
            VALUES (item.product_id, 'RETURN', item.quantity, 'Order Cancelled #' || p_order_id);
        END LOOP;

        UPDATE orders
        SET status = 'Cancelled'
        WHERE order_id = p_order_id;

        COMMIT;
    END cancel_order;

END pkg_jewelry;
/

SHOW ERRORS
SELECT order_id, status, total_amount, discount_amount, vat_amount, paid_amount FROM orders;
SELECT setting_key, setting_value FROM shop_settings;
