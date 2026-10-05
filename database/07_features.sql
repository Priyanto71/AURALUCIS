-- =========================================================
-- AURALUCIS - 07: FEATURES UPGRADE (run ONCE, after 01-06, as the schema owner)
--   * employees.is_active  (disable a login without deleting the employee)
--   * Pending orders: stock is reserved, the order is completed or cancelled later
--   * pkg_jewelry final version: create_order(status), complete_order
-- =========================================================

-- 1. EMPLOYEE ACTIVE FLAG (1 = active, 0 = disabled)
ALTER TABLE employees ADD (is_active NUMBER(1) DEFAULT 1 NOT NULL);
ALTER TABLE employees ADD CONSTRAINT chk_employees_active CHECK (is_active IN (0, 1));

-- 2. FINAL PACKAGE
CREATE OR REPLACE PACKAGE pkg_jewelry AS
    -- p_status is 'Completed' (paid) or 'Pending' (held: stock is reserved)
    PROCEDURE create_order(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_order_id    IN NUMBER,
        p_status      IN VARCHAR2 DEFAULT 'Completed'
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

    -- Pending -> Completed
    PROCEDURE complete_order(
        p_order_id IN NUMBER
    );

    -- Completed or Pending -> Cancelled (stock is returned)
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
        p_status      IN VARCHAR2 DEFAULT 'Completed'
    ) IS
    BEGIN
        IF p_status IS NULL OR p_status NOT IN ('Completed', 'Pending') THEN
            RAISE_APPLICATION_ERROR(-20006, 'Invalid order status.');
        END IF;

        INSERT INTO orders (order_id, customer_id, employee_id, status, total_amount)
        VALUES (p_order_id, p_customer_id, p_employee_id, p_status, 0);
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
        create_order(p_customer_id, p_employee_id, p_order_id, 'Completed');
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
SELECT employee_id, first_name, role, username, is_active FROM employees;
