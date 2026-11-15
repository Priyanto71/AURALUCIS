-- =========================================================
-- AURALUCIS - 11: SUPPLIER PURCHASES (what you bought, at what cost, and what you still owe)
-- Run ONCE, after 01-10, as the schema owner. Take a backup first.
--   * purchases / purchase_items / purchase_payments
--   * pkg_purchases: start_purchase, add_purchase_item, pay_supplier (no commit: the API wraps them in one transaction)
-- Each purchased item adds to the stock and updates the product's average cost price,
-- and writes a RESTOCK line (with supplier and unit cost) to the stock history.
-- =========================================================

CREATE SEQUENCE purchases_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE purchase_items_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE purchase_payments_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE purchases (
    purchase_id   NUMBER(10) PRIMARY KEY,
    supplier_id   NUMBER(10) NOT NULL REFERENCES suppliers(supplier_id),
    invoice_no    VARCHAR2(50),
    purchase_date DATE DEFAULT SYSDATE NOT NULL,
    employee_id   NUMBER(10) REFERENCES employees(employee_id),
    total_amount  NUMBER(12,2) DEFAULT 0 NOT NULL,
    paid_amount   NUMBER(12,2) DEFAULT 0 NOT NULL,
    note          VARCHAR2(255),
    CONSTRAINT chk_purchases_amounts CHECK (total_amount >= 0 AND paid_amount >= 0 AND paid_amount <= total_amount)
);

CREATE TABLE purchase_items (
    pi_id       NUMBER(10) PRIMARY KEY,
    purchase_id NUMBER(10) NOT NULL REFERENCES purchases(purchase_id),
    product_id  NUMBER(10) NOT NULL REFERENCES products(product_id),
    quantity    NUMBER(10) NOT NULL CHECK (quantity > 0),
    unit_cost   NUMBER(12,2) NOT NULL CHECK (unit_cost >= 0),
    line_total  NUMBER(12,2) NOT NULL
);

CREATE TABLE purchase_payments (
    pp_id       NUMBER(10) PRIMARY KEY,
    purchase_id NUMBER(10) NOT NULL REFERENCES purchases(purchase_id),
    amount      NUMBER(12,2) NOT NULL CHECK (amount > 0),
    method      VARCHAR2(20) NOT NULL CHECK (method IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank')),
    paid_at     DATE DEFAULT SYSDATE NOT NULL,
    employee_id NUMBER(10) REFERENCES employees(employee_id),
    note        VARCHAR2(255)
);

CREATE OR REPLACE TRIGGER trg_purchases_bi
BEFORE INSERT ON purchases FOR EACH ROW
BEGIN
    IF :NEW.purchase_id IS NULL THEN
        SELECT purchases_seq.NEXTVAL INTO :NEW.purchase_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_purchase_items_bi
BEFORE INSERT ON purchase_items FOR EACH ROW
BEGIN
    IF :NEW.pi_id IS NULL THEN
        SELECT purchase_items_seq.NEXTVAL INTO :NEW.pi_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_purchase_payments_bi
BEFORE INSERT ON purchase_payments FOR EACH ROW
BEGIN
    IF :NEW.pp_id IS NULL THEN
        SELECT purchase_payments_seq.NEXTVAL INTO :NEW.pp_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE VIEW vw_purchase_summary AS
SELECT
    p.purchase_id,
    p.purchase_date,
    p.invoice_no,
    s.supplier_name,
    e.first_name || ' ' || e.last_name AS employee_name,
    p.total_amount,
    p.paid_amount,
    p.total_amount - p.paid_amount AS due_amount,
    (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = p.purchase_id) AS item_count
FROM purchases p
JOIN suppliers s ON s.supplier_id = p.supplier_id
LEFT JOIN employees e ON e.employee_id = p.employee_id;

CREATE OR REPLACE PACKAGE pkg_purchases AS
    -- opens a purchase from a supplier
    PROCEDURE start_purchase(
        p_purchase_id IN NUMBER,
        p_supplier_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_invoice_no  IN VARCHAR2,
        p_note        IN VARCHAR2
    );

    -- one purchased line: stock goes up, the product's average cost is updated, a RESTOCK line is logged
    PROCEDURE add_purchase_item(
        p_purchase_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_unit_cost   IN NUMBER
    );

    -- pays the supplier (all at once or in parts). It cannot pay more than is owed.
    PROCEDURE pay_supplier(
        p_purchase_id IN NUMBER,
        p_amount      IN NUMBER,
        p_method      IN VARCHAR2,
        p_employee_id IN NUMBER,
        p_note        IN VARCHAR2
    );
END pkg_purchases;
/

CREATE OR REPLACE PACKAGE BODY pkg_purchases AS

    PROCEDURE start_purchase(
        p_purchase_id IN NUMBER,
        p_supplier_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_invoice_no  IN VARCHAR2,
        p_note        IN VARCHAR2
    ) IS
    BEGIN
        INSERT INTO purchases (purchase_id, supplier_id, employee_id, invoice_no, note)
        VALUES (p_purchase_id, p_supplier_id, p_employee_id, TRIM(p_invoice_no), TRIM(p_note));
    END start_purchase;

    PROCEDURE add_purchase_item(
        p_purchase_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_unit_cost   IN NUMBER
    ) IS
        v_supplier NUMBER;
        v_stock    NUMBER;
        v_cost     NUMBER;
        v_line     NUMBER;
    BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Quantity must be greater than 0.');
        END IF;

        IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
            RAISE_APPLICATION_ERROR(-20016, 'Cost price cannot be negative.');
        END IF;

        SELECT supplier_id INTO v_supplier
        FROM purchases
        WHERE purchase_id = p_purchase_id
        FOR UPDATE;

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
        v_cost := ROUND((v_stock * v_cost + p_qty * p_unit_cost) / (v_stock + p_qty), 2);
        v_line := ROUND(p_qty * p_unit_cost, 2);

        UPDATE products
        SET stock_quantity = stock_quantity + p_qty,
            cost_price     = v_cost
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks, unit_cost, supplier_id)
        VALUES (p_product_id, 'RESTOCK', p_qty, 'Purchase #' || p_purchase_id, p_unit_cost, v_supplier);

        INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
        VALUES (p_purchase_id, p_product_id, p_qty, p_unit_cost, v_line);

        UPDATE purchases
        SET total_amount = total_amount + v_line
        WHERE purchase_id = p_purchase_id;
    END add_purchase_item;

    PROCEDURE pay_supplier(
        p_purchase_id IN NUMBER,
        p_amount      IN NUMBER,
        p_method      IN VARCHAR2,
        p_employee_id IN NUMBER,
        p_note        IN VARCHAR2
    ) IS
        v_total NUMBER;
        v_paid  NUMBER;
        v_amt   NUMBER;
    BEGIN
        v_amt := ROUND(NVL(p_amount, 0), 2);
        IF v_amt <= 0 THEN
            RAISE_APPLICATION_ERROR(-20011, 'Payment amount must be greater than 0.');
        END IF;

        IF p_method IS NULL OR p_method NOT IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank') THEN
            RAISE_APPLICATION_ERROR(-20010, 'Invalid payment method.');
        END IF;

        SELECT total_amount, paid_amount INTO v_total, v_paid
        FROM purchases
        WHERE purchase_id = p_purchase_id
        FOR UPDATE;

        IF v_paid + v_amt > v_total THEN
            RAISE_APPLICATION_ERROR(-20029, 'Payment is more than the amount owed to the supplier.');
        END IF;

        INSERT INTO purchase_payments (purchase_id, amount, method, employee_id, note)
        VALUES (p_purchase_id, v_amt, p_method, p_employee_id, p_note);

        UPDATE purchases
        SET paid_amount = paid_amount + v_amt
        WHERE purchase_id = p_purchase_id;
    END pay_supplier;

END pkg_purchases;
/

SHOW ERRORS
SELECT object_name, status FROM user_objects WHERE object_name IN ('PKG_PURCHASES', 'VW_PURCHASE_SUMMARY');
