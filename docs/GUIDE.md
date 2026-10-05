> **Update:** this guide describes the first version. The final project adds login with roles, multi-product sales, making charge in the price, row locking, dashboard and master-data pages. See `README.md` and `database/06_upgrade.sql` for the current design.

# Jewelry Store: ASP.NET Core API + React

## 1. Big picture

```
React (Vite, port 5173)  --/api/*-->  ASP.NET Core Web API (port 5000)  --Dapper/ODP.NET-->  Oracle DB
   pages + forms                      controllers = one per table group                      tables, views,
                                                                                              pkg_jewelry
```

- **React** only shows screens and sends JSON. It holds no business rules.
- **ASP.NET controllers** are thin: each endpoint runs one SQL query or calls one PL/SQL procedure.
- **Oracle** owns the business rules. Your `pkg_jewelry` package already checks stock, creates the order, updates stock and writes the stock log. The API just calls it.

I used **Dapper** (a tiny SQL mapper) instead of Entity Framework. Your logic is in PL/SQL and views, so plain SQL with Dapper fits better, and it avoids the Oracle EF provider (which needs a newer Oracle than 10g).

## 2. The database, explained

### Tables and how they connect

| Table | Purpose | Key links |
|---|---|---|
| `categories` | Ring, Necklace, etc. | 1 category has many products |
| `suppliers` | Who you buy stock from | 1 supplier has many products |
| `products` | Each item for sale: metal, purity, weight, making charge, price, `stock_quantity` | `category_id`, `supplier_id` |
| `customers` | Buyers (`phone` is unique) | 1 customer has many orders |
| `employees` | Staff who make the sale (`email` unique) | 1 employee handles many orders |
| `orders` | One sale header: date, status, total | `customer_id`, `employee_id` |
| `order_items` | Lines of an order: product, qty, price, `line_total` | `order_id` (cascade delete), `product_id` |
| `stock_transactions` | History of every stock change (SALE, RESTOCK, RETURN, ADJUSTMENT) | `product_id` |

Rules enforced by the database itself:
- `stock_quantity >= 0` (a check constraint, so stock can never go negative)
- `quantity > 0` on order items
- `status` is only `Completed`, `Cancelled` or `Pending`
- Unique: category name, customer phone, employee email

### Sequences and triggers (auto IDs)
Oracle 10g has no auto-increment. Each table has a **sequence** (`products_seq`, ...) and a **before-insert trigger** that fills the ID when it is NULL. The `order_items` trigger also sets `line_total = quantity * unit_price`.

In the API, for simple inserts I read `NEXTVAL` from the sequence first and insert with that ID. That way the API can return the new ID to React. (The trigger stays as a safety net, e.g. for the package's inserts.)

### Views (ready-made joins for the screens)
- `vw_product_catalog`: product + category name + supplier name + `stock_value`. Used by the Products page.
- `vw_order_summary`: order + customer name + employee name + item count. Used by the Orders page.

### Package `pkg_jewelry` (your business logic)
| Procedure | What it does | API endpoint |
|---|---|---|
| `record_sale` | Checks stock, inserts order and item, reduces stock, logs a `SALE` (negative qty), commits, returns the new order id | `POST /api/orders/sale` |
| `restock_product` | Adds stock, logs `RESTOCK` | `POST /api/stock/restock` |
| `cancel_order` | Returns each item's stock, logs `RETURN`, sets status `Cancelled` | `POST /api/orders/{id}/cancel` |

A sale, step by step: React form -> `POST /api/orders/sale` -> `OrdersController.Sale` -> `pkg_jewelry.record_sale` -> rows written in `orders`, `order_items`, `products`, `stock_transactions` -> order id returned -> React shows "Order #N".

If stock is too low, the package raises error `-20001`. Oracle reports it as ORA-20001, `Program.cs` turns it into HTTP 400 `{ "error": "Insufficient stock available." }`, and React shows it in a red bar.

## 3. Before you start

1. **Oracle version warning.** The driver used here (`Oracle.ManagedDataAccess.Core`) officially supports Oracle **11.2 and newer**. Oracle 10g is not supported, so it may fail to connect. Your SQL works on newer Oracle too, so the safest route is **Oracle XE** (11g XE, or 21c XE in Docker). I could not test against a real database here.
2. Install: **.NET 8 SDK**, **Node.js 18+**, and an Oracle XE instance.
3. Create a schema user and run your SQL script as that user (as SYSTEM):
```sql
CREATE USER jewelry IDENTIFIED BY jewelry123;
GRANT CONNECT, RESOURCE, CREATE VIEW TO jewelry;
ALTER USER jewelry QUOTA UNLIMITED ON USERS;
```
Then connect as `jewelry` and run your full script (tables, triggers, views, package, seed data).

## 4. Run it

**Backend**
```bash
cd backend/JewelryApi
# edit appsettings.json -> ConnectionStrings:Oracle (user, password, host:port/service)
dotnet restore
dotnet run
```
Open `http://localhost:5000/swagger` to test every endpoint without React.

**Frontend** (second terminal)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. Vite forwards `/api` calls to port 5000 (see `vite.config.js`), so no CORS setup is needed in development.

## 5. Code walkthrough

### Backend (`backend/JewelryApi`)
- `JewelryApi.csproj`: .NET 8 web project with Dapper, Oracle driver, Swagger.
- `appsettings.json`: Oracle connection string.
- `Program.cs`:
  - `DefaultTypeMap.MatchNamesWithUnderscores = true` lets Dapper map `PRODUCT_NAME` to `ProductName`.
  - Registers `DbConnectionFactory` and controllers, and enables Swagger.
  - The exception handler converts Oracle errors to clean HTTP codes: 20001 -> 400 (stock), 1 -> 409 (duplicate), 2292 -> 409 (still in use), 2291 -> 400 (bad foreign key), 2290 -> 400 (check rule), 1403 -> 404.
- `Data/DbConnectionFactory.cs`: creates one `OracleConnection` per request. Controllers use `using var conn = db.Create();` so it closes automatically.
- `Models/Models.cs`: C# classes that match table/view columns (`Product`, `ProductCatalogItem` for the view, `OrderSummary` for the view, and request records `SaleRequest`, `RestockRequest`).
- `Controllers/`:
  - `CategoriesController`, `SuppliersController`, `EmployeesController`: list + add.
  - `ProductsController`: list (view), get one, add, update, delete.
  - `CustomersController`: list, search by phone (`?phone=`), add, update.
  - `OrdersController`: list (view), items of an order, `sale`, `cancel`.
  - `StockController`: `restock` and latest 100 `transactions`.

Parameters are always bound (`:name`), never concatenated into SQL, so there is no SQL injection risk.

### Endpoints
| Method | URL | Purpose |
|---|---|---|
| GET/POST | `/api/categories` | list / add |
| GET/POST | `/api/suppliers` | list / add |
| GET/POST | `/api/employees` | list / add |
| GET/POST | `/api/products` | catalog / add |
| GET/PUT/DELETE | `/api/products/{id}` | one / update / delete |
| GET/POST | `/api/customers` (`?phone=`) | list or search / add |
| PUT | `/api/customers/{id}` | update |
| GET | `/api/orders` | order list |
| GET | `/api/orders/{id}/items` | lines of one order |
| POST | `/api/orders/sale` | record a sale |
| POST | `/api/orders/{id}/cancel` | cancel an order |
| POST | `/api/stock/restock` | add stock |
| GET | `/api/stock/transactions` | stock history |

### Frontend (`frontend/src`)
- `main.jsx`, `App.jsx`: app shell with a tab bar (Products, Customers, New sale, Orders, Stock).
- `api.js`: one `fetch` helper. It sends JSON and throws an `Error` with the server's `error` message.
- `pages/Products.jsx`: add form (category/supplier dropdowns), catalog table, delete.
- `pages/Customers.jsx`: add form, search by mobile, list.
- `pages/NewSale.jsx`: choose customer, employee, product, quantity; shows the live total; calls `/api/orders/sale`.
- `pages/Orders.jsx`: order list, expand items, cancel.
- `pages/Stock.jsx`: restock form and stock movement history.
- `pages/Messages.jsx`, `styles.css`: shared message bar and styling.

## 6. Known gaps in the current database logic (worth fixing)

1. `cancel_order` does not check the current status, so cancelling twice would restock twice. The API checks this before calling it, but it is better to add the check inside the package too.
2. `record_sale` sells **one product per order**. For a multi-item cart, change the package to accept a list of items (or add an `add_item` procedure) and sum the total.
3. `record_sale` reads the stock and updates it later without locking the row. Two simultaneous sales of the last item could clash. Use `SELECT ... FOR UPDATE` on the product row.
4. There is no login. `Employee` has no username or password. Add authentication (ASP.NET Identity or JWT) before using this for real.
5. `Pending` status exists in the table but nothing uses it yet.
6. Seed data in your script uses fixed IDs (`category_id = 1`, `supplier_id = 1001`). That works only because the sequences start at those values.

## 7. Troubleshooting
- `ORA-12541` / `ORA-12154`: wrong host, port or service name in the connection string, or the listener is down.
- Property is empty or 0 in React: a SQL column alias does not match the C# property name (check underscores).
- Blank page: open the browser console; confirm the backend runs on port 5000.
- `npm run build` for production: serve `frontend/dist` and add CORS or host it under the same domain.
