-- =========================================================
-- AURALUCIS: install check. Run as the schema owner, any time:  @C:\AURALUCIS\database\check_install.sql
-- It lists everything that is missing or invalid. "ALL GOOD" means versions 1 to 13 are installed correctly.
-- =========================================================
SET SERVEROUTPUT ON SIZE 100000
SET FEEDBACK OFF

DECLARE
    v_problems NUMBER := 0;
    v_payment_constraint NUMBER := 0;
    v_table_ddl CLOB;

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

    PROCEDURE con(p_table IN VARCHAR2, p_name IN VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v
        FROM user_constraints
        WHERE table_name = UPPER(p_table)
          AND constraint_name = UPPER(p_name)
          AND constraint_type = 'C'
          AND status = 'ENABLED';

        IF v = 0 THEN
            DBMS_OUTPUT.PUT_LINE(
                'MISSING or DISABLED constraint ' || p_table || '.' || p_name
            );
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
    chk('TABLE', 'old_gold_transactions');
    chk('TABLE', 'service_jobs');   chk('TABLE', 'service_job_payments');

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
    col('employees', 'password_reset_token');
    col('employees', 'must_change_password');
    col('products', 'sku'); col('products', 'barcode');
    col('products', 'hallmark_number'); col('products', 'hallmark_details');
    col('products', 'certificate_number'); col('products', 'certificate_issuer');
    col('products', 'certificate_date');

    -- Migration 13: old-gold transaction columns
    col('old_gold_transactions', 'transaction_id');
    col('old_gold_transactions', 'customer_id');
    col('old_gold_transactions', 'employee_id');
    col('old_gold_transactions', 'txn_type');
    col('old_gold_transactions', 'metal_type');
    col('old_gold_transactions', 'purity');
    col('old_gold_transactions', 'gross_weight');
    col('old_gold_transactions', 'stone_weight');
    col('old_gold_transactions', 'net_weight');
    col('old_gold_transactions', 'rate_per_gram');
    col('old_gold_transactions', 'valuation_amount');
    col('old_gold_transactions', 'settlement_method');
    col('old_gold_transactions', 'payout_reference');
    col('old_gold_transactions', 'linked_order_id');
    col('old_gold_transactions', 'txn_date');
    col('old_gold_transactions', 'status');
    col('old_gold_transactions', 'notes');

    -- Migration 13: service-job columns
    col('service_jobs', 'job_id');
    col('service_jobs', 'job_number');
    col('service_jobs', 'customer_id');
    col('service_jobs', 'employee_id');
    col('service_jobs', 'job_type');
    col('service_jobs', 'description');
    col('service_jobs', 'metal_type');
    col('service_jobs', 'purity');
    col('service_jobs', 'weight_grams');
    col('service_jobs', 'status');
    col('service_jobs', 'estimated_charge');
    col('service_jobs', 'final_charge');
    col('service_jobs', 'received_at');
    col('service_jobs', 'due_date');
    col('service_jobs', 'completed_at');
    col('service_jobs', 'delivered_at');
    col('service_jobs', 'notes');
    col('service_jobs', 'created_at');
    col('service_jobs', 'updated_at');

    -- Migration 13: service-job payment columns
    col('service_job_payments', 'payment_id');
    col('service_job_payments', 'job_id');
    col('service_job_payments', 'amount');
    col('service_job_payments', 'method');
    col('service_job_payments', 'paid_at');
    col('service_job_payments', 'received_by');
    col('service_job_payments', 'note');

    -- Migration 13: verify all new check constraints are enabled
    con('old_gold_transactions', 'chk_old_gold_type');
    con('old_gold_transactions', 'chk_old_gold_weights');
    con('old_gold_transactions', 'chk_old_gold_values');
    con('old_gold_transactions', 'chk_old_gold_settlement');
    con('old_gold_transactions', 'chk_old_gold_status');

    con('service_jobs', 'chk_service_job_type');
    con('service_jobs', 'chk_service_job_status');
    con('service_jobs', 'chk_service_job_amounts');
    con('service_jobs', 'chk_service_job_weight');
    con('service_jobs', 'chk_service_job_dates');

    con('service_job_payments', 'chk_service_pay_amount');
    con('service_job_payments', 'chk_service_pay_method');
    -- Order payments must support Exchange credits.
    SELECT COUNT(*)
    INTO v_payment_constraint
    FROM user_constraints
    WHERE table_name = 'ORDER_PAYMENTS'
      AND constraint_name = 'CHK_PAYMENT_METHOD'
      AND constraint_type = 'C'
      AND status = 'ENABLED';

    IF v_payment_constraint = 0 THEN
        DBMS_OUTPUT.PUT_LINE(
            'MISSING or DISABLED order_payments constraint CHK_PAYMENT_METHOD'
        );
        v_problems := v_problems + 1;
    ELSE
        SELECT DBMS_METADATA.GET_DDL('TABLE', 'ORDER_PAYMENTS')
        INTO v_table_ddl
        FROM dual;

        IF DBMS_LOB.INSTR(UPPER(v_table_ddl), '''EXCHANGE''') = 0 THEN
            DBMS_OUTPUT.PUT_LINE(
                'INVALID order_payments constraint: Exchange is not allowed'
            );
            v_problems := v_problems + 1;
        END IF;
    END IF;
    -- anything that failed to compile
    FOR r IN (SELECT object_type, object_name FROM user_objects WHERE status = 'INVALID') LOOP
        DBMS_OUTPUT.PUT_LINE('INVALID  ' || r.object_type || ' ' || r.object_name || '  (run: SHOW ERRORS ' || r.object_type || ' ' || r.object_name || ')');
        v_problems := v_problems + 1;
    END LOOP;

        -- Migration 13 sequences, triggers and indexes
    chk('SEQUENCE', 'old_gold_seq');
    chk('SEQUENCE', 'service_jobs_seq');
    chk('SEQUENCE', 'service_job_pay_seq');
    chk('TRIGGER', 'trg_old_gold_bi');
    chk('TRIGGER', 'trg_service_jobs_bi');
    chk('TRIGGER', 'trg_service_jobs_bu');
    chk('TRIGGER', 'trg_service_job_pay_bi');
    chk('INDEX', 'ux_products_sku_ci');
    chk('INDEX', 'ux_products_barcode_ci');
    chk('INDEX', 'ix_old_gold_customer');
    chk('INDEX', 'ix_old_gold_date');
    chk('INDEX', 'ix_old_gold_order');
    chk('INDEX', 'ix_service_jobs_customer');
    chk('INDEX', 'ix_service_jobs_status');
    chk('INDEX', 'ix_service_job_payments_job');

    IF v_problems = 0 THEN
        DBMS_OUTPUT.PUT_LINE('ALL GOOD: required tables, views, packages and columns of versions 1 to 13 are installed.');
    ELSE
        DBMS_OUTPUT.PUT_LINE(v_problems || ' problem(s) found. Send me the lines above.');
        RAISE_APPLICATION_ERROR(-20013, 'AURALUCIS installation verification failed.');
    END IF;
END;
/

-- provisioned employee accounts and shop settings
SELECT username, role, is_active FROM employees WHERE username IS NOT NULL;
SELECT setting_key, setting_value FROM shop_settings;
SET FEEDBACK ON
