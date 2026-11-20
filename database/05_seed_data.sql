-- =========================================================
-- AURALUCIS - 05: INITIAL SEED DATA
-- =========================================================
INSERT INTO categories (category_name, description) VALUES ('Rings', 'Gold and diamond rings');
INSERT INTO categories (category_name, description) VALUES ('Necklaces', 'Heavy and light neckwear');

INSERT INTO suppliers (supplier_name, contact_person, phone, email, address) 
VALUES ('Example Supplier', 'Sample Contact', NULL, 'supplier@example.com', 'Example Business Address');

INSERT INTO products (product_name, category_id, supplier_id, metal_type, purity, weight_grams, making_charge, unit_price, stock_quantity)
VALUES ('22K Gold Bridal Ring', 1, 1001, 'Gold', '22K', 8.500, 1200.00, 650.00, 10);

INSERT INTO customers (first_name, last_name, phone, email, address) 
VALUES ('Sample', 'Customer', NULL, 'customer@example.com', NULL);

INSERT INTO employees (first_name, last_name, role, phone, email) 
VALUES ('Demo', 'Manager', 'Manager', NULL, 'manager@example.com');

COMMIT;
