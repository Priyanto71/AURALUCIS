-- =========================================================
-- AURALUCIS - 01: SEQUENCES AND CORE TABLES (Oracle 10g)
-- =========================================================
CREATE SEQUENCE categories_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE suppliers_seq START WITH 1001 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE products_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE customers_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE employees_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE orders_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE order_items_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE stock_txn_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE categories (
    category_id   NUMBER(10) PRIMARY KEY,
    category_name VARCHAR2(100) NOT NULL UNIQUE,
    description   VARCHAR2(255)
);

CREATE TABLE suppliers (
    supplier_id    NUMBER(10) PRIMARY KEY,
    supplier_name  VARCHAR2(150) NOT NULL,
    contact_person VARCHAR2(100),
    phone          VARCHAR2(20),
    email          VARCHAR2(100),
    address        VARCHAR2(255)
);

CREATE TABLE products (
    product_id     NUMBER(10) PRIMARY KEY,
    product_name   VARCHAR2(150) NOT NULL,
    category_id    NUMBER(10) REFERENCES categories(category_id),
    supplier_id    NUMBER(10) REFERENCES suppliers(supplier_id),
    metal_type     VARCHAR2(50) NOT NULL,
    purity         VARCHAR2(20),
    weight_grams   NUMBER(10,3) NOT NULL,
    making_charge  NUMBER(10,2) DEFAULT 0,
    unit_price     NUMBER(12,2) NOT NULL,
    stock_quantity NUMBER(10) DEFAULT 0 CHECK (stock_quantity >= 0)
);

CREATE TABLE customers (
    customer_id NUMBER(10) PRIMARY KEY,
    first_name  VARCHAR2(100) NOT NULL,
    last_name   VARCHAR2(100) NOT NULL,
    phone       VARCHAR2(20) UNIQUE,
    email       VARCHAR2(100),
    address     VARCHAR2(255)
);

CREATE TABLE employees (
    employee_id NUMBER(10) PRIMARY KEY,
    first_name  VARCHAR2(100) NOT NULL,
    last_name   VARCHAR2(100) NOT NULL,
    role        VARCHAR2(50) NOT NULL,
    phone       VARCHAR2(20),
    email       VARCHAR2(100) UNIQUE
);

CREATE TABLE orders (
    order_id     NUMBER(10) PRIMARY KEY,
    customer_id  NUMBER(10) REFERENCES customers(customer_id),
    employee_id  NUMBER(10) REFERENCES employees(employee_id),
    order_date   DATE DEFAULT SYSDATE NOT NULL,
    status       VARCHAR2(30) DEFAULT 'Completed' CHECK (status IN ('Completed', 'Cancelled', 'Pending')),
    total_amount NUMBER(12,2) DEFAULT 0
);

CREATE TABLE order_items (
    item_id    NUMBER(10) PRIMARY KEY,
    order_id   NUMBER(10) REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id NUMBER(10) REFERENCES products(product_id),
    quantity   NUMBER(10) NOT NULL CHECK (quantity > 0),
    unit_price NUMBER(12,2) NOT NULL,
    line_total NUMBER(12,2)
);

CREATE TABLE stock_transactions (
    txn_id     NUMBER(10) PRIMARY KEY,
    product_id NUMBER(10) REFERENCES products(product_id),
    txn_type   VARCHAR2(20) CHECK (txn_type IN ('SALE', 'RESTOCK', 'RETURN', 'ADJUSTMENT')),
    quantity   NUMBER(10) NOT NULL,
    txn_date   DATE DEFAULT SYSDATE NOT NULL,
    remarks    VARCHAR2(255)
);
