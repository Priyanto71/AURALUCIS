-- =========================================================
-- AURALUCIS - 02: TRIGGERS (auto-increment for Oracle 10g)
-- =========================================================
CREATE OR REPLACE TRIGGER trg_categories_bi
BEFORE INSERT ON categories FOR EACH ROW
BEGIN
    IF :NEW.category_id IS NULL THEN
        SELECT categories_seq.NEXTVAL INTO :NEW.category_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_suppliers_bi
BEFORE INSERT ON suppliers FOR EACH ROW
BEGIN
    IF :NEW.supplier_id IS NULL THEN
        SELECT suppliers_seq.NEXTVAL INTO :NEW.supplier_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_products_bi
BEFORE INSERT ON products FOR EACH ROW
BEGIN
    IF :NEW.product_id IS NULL THEN
        SELECT products_seq.NEXTVAL INTO :NEW.product_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_customers_bi
BEFORE INSERT ON customers FOR EACH ROW
BEGIN
    IF :NEW.customer_id IS NULL THEN
        SELECT customers_seq.NEXTVAL INTO :NEW.customer_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_employees_bi
BEFORE INSERT ON employees FOR EACH ROW
BEGIN
    IF :NEW.employee_id IS NULL THEN
        SELECT employees_seq.NEXTVAL INTO :NEW.employee_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_orders_bi
BEFORE INSERT ON orders FOR EACH ROW
BEGIN
    IF :NEW.order_id IS NULL THEN
        SELECT orders_seq.NEXTVAL INTO :NEW.order_id FROM DUAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_order_items_bi
BEFORE INSERT ON order_items FOR EACH ROW
BEGIN
    IF :NEW.item_id IS NULL THEN
        SELECT order_items_seq.NEXTVAL INTO :NEW.item_id FROM DUAL;
    END IF;
    :NEW.line_total := :NEW.quantity * :NEW.unit_price;
END;
/

CREATE OR REPLACE TRIGGER trg_stock_txn_bi
BEFORE INSERT ON stock_transactions FOR EACH ROW
BEGIN
    IF :NEW.txn_id IS NULL THEN
        SELECT stock_txn_seq.NEXTVAL INTO :NEW.txn_id FROM DUAL;
    END IF;
END;
/
