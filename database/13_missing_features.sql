-- =========================================================
-- AURALUCIS 13: PRODUCT IDENTIFICATION, OLD GOLD, SERVICE JOBS
-- Oracle 10g XE compatible. Run once after migration 12.
-- Run as the AURALUCIS schema owner.
-- =========================================================

-- 1. PRODUCT IDENTIFICATION
ALTER TABLE products ADD (
    sku                 VARCHAR2(50),
    barcode             VARCHAR2(100),
    hallmark_number     VARCHAR2(100),
    hallmark_details    VARCHAR2(500),
    certificate_number  VARCHAR2(100),
    certificate_issuer  VARCHAR2(150),
    certificate_date    DATE
);

CREATE UNIQUE INDEX ux_products_sku_ci
    ON products (UPPER(TRIM(sku)));

CREATE UNIQUE INDEX ux_products_barcode_ci
    ON products (UPPER(TRIM(barcode)));

-- 2. OLD-GOLD BUYBACK AND EXCHANGE LEDGER
CREATE SEQUENCE old_gold_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE old_gold_transactions (
    transaction_id    NUMBER(10) PRIMARY KEY,
    customer_id       NUMBER(10) REFERENCES customers(customer_id),
    employee_id       NUMBER(10) NOT NULL REFERENCES employees(employee_id),
    txn_type          VARCHAR2(10) NOT NULL,
    metal_type        VARCHAR2(50) NOT NULL,
    purity            VARCHAR2(20) NOT NULL,
    gross_weight      NUMBER(10,3) NOT NULL,
    stone_weight      NUMBER(10,3) DEFAULT 0 NOT NULL,
    net_weight        NUMBER(10,3) NOT NULL,
    rate_per_gram     NUMBER(12,2) NOT NULL,
    valuation_amount  NUMBER(12,2) NOT NULL,
    settlement_method VARCHAR2(20) NOT NULL,
    payout_reference  VARCHAR2(100),
    linked_order_id   NUMBER(10) REFERENCES orders(order_id),
    txn_date          DATE DEFAULT SYSDATE NOT NULL,
    status            VARCHAR2(12) DEFAULT 'COMPLETED' NOT NULL,
    notes             VARCHAR2(500),

    CONSTRAINT chk_old_gold_type
        CHECK (txn_type IN ('BUYBACK', 'EXCHANGE')),

    CONSTRAINT chk_old_gold_weights
        CHECK (
            gross_weight > 0
            AND stone_weight >= 0
            AND stone_weight <= gross_weight
            AND net_weight > 0
            AND net_weight = gross_weight - stone_weight
        ),

    CONSTRAINT chk_old_gold_values
        CHECK (rate_per_gram > 0 AND valuation_amount > 0),

    CONSTRAINT chk_old_gold_settlement
        CHECK (
            (txn_type = 'BUYBACK'
                AND settlement_method IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank')
                AND linked_order_id IS NULL)
            OR
            (txn_type = 'EXCHANGE'
                AND settlement_method = 'Exchange'
                AND linked_order_id IS NOT NULL)
        ),

    CONSTRAINT chk_old_gold_status
        CHECK (status IN ('COMPLETED', 'VOIDED'))
);

CREATE OR REPLACE TRIGGER trg_old_gold_bi
BEFORE INSERT ON old_gold_transactions
FOR EACH ROW
BEGIN
    IF :NEW.transaction_id IS NULL THEN
        SELECT old_gold_seq.NEXTVAL
        INTO :NEW.transaction_id
        FROM DUAL;
    END IF;
END;
/

CREATE INDEX ix_old_gold_customer
    ON old_gold_transactions(customer_id, txn_date);

CREATE INDEX ix_old_gold_date
    ON old_gold_transactions(txn_date);

CREATE INDEX ix_old_gold_order
    ON old_gold_transactions(linked_order_id);

-- 3. CUSTOM ORDERS AND REPAIR JOBS
CREATE SEQUENCE service_jobs_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE service_jobs (
    job_id           NUMBER(10) PRIMARY KEY,
    job_number       VARCHAR2(30) NOT NULL UNIQUE,
    customer_id      NUMBER(10) NOT NULL REFERENCES customers(customer_id),
    employee_id      NUMBER(10) NOT NULL REFERENCES employees(employee_id),
    job_type         VARCHAR2(20) NOT NULL,
    description      VARCHAR2(1000) NOT NULL,
    metal_type       VARCHAR2(50),
    purity           VARCHAR2(20),
    weight_grams     NUMBER(10,3),
    received_at      DATE DEFAULT SYSDATE NOT NULL,
    due_date         DATE,
    completed_at     DATE,
    delivered_at     DATE,
    status           VARCHAR2(20) DEFAULT 'RECEIVED' NOT NULL,
    estimated_charge NUMBER(12,2) DEFAULT 0 NOT NULL,
    final_charge     NUMBER(12,2),
    notes            VARCHAR2(1000),
    created_at       DATE DEFAULT SYSDATE NOT NULL,
    updated_at       DATE DEFAULT SYSDATE NOT NULL,

    CONSTRAINT chk_service_job_type
        CHECK (job_type IN ('CUSTOM_ORDER', 'REPAIR')),

    CONSTRAINT chk_service_job_status
        CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED')),

    CONSTRAINT chk_service_job_amounts
        CHECK (
            estimated_charge >= 0
            AND (final_charge IS NULL OR final_charge >= 0)
        ),

    CONSTRAINT chk_service_job_weight
        CHECK (weight_grams IS NULL OR weight_grams > 0),

    CONSTRAINT chk_service_job_dates
        CHECK (
            due_date IS NULL OR TRUNC(due_date) >= TRUNC(received_at)
        )
);

CREATE OR REPLACE TRIGGER trg_service_jobs_bi
BEFORE INSERT ON service_jobs
FOR EACH ROW
BEGIN
    IF :NEW.job_id IS NULL THEN
        SELECT service_jobs_seq.NEXTVAL
        INTO :NEW.job_id
        FROM DUAL;
    END IF;

    IF :NEW.job_number IS NULL THEN
        :NEW.job_number := 'JOB-' || TO_CHAR(:NEW.job_id, 'FM0000000');
    END IF;

    IF :NEW.created_at IS NULL THEN
        :NEW.created_at := SYSDATE;
    END IF;

    IF :NEW.received_at IS NULL THEN
        :NEW.received_at := SYSDATE;
    END IF;

    :NEW.updated_at := SYSDATE;
END;
/

CREATE OR REPLACE TRIGGER trg_service_jobs_bu
BEFORE UPDATE ON service_jobs
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSDATE;
END;
/

CREATE INDEX ix_service_jobs_customer
    ON service_jobs(customer_id, received_at);

CREATE INDEX ix_service_jobs_status
    ON service_jobs(status, due_date);

-- 4. SERVICE JOB PAYMENT LEDGER
CREATE SEQUENCE service_job_pay_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE service_job_payments (
    payment_id  NUMBER(10) PRIMARY KEY,
    job_id      NUMBER(10) NOT NULL REFERENCES service_jobs(job_id),
    amount      NUMBER(12,2) NOT NULL,
    method      VARCHAR2(20) NOT NULL,
    paid_at     DATE DEFAULT SYSDATE NOT NULL,
    received_by NUMBER(10) NOT NULL REFERENCES employees(employee_id),
    note        VARCHAR2(255),

    CONSTRAINT chk_service_pay_amount CHECK (amount > 0),
    CONSTRAINT chk_service_pay_method
        CHECK (method IN ('Cash', 'Card', 'bKash', 'Nagad', 'Bank'))
);

CREATE OR REPLACE TRIGGER trg_service_job_pay_bi
BEFORE INSERT ON service_job_payments
FOR EACH ROW
BEGIN
    IF :NEW.payment_id IS NULL THEN
        SELECT service_job_pay_seq.NEXTVAL
        INTO :NEW.payment_id
        FROM DUAL;
    END IF;
END;
/

CREATE INDEX ix_service_job_payments_job
    ON service_job_payments(job_id, paid_at);
-- Verify the existing Exchange-compatible payment constraint.
DECLARE
    v_count NUMBER := 0;
    v_table_ddl CLOB;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM user_constraints
    WHERE table_name = 'ORDER_PAYMENTS'
      AND constraint_name = 'CHK_PAYMENT_METHOD'
      AND constraint_type = 'C'
      AND status = 'ENABLED';

    IF v_count = 0 THEN
        RAISE_APPLICATION_ERROR(
            -20016,
            'CHK_PAYMENT_METHOD is missing or disabled. Migration stopped.'
        );
    END IF;

    SELECT DBMS_METADATA.GET_DDL('TABLE', 'ORDER_PAYMENTS')
    INTO v_table_ddl
    FROM dual;

    IF DBMS_LOB.INSTR(UPPER(v_table_ddl), '''EXCHANGE''') = 0 THEN
        RAISE_APPLICATION_ERROR(
            -20017,
            'CHK_PAYMENT_METHOD does not appear to allow Exchange. Migration stopped.'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Order payment method constraint verified; no constraints dropped.'
    );
END;
/

COMMIT;

PROMPT AURALUCIS migration 13 completed.


