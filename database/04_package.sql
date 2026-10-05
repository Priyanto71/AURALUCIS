-- =========================================================
-- AURALUCIS - 04: BUSINESS LOGIC PACKAGE (first version)
-- NOTE: 06_upgrade.sql replaces this package with the final version.
-- =========================================================
CREATE OR REPLACE PACKAGE pkg_jewelry AS
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

    PROCEDURE record_sale(
        p_customer_id IN NUMBER,
        p_employee_id IN NUMBER,
        p_product_id  IN NUMBER,
        p_qty         IN NUMBER,
        p_order_id    OUT NUMBER
    ) IS
        v_curr_stock NUMBER;
        v_unit_price NUMBER;
    BEGIN
        SELECT stock_quantity, unit_price 
        INTO v_curr_stock, v_unit_price
        FROM products 
        WHERE product_id = p_product_id;

        IF v_curr_stock < p_qty THEN
            RAISE_APPLICATION_ERROR(-20001, 'Insufficient stock available.');
        END IF;

        INSERT INTO orders (customer_id, employee_id, total_amount)
        VALUES (p_customer_id, p_employee_id, v_unit_price * p_qty)
        RETURNING order_id INTO p_order_id;

        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (p_order_id, p_product_id, p_qty, v_unit_price);

        UPDATE products 
        SET stock_quantity = stock_quantity - p_qty 
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (p_product_id, 'SALE', -p_qty, 'Order #' || p_order_id);

        COMMIT;
    END record_sale;

    PROCEDURE restock_product(
        p_product_id IN NUMBER,
        p_qty        IN NUMBER,
        p_remarks    IN VARCHAR2 DEFAULT 'RESTOCK'
    ) IS
    BEGIN
        UPDATE products 
        SET stock_quantity = stock_quantity + p_qty 
        WHERE product_id = p_product_id;

        INSERT INTO stock_transactions (product_id, txn_type, quantity, remarks)
        VALUES (p_product_id, 'RESTOCK', p_qty, p_remarks);

        COMMIT;
    END restock_product;

    PROCEDURE cancel_order(
        p_order_id IN NUMBER
    ) IS
    BEGIN
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
