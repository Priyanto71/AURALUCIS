-- =========================================================
-- AURALUCIS - 12: OWNER, PUBLIC CATALOGUE AND PASSWORD RECOVERY
-- Run ONCE after migration 11, as the schema owner.
-- Account creation is handled separately by the local bootstrap command.
-- This migration never creates, renames or resets employee accounts.
-- =========================================================

ALTER TABLE products ADD (
    description CLOB,
    image_url VARCHAR2(1000),
    is_published NUMBER(1) DEFAULT 0 NOT NULL
);

ALTER TABLE employees ADD (
    password_reset_token VARCHAR2(64),
    password_reset_expires DATE,
    must_change_password NUMBER(1) DEFAULT 0 NOT NULL
);

COMMIT;

PROMPT Version 12 schema changes applied.
