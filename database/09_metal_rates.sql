-- =========================================================
-- AURALUCIS - 09: DAILY METAL RATES AND MAKING CHARGE IN PERCENT
-- Run ONCE, after 01-08, as the schema owner. Take a backup first.
--   * metal_rates: the gold/silver rate per gram, with history
--   * products.pricing_mode: FIXED (price typed in) or RATE (price = weight x today's rate)
--   * products.making_percent: making charge as a % of the price (empty = fixed amount)
--   * reprice_products / set_metal_rate: recalculate the prices when a rate changes
-- Prices stay stored in products.unit_price / making_charge, so sales and receipts work as before.
-- Orders already sold or on hold keep the price they were sold at.
-- =========================================================

-- 1. RATES
CREATE SEQUENCE metal_rates_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE metal_rates (
    rate_id       NUMBER(10) PRIMARY KEY,
    metal_type    VARCHAR2(50) NOT NULL,
    purity        VARCHAR2(20),
    rate_per_gram NUMBER(12,2) NOT NULL CHECK (rate_per_gram > 0),
    effective_from DATE DEFAULT SYSDATE NOT NULL,
    set_by        NUMBER(10) REFERENCES employees(employee_id)
);

CREATE OR REPLACE TRIGGER trg_metal_rates_bi
BEFORE INSERT ON metal_rates FOR EACH ROW
BEGIN
    IF :NEW.rate_id IS NULL THEN
        SELECT metal_rates_seq.NEXTVAL INTO :NEW.rate_id FROM DUAL;
    END IF;
END;
/

-- the newest rate of every metal + purity
CREATE OR REPLACE VIEW vw_current_rates AS
SELECT r.rate_id, r.metal_type, r.purity, r.rate_per_gram, r.effective_from, r.set_by
FROM metal_rates r
WHERE r.rate_id = (SELECT MAX(r2.rate_id)
                   FROM metal_rates r2
                   WHERE r2.metal_type = r.metal_type
                     AND NVL(r2.purity, '-') = NVL(r.purity, '-'));

-- 2. PRODUCT PRICING COLUMNS
ALTER TABLE products ADD (pricing_mode VARCHAR2(10) DEFAULT 'FIXED' NOT NULL, making_percent NUMBER(5,2));
ALTER TABLE products ADD CONSTRAINT chk_products_pricing CHECK (pricing_mode IN ('FIXED', 'RATE'));
ALTER TABLE products ADD CONSTRAINT chk_products_makpct CHECK (making_percent IS NULL OR (making_percent >= 0 AND making_percent <= 100));

CREATE OR REPLACE VIEW vw_product_catalog AS
SELECT 
    p.product_id,
    p.product_name,
    c.category_name,
    s.supplier_name,
    p.metal_type,
    p.purity,
    p.weight_grams,
    p.making_charge,
    p.unit_price,
    p.stock_quantity,
    (p.stock_quantity * p.unit_price) AS stock_value,
    p.cost_price,
    p.pricing_mode,
    p.making_percent
FROM products p
LEFT JOIN categories c ON p.category_id = c.category_id
LEFT JOIN suppliers s  ON p.supplier_id = s.supplier_id;

-- 3. REPRICING
-- RATE products:  unit_price = weight x current rate;  making_charge = % of that price (if a % is set)
-- FIXED products: making_charge = % of unit_price (only if a % is set)
-- With a product id it reprices that product (and refuses if no rate is set); without one it reprices all.
-- It does not commit: the caller does.
CREATE OR REPLACE PROCEDURE reprice_products(p_product_id IN NUMBER DEFAULT NULL) IS
    v_rate NUMBER;
BEGIN
    FOR p IN (SELECT product_id, metal_type, purity, weight_grams, unit_price, making_percent, pricing_mode
              FROM products
              WHERE (p_product_id IS NULL OR product_id = p_product_id)
                AND (pricing_mode = 'RATE' OR making_percent IS NOT NULL)) LOOP

        IF p.pricing_mode = 'RATE' THEN
            v_rate := NULL;
            BEGIN
                SELECT rate_per_gram INTO v_rate
                FROM vw_current_rates
                WHERE metal_type = p.metal_type
                  AND NVL(purity, '-') = NVL(p.purity, '-');
            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    IF p_product_id IS NOT NULL THEN
                        RAISE_APPLICATION_ERROR(-20017, 'No rate is set for ' || p.metal_type || ' ' || p.purity || '. Set the rate first (Rates tab).');
                    END IF;
            END;

            IF v_rate IS NOT NULL THEN
                UPDATE products
                SET unit_price = ROUND(weight_grams * v_rate, 2),
                    making_charge = CASE WHEN making_percent IS NOT NULL
                                         THEN ROUND(weight_grams * v_rate * making_percent / 100, 2)
                                         ELSE making_charge END
                WHERE product_id = p.product_id;
            END IF;
        ELSE
            UPDATE products
            SET making_charge = ROUND(unit_price * making_percent / 100, 2)
            WHERE product_id = p.product_id;
        END IF;
    END LOOP;
END reprice_products;
/

-- Saves today's rate (keeps the old ones as history) and reprices the products that use it.
CREATE OR REPLACE PROCEDURE set_metal_rate(
    p_metal       IN VARCHAR2,
    p_purity      IN VARCHAR2,
    p_rate        IN NUMBER,
    p_employee_id IN NUMBER
) IS
BEGIN
    IF p_metal IS NULL OR LENGTH(TRIM(p_metal)) = 0 THEN
        RAISE_APPLICATION_ERROR(-20019, 'The metal is required.');
    END IF;

    IF p_rate IS NULL OR p_rate <= 0 THEN
        RAISE_APPLICATION_ERROR(-20018, 'The rate must be greater than 0.');
    END IF;

    -- an empty purity is stored as NULL (Oracle treats '' as NULL)
    INSERT INTO metal_rates (metal_type, purity, rate_per_gram, set_by)
    VALUES (TRIM(p_metal), TRIM(p_purity), ROUND(p_rate, 2), p_employee_id);

    FOR p IN (SELECT product_id
              FROM products
              WHERE pricing_mode = 'RATE'
                AND metal_type = TRIM(p_metal)
                AND NVL(purity, '-') = NVL(TRIM(p_purity), '-')) LOOP
        reprice_products(p.product_id);
    END LOOP;

    COMMIT;
END set_metal_rate;
/

SHOW ERRORS
SELECT metal_type, purity, rate_per_gram FROM vw_current_rates;
SELECT product_id, product_name, pricing_mode, making_percent FROM products;
