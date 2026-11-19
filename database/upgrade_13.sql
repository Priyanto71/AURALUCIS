-- AURALUCIS: upgrade existing database from version 12 to 13.
-- Run ONCE as the AURALUCIS schema owner.
-- BACK UP THE DATABASE BEFORE RUNNING.
-- Do NOT run install_all.sql on an existing database.

SET DEFINE OFF
SET ECHO ON
SET SERVEROUTPUT ON SIZE 100000
WHENEVER SQLERROR EXIT SQL.SQLCODE

SPOOL upgrade_13_log.txt

PROMPT ===== Pre-upgrade verification =====

DECLARE
    v_missing NUMBER := 0;
    v_existing NUMBER := 0;
    v_existing_columns NUMBER := 0;

    PROCEDURE need_table(p_name VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v FROM user_tables
        WHERE table_name = UPPER(p_name);
        IF v = 0 THEN
            DBMS_OUTPUT.PUT_LINE('MISSING VERSION 12 TABLE: ' || p_name);
            v_missing := v_missing + 1;
        END IF;
    END;

    PROCEDURE need_column(p_table VARCHAR2, p_column VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v FROM user_tab_columns
        WHERE table_name = UPPER(p_table)
          AND column_name = UPPER(p_column);
        IF v = 0 THEN
            DBMS_OUTPUT.PUT_LINE('MISSING VERSION 12 COLUMN: ' || p_table || '.' || p_column);
            v_missing := v_missing + 1;
        END IF;
    END;

    PROCEDURE must_not_exist(p_type VARCHAR2, p_name VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v FROM user_objects
        WHERE object_type = UPPER(p_type)
          AND object_name = UPPER(p_name);
        IF v > 0 THEN
            DBMS_OUTPUT.PUT_LINE('VERSION 13 OBJECT ALREADY EXISTS: ' || p_type || ' ' || p_name);
            v_existing := v_existing + 1;
        END IF;
    END;

    PROCEDURE must_not_exist_constraint(p_name VARCHAR2) IS
        v NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v FROM user_constraints
        WHERE constraint_name = UPPER(p_name);
        IF v > 0 THEN
            DBMS_OUTPUT.PUT_LINE('VERSION 13 CONSTRAINT ALREADY EXISTS: ' || p_name);
            v_existing := v_existing + 1;
        END IF;
    END;
BEGIN
    -- Essential existing tables.
    need_table('PRODUCTS');
    need_table('CUSTOMERS');
    need_table('EMPLOYEES');
    need_table('ORDERS');
    need_table('ORDER_PAYMENTS');

    -- Existing ID columns required by version 13 foreign keys.
    need_column('CUSTOMERS', 'CUSTOMER_ID');
    need_column('EMPLOYEES', 'EMPLOYEE_ID');
    need_column('ORDERS', 'ORDER_ID');

    -- Version 12 product columns.
    need_column('PRODUCTS', 'DESCRIPTION');
    need_column('PRODUCTS', 'IMAGE_URL');
    need_column('PRODUCTS', 'IS_PUBLISHED');

    -- Version 12 employee columns.
    need_column('EMPLOYEES', 'PASSWORD_RESET_TOKEN');
    need_column('EMPLOYEES', 'PASSWORD_RESET_EXPIRES');
    need_column('EMPLOYEES', 'MUST_CHANGE_PASSWORD');

    -- Version 13 must not have been partially or fully applied.
    must_not_exist('TABLE', 'OLD_GOLD_TRANSACTIONS');
    must_not_exist('TABLE', 'SERVICE_JOBS');
    must_not_exist('TABLE', 'SERVICE_JOB_PAYMENTS');
    must_not_exist('SEQUENCE', 'OLD_GOLD_SEQ');
    must_not_exist('SEQUENCE', 'SERVICE_JOBS_SEQ');
    must_not_exist('SEQUENCE', 'SERVICE_JOB_PAY_SEQ');
    must_not_exist('INDEX', 'UX_PRODUCTS_SKU_CI');
    must_not_exist('INDEX', 'UX_PRODUCTS_BARCODE_CI');
    must_not_exist('TRIGGER', 'TRG_OLD_GOLD_BI');
    must_not_exist('TRIGGER', 'TRG_SERVICE_JOBS_BI');
    must_not_exist('TRIGGER', 'TRG_SERVICE_JOBS_BU');
    must_not_exist('TRIGGER', 'TRG_SERVICE_JOB_PAY_BI');

    must_not_exist('INDEX', 'IX_OLD_GOLD_CUSTOMER');
    must_not_exist('INDEX', 'IX_OLD_GOLD_DATE');
    must_not_exist('INDEX', 'IX_OLD_GOLD_ORDER');
    must_not_exist('INDEX', 'IX_SERVICE_JOBS_CUSTOMER');
    must_not_exist('INDEX', 'IX_SERVICE_JOBS_STATUS');
    must_not_exist('INDEX', 'IX_SERVICE_JOB_PAYMENTS_JOB');

    must_not_exist_constraint('CHK_OLD_GOLD_TYPE');
    must_not_exist_constraint('CHK_OLD_GOLD_WEIGHTS');
    must_not_exist_constraint('CHK_OLD_GOLD_VALUES');
    must_not_exist_constraint('CHK_OLD_GOLD_SETTLEMENT');
    must_not_exist_constraint('CHK_OLD_GOLD_STATUS');
    must_not_exist_constraint('CHK_SERVICE_JOB_TYPE');
    must_not_exist_constraint('CHK_SERVICE_JOB_STATUS');
    must_not_exist_constraint('CHK_SERVICE_JOB_AMOUNTS');
    must_not_exist_constraint('CHK_SERVICE_JOB_WEIGHT');
    must_not_exist_constraint('CHK_SERVICE_JOB_DATES');
    must_not_exist_constraint('CHK_SERVICE_PAY_AMOUNT');
    must_not_exist_constraint('CHK_SERVICE_PAY_METHOD');

    SELECT COUNT(*) INTO v_existing_columns
    FROM user_tab_columns
    WHERE table_name = 'PRODUCTS'
      AND column_name IN (
        'SKU', 'BARCODE', 'HALLMARK_NUMBER', 'HALLMARK_DETAILS',
        'CERTIFICATE_NUMBER', 'CERTIFICATE_ISSUER', 'CERTIFICATE_DATE'
      );

    IF v_existing_columns > 0 THEN
        DBMS_OUTPUT.PUT_LINE('VERSION 13 PRODUCT COLUMNS ALREADY EXIST: ' || v_existing_columns);
        v_existing := v_existing + v_existing_columns;
    END IF;

    IF v_missing > 0 OR v_existing > 0 THEN
        RAISE_APPLICATION_ERROR(
            -20014,
            'Pre-upgrade checks failed. Missing version 12 prerequisites: '
            || v_missing || '; existing version 13 objects/columns: ' || v_existing
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE('Pre-upgrade checks passed. Version 12 detected; version 13 not detected.');
END;
/

SELECT COUNT(*) AS existing_products FROM products;
SELECT COUNT(*) AS existing_customers FROM customers;
SELECT COUNT(*) AS existing_orders FROM orders;

PROMPT ===== Apply migration 13 =====
@@13_missing_features.sql

PROMPT ===== Verify installation =====
@@check_install.sql

PROMPT ===== Upgrade 13 completed and verified =====
SPOOL OFF
EXIT SUCCESS



