-- =========================================================
-- AURALUCIS - 05: INITIAL SEED DATA
-- =========================================================
INSERT INTO categories (category_name, description) VALUES ('Rings', 'Gold and diamond rings');
INSERT INTO categories (category_name, description) VALUES ('Necklaces', 'Heavy and light neckwear');

INSERT INTO suppliers (supplier_name, contact_person, phone, email, address) 
VALUES ('Royal Gold Wholesalers', 'Rajesh Sharma', '+1234567890', 'rajesh@royalgold.com', '12 Jewellers Hub');

INSERT INTO products (product_name, category_id, supplier_id, metal_type, purity, weight_grams, making_charge, unit_price, stock_quantity)
VALUES ('22K Gold Bridal Ring', 1, 1001, 'Gold', '22K', 8.500, 1200.00, 650.00, 10);

INSERT INTO customers (first_name, last_name, phone, email, address) 
VALUES ('John', 'Doe', '+1555000111', 'john.doe@email.com', '123 Main St');

INSERT INTO employees (first_name, last_name, role, phone, email) 
VALUES ('Sarah', 'Jenkins', 'Manager', '+1555999888', 'sarah.j@store.com');

COMMIT;
