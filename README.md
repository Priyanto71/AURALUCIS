<p align="center">
  <img src="docs/AURALUCIS_icon.png" alt="AURALUCIS logo" width="160" />
</p>

<h1 align="center">AURALUCIS</h1>
<p align="center"><b>Jewelry Shop &amp; Stock Management System</b></p>
<p align="center"><i>"Where Luxury Meets Precision."</i></p>

---

## About

AURALUCIS manages the daily work of a jewelry shop: products and categories, suppliers, customers, employees, multi-product sales with discount and VAT, payments in parts, pending orders, receipts with a QR code, stock history and adjustment, cost and profit reports, charts, and an audit log. The business rules (stock check, row locking, discount limits, VAT, payments, cost averaging) live in an Oracle PL/SQL package, so every sale is one safe transaction.

## Features

- **Login with roles:** Manager (full access) and Staff (sell, view, manage customers). Change your own password; a Manager can reset passwords, edit employees and disable logins.
- **Sales:** multi-product cart, discount (amount or percent, Staff limited to 10 %), shop VAT, payment method (Cash, Card, bKash, Nagad, Bank), part payment with a due balance, Pending orders that reserve stock.
- **Receipt:** printable, **Download PDF**, **e-mail**, **SMS**, **WhatsApp**, and a **QR code** that opens a public read-only receipt page (no login, no personal data).
- **Stock:** restock with cost price and supplier, **stock adjustment** (damaged, lost, found, correction), full stock history.
- **Profit:** cost price per product (weighted average on restock), gross profit and margin in reports. Cost prices are visible to Managers only.
- **Reports and charts:** dashboard with line chart (30 days) and pie charts (category, payment method); date-range report with profit, VAT, discounts, dues; CSV export everywhere.
- **Audit log:** who did what and when (logins, sales, payments, price changes, employee changes, settings). Manager only.
- **Shop settings:** shop name, address, phone, VAT %, website link used in the QR code.
- Search and filters, customer purchase history and dues, light and dark mode, phone friendly layout.
- **Backup and restore** guide with ready-made scripts.

## Tech stack

| Layer | Technology |
|---|---|
| Database | Oracle Database 10g XE (tables, sequences, triggers, views, PL/SQL package) |
| Backend | ASP.NET Core Web API, Dapper, Oracle.ManagedDataAccess.Core, token login, Swagger |
| Frontend | React 18 + Vite (qrcode, html2canvas, jsPDF) |

## Project structure

```
AURALUCIS/
  database/            SQL scripts (run in numeric order, 01 to 08)
  backend/JewelryApi/  ASP.NET Core Web API
  frontend/            React + Vite app
  scripts/             backup and restore scripts
  docs/                ER diagram, class diagram, guides, logo
```

## Database design

Tables: `categories`, `suppliers`, `products`, `customers`, `employees`, `orders`, `order_items`, `stock_transactions`, `order_payments`, `shop_settings`, `audit_log`.

- Auto IDs with sequences and before-insert triggers (Oracle 10g has no auto-increment)
- Views: `vw_product_catalog`, `vw_order_summary`
- Package `pkg_jewelry`: `create_order`, `add_order_item`, `finalize_order`, `add_payment`, `receive_payment`, `record_sale`, `restock_product`, `adjust_stock`, `complete_order`, `cancel_order`
- Constraints: no negative stock, positive quantities, valid order status and payment method, unique customer phone, employee email and username
- Passwords are stored as PBKDF2 hashes, never as plain text

Diagrams: [ER diagram](docs/ER_Diagram_Jewelry.png) | [Class diagram](docs/Class_Diagram_Jewelry.png) (these show the first design and do not yet include the newest tables)

## Getting started

### 1. Database
```sql
-- as SYSTEM
CREATE USER your_user IDENTIFIED BY your_password;
GRANT CONNECT, RESOURCE, CREATE VIEW TO your_user;
ALTER USER your_user QUOTA UNLIMITED ON USERS;
```
Connect as that user and run the scripts in `database/` in order: `01` to `08`. Run each only once. Take a backup before each upgrade script.

Demo logins created by `06`: `admin` / `admin123` (Manager) and `staff` / `staff123` (Staff). Change them for real use.

### 2. Backend
```
cd backend/JewelryApi
copy appsettings.example.json appsettings.json
```
Edit `appsettings.json`: the Oracle connection string, and (optional) the `Email` and `Sms` sections to send receipts. Then:
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
Open http://localhost:5173 and sign in. As Manager, open **Setup > Shop settings** and set the VAT % and the website link.

### Receipt QR code
The QR code opens `<website link>/verify/<random code>`. `localhost` only works on your own computer. To test with a phone on the same Wi-Fi, set the website link to your computer's address, for example `http://192.168.1.20:5173`. For a real shop, host the site online.

### E-mail and SMS
- **E-mail:** fill `Email` in `appsettings.json` (SMTP host, port, user, password, from). Gmail needs an app password.
- **SMS:** any HTTP SMS gateway: `Sms.UrlTemplate` such as `https://gateway.example/send?key={key}&to={to}&text={message}` and `Sms.ApiKey`.
- Without these settings the buttons show a clear "not set up" message. WhatsApp and PDF need no setup.

## API overview

| Method | URL | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | everyone | get a token |
| POST | `/api/auth/logout`, GET `/api/auth/me`, POST `/api/auth/change-password` | logged in | sign out, current user, change own password |
| GET | `/api/public/receipt/{code}` | everyone | public receipt (QR page, safe copy) |
| GET | `/api/reports/dashboard` | logged in | dashboard numbers and charts |
| GET | `/api/reports/sales?from=&to=` | Manager | sales and profit report |
| GET | `/api/audit` | Manager | audit log |
| GET, PUT | `/api/settings` | logged in, Manager | shop settings |
| GET | `/api/products`, `/api/categories`, `/api/suppliers`, `/api/employees` | logged in | lists (cost price hidden from Staff) |
| POST/PUT/DELETE | `/api/products`; POST `/api/categories`, `/api/suppliers` | Manager | manage master data |
| POST, PUT | `/api/employees`, `/api/employees/{id}` | Manager | add / edit employee |
| POST | `/api/employees/{id}/active`, `/api/employees/{id}/reset-password` | Manager | disable or enable login / reset password |
| GET/POST/PUT | `/api/customers` | logged in | customers with due balance |
| GET | `/api/customers/{id}/history` | logged in | purchase history and totals |
| GET | `/api/orders`, `/api/orders/{id}/items`, `/api/orders/{id}/receipt` | logged in | order list, lines, receipt data |
| POST | `/api/orders/sale` | logged in | sale or Pending order with discount, VAT and payment, one transaction |
| POST | `/api/orders/{id}/payments` | logged in | take a payment |
| POST | `/api/orders/{id}/email`, `/api/orders/{id}/sms` | logged in | send the receipt |
| POST | `/api/orders/{id}/complete` | logged in | Pending to Completed |
| POST | `/api/orders/{id}/cancel` | Manager | cancel and return stock |
| POST | `/api/stock/restock`, `/api/stock/adjust` | Manager | add stock with cost / adjust stock |
| GET | `/api/stock/transactions` | logged in | stock history |

## Backup and restore
See [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) and the scripts in `scripts/`.

## Roadmap

- [x] Database schema, views and business package
- [x] REST API and React frontend
- [x] Login, roles, password change, employee management
- [x] Multiple products per sale, Pending orders
- [x] Receipts, search and filters, customer history
- [x] Discount, VAT, payment methods, part payment and dues
- [x] Stock adjustment, cost price and profit report
- [x] Audit log, charts, QR code, PDF, e-mail and SMS receipts
- [x] Backup and restore guide
- [ ] Daily metal-rate pricing
- [ ] Sales return and exchange
- [ ] Branch stock requests and approval
- [ ] Product images
