-- =========================================================
-- AURALUCIS - 03: VIEWS
-- =========================================================
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
    (p.stock_quantity * p.unit_price) AS stock_value
FROM products p
LEFT JOIN categories c ON p.category_id = c.category_id
LEFT JOIN suppliers s  ON p.supplier_id = s.supplier_id;

CREATE OR REPLACE VIEW vw_order_summary AS
SELECT 
    o.order_id,
    o.order_date,
    o.status,
    cust.first_name || ' ' || cust.last_name AS customer_name,
    emp.first_name || ' ' || emp.last_name   AS employee_name,
    o.total_amount AS order_total,
    NVL(COUNT(oi.item_id), 0) AS item_count
FROM orders o
LEFT JOIN customers cust ON o.customer_id = cust.customer_id
LEFT JOIN employees emp  ON o.employee_id = emp.employee_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.order_date, o.status, cust.first_name, cust.last_name, emp.first_name, emp.last_name, o.total_amount;
