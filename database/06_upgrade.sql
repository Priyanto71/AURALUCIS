-- =========================================================
-- AURALUCIS - 06: UPGRADE (run ONCE, as schema owner, after 01-05)
--   * employee login columns
--   * multi-product sales (create_order + add_order_item)
--   * making charge included in the sale price
--   * row locking on stock, status check on cancel, input checks
-- =========================================================

-- 1. LOGIN COLUMNS
-- Accounts are provisioned separately; never store demo passwords here.
ALTER TABLE employees ADD (username VARCHAR2(50), password_hash VARCHAR2(200));
ALTER TABLE employees ADD CONSTRAINT uq_employees_username UNIQUE (username);

COMMIT;
-- 2. FINAL PACKAGE
CREATE OR REPLACE PACKAGE pkg_jewelry AS
    -- Steps of a multi-product sale (the API runs them in ONE transaction)
    PROCEDURE create_order(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_order_id    IN NUMBER
    );

    PROCEDURE add_order_item(
        p_order_id   IN NUMBER,
        p_product_id IN NUMBER,
        p_qty        IN NUMBER
    );

    -- One-call sale of a single product (handy in SQL*Plus)
    PROCEDURE record_sale(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_order_id    OUT NUMBER
    );

    PROCEDURE restock_product(
        p_product_id IN NUMBER,
        p_qty        IN NUMBER,
        p_remarks    IN VARCHAR2 DEFAULT 'RESTOCK'
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
        p_order_id    IN NUMBER
    ) IS
    BEGIN
        INSERT INTO orders (order_id, customer_id, employee_id, total_amount)
        VALUES (p_order_id, p_customer_id, p_employee_id, 0);
    END create_order;

    PROCEDURE add_order_item(
        p_order_id   IN NUMBER,
        p_product_id IN NUMBER,
        p_qty        IN NUMBER
    ) IS
        v_stock  NUMBER;
        v_price  NUMBER;
        v_making NUMBER;
        v_unit   NUMBER;
    BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Quantity must be greater than 0.');
        END IF;

        -- FOR UPDATE locks the product row until commit, so two sellers cannot take the same last item
        SELECT stock_quantity, unit_price, NVL(making_charge, 0)
        INTO v_stock, v_price, v_making
        FROM products
        WHERE product_id = p_product_id
        FOR UPDATE;

        IF v_stock < p_qty THEN
            RAISE_APPLICATION_ERROR(-20001, 'Insufficient stock available.');
        END IF;

        -- price per piece = unit price + making charge
        v_unit := v_price + v_making;

        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (p_order_id, p_product_id, p_qty, v_unit);

        UPDATE products
        SET stock_quantity = stock_quantity - p_qty
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (p_product_id, 'SALE', -p_qty, 'Order #' || p_order_id);

        UPDATE orders
        SET total_amount = NVL(total_amount, 0) + (v_unit * p_qty)
        WHERE order_id = p_order_id;
    END add_order_item;

    PROCEDURE record_sale(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_order_id    OUT NUMBER
    ) IS
    BEGIN
        SELECT orders_seq.NEXTVAL INTO p_order_id FROM DUAL;
        create_order(p_customer_id, p_employee_id, p_order_id);
        add_order_item(p_order_id, p_product_id, p_qty);
        COMMIT;
    END record_sale;

    PROCEDURE restock_product(
        p_product_id IN NUMBER,
        p_qty        IN NUMBER,
        p_remarks    IN VARCHAR2 DEFAULT 'RESTOCK'
    ) IS
    BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Quantity must be greater than 0.');
        END IF;

        UPDATE products
        SET stock_quantity = stock_quantity + p_qty
        WHERE product_id = p_product_id;

        IF SQL%ROWCOUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20003, 'Product not found.');
        END IF;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (p_product_id, 'RESTOCK', p_qty, p_remarks);

        COMMIT;
    END restock_product;

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
SELECT employee_id, first_name, role, username FROM employees;
