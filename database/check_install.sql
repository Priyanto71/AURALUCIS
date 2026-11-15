-- =========================================================
-- AURALUCIS: install check. Run as the schema owner, any time:  @C:\AURALUCIS\database\check_install.sql
-- It lists everything that is missing or invalid. "ALL GOOD" means versions 1 to 11 are installed correctly.
-- =========================================================
SET SERVEROUTPUT ON SIZE 100000
SET FEEDBACK OFF

DECLARE
    v_problems NUMBER := 0;

    PROCEDURE chk(p_type IN VARCHAR2, p_name IN VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v FROM user_objects
        WHERE object_type = p_type AND object_name = UPPER(p_name);
        IF v = 0 THEN
            DBMS_OUTPUT.PUT_LINE('MISSING  ' || p_type || ' ' || p_name);
            v_problems := v_problems + 1;
        END IF;
    END;

    PROCEDURE col(p_table IN VARCHAR2, p_column IN VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v FROM user_tab_columns
        WHERE table_name = UPPER(p_table) AND column_name = UPPER(p_column);
        IF v = 0 THEN
            DBMS_OUTPUT.PUT_LINE('MISSING  column ' || p_table || '.' || p_column);
            v_problems := v_problems + 1;
        END IF;
    END;
BEGIN
    -- tables (01, 08, 09, 10)
    chk('TABLE', 'categories');        chk('TABLE', 'suppliers');       chk('TABLE', 'products');
    chk('TABLE', 'customers');         chk('TABLE', 'employees');       chk('TABLE', 'orders');
    chk('TABLE', 'order_items');       chk('TABLE', 'stock_transactions');
    chk('TABLE', 'order_payments');    chk('TABLE', 'shop_settings');   chk('TABLE', 'audit_log');
    chk('TABLE', 'metal_rates');       chk('TABLE', 'order_returns');   chk('TABLE', 'order_return_items');
    chk('TABLE', 'purchases');         chk('TABLE', 'purchase_items');  chk('TABLE', 'purchase_payments');

    -- views, packages, procedures
    chk('VIEW', 'vw_product_catalog'); chk('VIEW', 'vw_order_summary'); chk('VIEW', 'vw_current_rates');   chk('VIEW', 'vw_purchase_summary');
    chk('PACKAGE', 'pkg_jewelry');     chk('PACKAGE BODY', 'pkg_jewelry');
    chk('PACKAGE', 'pkg_returns');     chk('PACKAGE BODY', 'pkg_returns');
    chk('PACKAGE', 'pkg_purchases');   chk('PACKAGE BODY', 'pkg_purchases');
    chk('PROCEDURE', 'reprice_products'); chk('PROCEDURE', 'set_metal_rate');

    -- columns added by the upgrade scripts
    col('employees', 'username');          col('employees', 'password_hash');   col('employees', 'is_active');
    col('orders', 'discount_amount');      col('orders', 'vat_percent');        col('orders', 'vat_amount');
    col('orders', 'paid_amount');          col('orders', 'public_code');        col('orders', 'returned_amount');
    col('orders', 'returned_discount');    col('orders', 'returned_vat');
    col('order_items', 'cost_price');      col('order_items', 'returned_qty');
    col('products', 'cost_price');         col('products', 'pricing_mode');     col('products', 'making_percent');
    col('stock_transactions', 'unit_cost'); col('stock_transactions', 'supplier_id');

    -- anything that failed to compile
    FOR r IN (SELECT object_type, object_name FROM user_objects WHERE status = 'INVALID') LOOP
        DBMS_OUTPUT.PUT_LINE('INVALID  ' || r.object_type || ' ' || r.object_name || '  (run: SHOW ERRORS ' || r.object_type || ' ' || r.object_name || ')');
        v_problems := v_problems + 1;
    END LOOP;

    IF v_problems = 0 THEN
        DBMS_OUTPUT.PUT_LINE('ALL GOOD: every table, view, package and column of versions 1 to 11 is installed.');
    ELSE
        DBMS_OUTPUT.PUT_LINE(v_problems || ' problem(s) found. Send me the lines above.');
    END IF;
END;
/

-- the demo logins and shop settings
SELECT username, role, is_active FROM employees WHERE username IS NOT NULL;
SELECT setting_key, setting_value FROM shop_settings;
SET FEEDBACK ON
