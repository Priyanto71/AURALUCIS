<p align="center">
  <img src="docs/AURALUCIS_icon.png" alt="AURALUCIS logo" width="160" />
</p>

<h1 align="center">AURALUCIS</h1>
<p align="center"><b>Jewelry Shop &amp; Stock Management System</b></p>
<p align="center"><i>"Where Luxury Meets Precision."</i></p>

---

## About

AURALUCIS manages the daily work of a jewelry shop: products and categories, suppliers, customers, employees, multi-product sales, pending (held) orders, order cancellation, printable receipts, stock history, a dashboard and sales reports. The business rules (stock check, row locking, order creation, stock update, stock log) live in an Oracle PL/SQL package, so every sale is one safe transaction.

## Features

- Login with roles: **Manager** (full access) and **Staff** (sell, view, manage customers). Change your own password; a Manager can reset passwords, edit employees and disable logins.
- Dashboard: total sales, completed / pending / cancelled orders, stock value, last 7 days, top products, low stock
- Products with category, supplier, purity, weight, making charge, edit and delete
- Multi-product sales cart; sale price per piece = unit price + making charge
- **Pending orders**: hold an order and reserve its stock, then Complete it or Cancel it later
- **Printable receipt** for every order (Print or Save as PDF)
- Orders list with items, cancel (Manager) with automatic stock return
- **Search and filters** on products, customers and orders (status, dates, low stock)
- **Customer purchase history** with total spent
- **Sales reports** for any date range (by day, category, product, employee) for Managers
- **Export to CSV** (Excel) for products, customers, orders and every report table
- **Light and dark mode**; works on desktop and phone
- Restock and a full stock movement history
- Categories, suppliers and employees (with logins) management

## Tech stack

| Layer | Technology |
|---|---|
| Database | Oracle Database 10g XE (tables, sequences, triggers, views, PL/SQL package) |
| Backend | ASP.NET Core Web API, Dapper, Oracle.ManagedDataAccess.Core, token login, Swagger |
| Frontend | React 18 + Vite |

## Project structure

```
AURALUCIS/
  database/            SQL scripts (run in numeric order, 01 to 07)
  backend/JewelryApi/  ASP.NET Core Web API
  frontend/            React + Vite app
  docs/                ER diagram, class diagram, guides, logo
```

## Database design

Eight tables: `categories`, `suppliers`, `products`, `customers`, `employees`, `orders`, `order_items`, `stock_transactions`.

- Auto IDs with sequences and before-insert triggers (Oracle 10g has no auto-increment)
- Views: `vw_product_catalog`, `vw_order_summary`
- Package `pkg_jewelry`: `create_order`, `add_order_item`, `record_sale`, `restock_product`, `complete_order`, `cancel_order`
- Constraints: no negative stock, positive quantities, valid order status, unique customer phone, employee email and username
- Passwords are stored as PBKDF2 hashes, never as plain text
- Order status: `Completed`, `Pending` (stock reserved) or `Cancelled`

Diagrams: [ER diagram](docs/ER_Diagram_Jewelry.png) | [Class diagram](docs/Class_Diagram_Jewelry.png)

## Getting started

### 1. Database
```sql
-- as SYSTEM
CREATE USER your_user IDENTIFIED BY your_password;
GRANT CONNECT, RESOURCE, CREATE VIEW TO your_user;
ALTER USER your_user QUOTA UNLIMITED ON USERS;
```
Connect as that user and run the scripts in `database/` in order: `01` to `07`.
`06_upgrade.sql` adds logins and multi-product sales, `07_features.sql` adds pending orders and the employee active flag. Run each only once.

Demo logins created by `06`: `admin` / `admin123` (Manager) and `staff` / `staff123` (Staff). Change them for real use.

### 2. Backend
```
cd backend/JewelryApi
copy appsettings.example.json appsettings.json
```
Edit `appsettings.json` with your Oracle user, password and service name, then:
```
dotnet restore
dotnet run
```
Open http://localhost:5000/swagger. Call `POST /api/Auth/login`, copy the token, click **Authorize** and paste it.

### 3. Frontend
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 and sign in.

## API overview

| Method | URL | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | everyone | get a token |
| POST | `/api/auth/logout`, GET `/api/auth/me` | logged in | sign out / current user |
| POST | `/api/auth/change-password` | logged in | change own password |
| GET | `/api/reports/dashboard` | logged in | dashboard numbers |
| GET | `/api/reports/sales?from=&to=` | Manager | sales report for a date range |
| GET | `/api/products`, `/api/categories`, `/api/suppliers`, `/api/employees` | logged in | lists |
| POST/PUT/DELETE | `/api/products`; POST `/api/categories`, `/api/suppliers` | Manager | manage master data |
| POST, PUT | `/api/employees`, `/api/employees/{id}` | Manager | add / edit employee |
| POST | `/api/employees/{id}/active`, `/api/employees/{id}/reset-password` | Manager | disable or enable login / reset password |
| GET/POST/PUT | `/api/customers` | logged in | customers |
| GET | `/api/customers/{id}/history` | logged in | purchase history and totals |
| GET | `/api/orders`, `/api/orders/{id}/items`, `/api/orders/{id}/receipt` | logged in | order list, lines, receipt data |
| POST | `/api/orders/sale` | logged in | multi-product sale or Pending order, one transaction |
| POST | `/api/orders/{id}/complete` | logged in | Pending to Completed |
| POST | `/api/orders/{id}/cancel` | Manager | cancel and return stock |
| POST | `/api/stock/restock` | Manager | add stock |
| GET | `/api/stock/transactions` | logged in | stock history |

## Roadmap

- [x] Database schema, views and business package
- [x] REST API and React frontend
- [x] Login, roles, password change, employee management
- [x] Multiple products per sale, Pending orders
- [x] Receipts, search and filters, customer history
- [x] Dashboard, sales reports, CSV export, dark mode
- [ ] Stock adjustment (damaged or lost items)
- [ ] Product images
- [ ] Email or SMS receipts
