# AURALUCIS: প্রজেক্ট ব্যাখ্যা (শিক্ষককে বোঝানোর জন্য)

> **AURALUCIS** : Jewelry Shop & Stock Management System
> *"Where Luxury Meets Precision."*

---

## ০. এক মিনিটে পরিচয় (শুরুতে এটা বলুন)

"স্যার, এটা একটা গহনার দোকানের ম্যানেজমেন্ট সিস্টেম। এতে পণ্য, সরবরাহকারী, কাস্টমার, কর্মচারী, বিক্রি, অর্ডার বাতিল, স্টকের ইতিহাস আর ড্যাশবোর্ড আছে। কর্মচারীরা login করে কাজ করে। Manager ও Staff-এর অধিকার আলাদা।

তিনটা অংশ আছে:
1. **Database**: Oracle 10g XE। ডাটা আর ব্যবসার নিয়ম এখানে।
2. **Backend**: ASP.NET Core Web API। ডাটাবেস আর ওয়েবসাইটের মাঝের সেতু।
3. **Frontend**: React। ব্যবহারকারী যে পেজ দেখে ও ব্যবহার করে।"

---

## ১. সিস্টেমের নকশা (তিন স্তর)

```
 ব্রাউজার (React, port 5173)
        │   JSON অনুরোধ: GET/POST/PUT/DELETE /api/...  + Authorization: Bearer <token>
        ▼
 ASP.NET Core API (port 5000)
        │   SQL চালায় বা PL/SQL procedure call করে (Dapper দিয়ে)
        ▼
 Oracle Database 10g XE (টেবিল, trigger, view, package pkg_jewelry)
```

| স্তর | কাজ | এখানে কোনো ব্যবসার নিয়ম আছে? |
|---|---|---|
| Frontend | দেখানো, ফর্ম নেওয়া, API ডাকা | না (শুধু বাটন লুকানো/দেখানো) |
| Backend | login যাচাই, অনুমতি যাচাই, অনুরোধ database-এ পাঠানো, error বদলানো | অল্প (transaction, অনুমতি) |
| Database | ডাটা রাখা, নিয়ম মানানো (স্টক, লক, লগ) | হ্যাঁ, মূল নিয়ম এখানে |

**কেন আলাদা স্তর?** একটি অংশ বদলালে অন্যটি ভাঙে না। একই API ভবিষ্যতে মোবাইল অ্যাপও ব্যবহার করতে পারবে।

---

## ২. ডাটাবেস (Oracle 10g XE)

ফাইল: `database/01` থেকে `06`

### ২.১ আটটি টেবিল

| টেবিল | কাজ | মূল কলাম |
|---|---|---|
| `categories` | পণ্যের ধরন | category_id, category_name (unique) |
| `suppliers` | সরবরাহকারী | supplier_id, supplier_name, contact_person, phone, email |
| `products` | পণ্য | product_id, category_id (FK), supplier_id (FK), metal_type, purity, weight_grams, making_charge, unit_price, stock_quantity |
| `customers` | ক্রেতা | customer_id, first_name, last_name, phone (unique) |
| `employees` | কর্মচারী + login | employee_id, role, email (unique), **username (unique), password_hash** |
| `orders` | বিক্রির হেডার | order_id, customer_id (FK), employee_id (FK), order_date, status, total_amount |
| `order_items` | অর্ডারের প্রতিটি লাইন | item_id, order_id (FK), product_id (FK), quantity, unit_price, line_total |
| `stock_transactions` | স্টকের প্রতিটি পরিবর্তনের লগ | txn_id, product_id (FK), txn_type, quantity, txn_date, remarks |

### ২.২ সম্পর্ক (ER diagram অনুযায়ী)

- Category 1 → অনেক Product
- Supplier 1 → অনেক Product
- Customer 1 → অনেক Order
- Employee 1 → অনেক Order
- Order 1 → অনেক Order Item
- Product 1 → অনেক Order Item
- Product 1 → অনেক Stock Transaction

`order_items` একটি জংশন টেবিল। Order ও Product-এর many-to-many সম্পর্ককে দুটি one-to-many সম্পর্কে ভাঙে।

### ২.৩ Constraints (database নিজেই যে নিয়ম মানে)

| নিয়ম | কোথায় | ফল |
|---|---|---|
| `stock_quantity >= 0` | products | স্টক ঋণাত্মক হলে ORA-02290 |
| `quantity > 0` | order_items | শূন্য/ঋণাত্মক পরিমাণ চলবে না |
| `status IN ('Completed','Cancelled','Pending')` | orders | ভুল status চলবে না |
| UNIQUE | category_name, customers.phone, employees.email, employees.username | ডুপ্লিকেট হলে ORA-00001 |
| FOREIGN KEY | সব সম্পর্কে | অস্তিত্বহীন id হলে ORA-02291 |
| `ON DELETE CASCADE` | order_items.order_id | অর্ডার মুছলে তার লাইনও মুছে যায় |
| NOT NULL | name, metal_type, weight, unit_price ইত্যাদি | ফাঁকা চলবে না |

### ২.৪ Sequence ও Trigger (auto ID)

Oracle 10g-তে auto-increment নেই। তাই:
- প্রতিটি টেবিলের জন্য একটি **sequence** (`products_seq`, `orders_seq` ...) নতুন নম্বর বানায়।
- প্রতিটি টেবিলে একটি **before-insert trigger** (`trg_products_bi` ...) থাকে। insert-এর আগে id ফাঁকা থাকলে sequence থেকে মান বসায়।
- `trg_order_items_bi` বাড়তি একটি কাজ করে: `line_total = quantity × unit_price` হিসাব করে।

> প্রথমে `DEFAULT seq.NEXTVAL` ব্যবহার করেছিলাম, কিন্তু সেটা Oracle 12c-এর সুবিধা। 10g-তে `ORA-00984` এসেছিল। তাই trigger পদ্ধতি নিয়েছি।

### ২.৫ View (তৈরি করা join)

| View | কী দেয় | কোথায় ব্যবহার হয় |
|---|---|---|
| `vw_product_catalog` | পণ্য + category নাম + supplier নাম + `stock_value` (stock × price) | `ProductsController.GetAll`, Products পেজ |
| `vw_order_summary` | অর্ডার + customer নাম + employee নাম + আইটেম সংখ্যা | `OrdersController.GetAll`, Orders পেজ |

### ২.৬ Package `pkg_jewelry`: প্রতিটি procedure ধাপে ধাপে

এটাই ব্যবসার নিয়মের কেন্দ্র। চূড়ান্ত সংস্করণ `06_upgrade.sql`-এ।

**`create_order(customer_id, employee_id, order_id)`**
1. `orders` টেবিলে নতুন সারি বসায়, `total_amount = 0`, status ডিফল্ট `Completed`।
- commit করে না (API transaction শেষ করবে)।

**`add_order_item(order_id, product_id, qty)`**: প্রতিটি পণ্যের জন্য একবার
1. `qty <= 0` হলে error **-20002** "Quantity must be greater than 0."
2. পণ্যের সারি **`SELECT ... FOR UPDATE`** দিয়ে লক করে (stock, unit_price, making_charge পড়ে)। এতে একই শেষ পণ্য দুজন একসাথে কিনতে পারে না।
3. `stock < qty` হলে error **-20001** "Insufficient stock available."
4. টুকরো প্রতি দাম = `unit_price + making_charge`।
5. `order_items`-এ লাইন বসায়।
6. `products.stock_quantity` কমায়।
7. `stock_transactions`-এ `SALE` লগ (পরিমাণ ঋণাত্মক, remarks "Order #N")।
8. `orders.total_amount`-এ লাইনের মোট দাম যোগ করে।
- commit করে না।

**`record_sale(customer, employee, product, qty, order_id OUT)`**
- `create_order` + `add_order_item` একসাথে ডেকে `COMMIT` করে। SQL\*Plus-এ এক কলে এক পণ্য বিক্রির জন্য সুবিধাজনক। ওয়েবসাইট এটা ব্যবহার করে না।

**`restock_product(product_id, qty, remarks)`**
1. `qty <= 0` হলে -20002।
2. স্টক বাড়ায়। কোনো সারি না বদলালে -20003 "Product not found."
3. `RESTOCK` লগ বসায়, `COMMIT`।

**`cancel_order(order_id)`**
1. অর্ডারের সারি `FOR UPDATE` দিয়ে লক করে, status পড়ে। অর্ডার না থাকলে ORA-01403।
2. status ইতিমধ্যে `Cancelled` হলে error **-20004** "Order is already cancelled." (এতে দুইবার stock ফেরত যাওয়া আটকায়।)
3. প্রতিটি লাইনের জন্য stock ফেরত দেয় এবং `RETURN` লগ বসায়।
4. status `Cancelled` করে, `COMMIT`।

### ২.৭ Package-এর error কোড

| কোড | মানে |
|---|---|
| -20001 | স্টক কম |
| -20002 | পরিমাণ ০ বা ঋণাত্মক |
| -20003 | পণ্য পাওয়া যায়নি (restock) |
| -20004 | অর্ডার আগেই বাতিল |

### ২.৮ Transaction কেন জরুরি?

বিক্রি মানে ৫-৬টি ধাপ (order, item, stock কমানো, লগ, total)। এগুলো একটা **transaction**: সব সফল হলে commit, একটিও ব্যর্থ হলে সব rollback। তাই দুই পণ্যের একটার স্টক কম হলে অর্ডারই তৈরি হয় না।

### ২.৯ Login-এর database অংশ

- `employees.username` (unique) ও `password_hash` (VARCHAR2(200)) কলাম।
- পাসওয়ার্ড plain text নয়। hash-এর ফরম্যাট: `100000.<salt>.<hash>`।
- `06_upgrade.sql` দুটি ডেমো ইউজার বানায়: `admin` (Manager), `staff` (Staff)।

---

## ৩. Backend (ASP.NET Core Web API)

ফোল্ডার: `backend/JewelryApi/`

### ৩.১ ফাইল তালিকা

| ফাইল | কাজ |
|---|---|
| `JewelryApi.csproj` | প্রজেক্টের সেটিং ও package: Dapper, Oracle.ManagedDataAccess.Core, Swashbuckle |
| `appsettings.json` | Oracle connection string (GitHub-এ যায় না, পাসওয়ার্ড আছে) |
| `Program.cs` | সার্ভার চালু, middleware, login ব্যবস্থা, error handler |
| `Data/DbConnectionFactory.cs` | Oracle connection তৈরি |
| `Models/Models.cs` | C# class ও request record |
| `Auth/PasswordHasher.cs` | পাসওয়ার্ড hash ও যাচাই |
| `Auth/TokenStore.cs` | login token মেমোরিতে রাখা |
| `Auth/TokenAuthHandler.cs` | প্রতি অনুরোধে token যাচাই করে ইউজার ও role বসানো |
| `Controllers/*.cs` | endpoint-গুলো |

### ৩.২ `Program.cs`: কোন লাইন কী করে

| অংশ | কাজ |
|---|---|
| `DefaultTypeMap.MatchNamesWithUnderscores = true` | Oracle কলাম `PRODUCT_NAME` কে C# প্রপার্টি `ProductName`-এর সাথে মেলায় |
| `AddSingleton<DbConnectionFactory>()` | connection factory সবার জন্য একটাই |
| `AddSingleton<TokenStore>()` | token-এর তালিকা সার্ভারের মেমোরিতে |
| `AddAuthentication("Token").AddScheme<..., TokenAuthHandler>` | "Bearer token" দিয়ে ইউজার চেনার নিয়ম |
| `FallbackPolicy = RequireAuthenticatedUser` | `[AllowAnonymous]` ছাড়া প্রতিটি endpoint-এ login লাগবে (শুধু `/api/auth/login` খোলা) |
| `AddSwaggerGen` + `AddSecurityDefinition("Bearer")` | Swagger-এ **Authorize** বাটন, token বসানোর জন্য |
| `UseExceptionHandler(...)` | Oracle error ধরে ভালো HTTP উত্তর বানায় (নিচের টেবিল) |
| `UseAuthentication()` ও `UseAuthorization()` | token চেনা, তারপর অনুমতি যাচাই (এই ক্রম গুরুত্বপূর্ণ) |
| `MapControllers()` | controller-এর URL চালু |
| `app.Urls.Add("http://localhost:5000")` | পোর্ট ৫০০০ |
| `AppMessage(...)` | `"ORA-20001: Insufficient stock available."` থেকে শুধু বার্তাটা বের করে |

**Oracle error থেকে HTTP উত্তর:**

| Oracle error | HTTP | বার্তা |
|---|---|---|
| ORA-20001, 20002 | 400 | package-এর বার্তা |
| ORA-20003 | 404 | Product not found. |
| ORA-20004 | 409 | Order is already cancelled. |
| ORA-01403 | 404 | Record not found. |
| ORA-00001 | 409 | Duplicate value (unique constraint). |
| ORA-02292 | 409 | Cannot delete: this record is used elsewhere. |
| ORA-02291 | 400 | Referenced record does not exist. |
| ORA-02290 | 400 | Value breaks a check rule. |
| অন্য সব | 500 | Server error. |

### ৩.৩ `Auth/` ফোল্ডার: login কীভাবে কাজ করে

**`PasswordHasher`**
- `Hash(password)`: ১৬ বাইটের random salt বানায়, PBKDF2-SHA256 দিয়ে ১,০০,০০০ বার hash করে। ফলাফল `iterations.salt.hash`।
- `Verify(password, stored)`: stored মান থেকে salt আর iterations নিয়ে আবার hash বানায় এবং তুলনা করে (`FixedTimeEquals`, যাতে সময় মেপে অনুমান করা না যায়)।
- কেন hash? ডাটাবেস চুরি হলেও আসল পাসওয়ার্ড বের করা যায় না।

**`TokenStore`**
- `Issue(user)`: ৩২ বাইটের random token (hex) বানিয়ে ইউজারের তথ্যসহ মেমোরিতে রাখে।
- `Get(token)`: token থেকে ইউজার ফেরত দেয়। মেয়াদ (৮ ঘণ্টা) শেষ হলে মুছে দেয়।
- `Revoke(token)`: logout-এ token মুছে ফেলে।
- সীমাবদ্ধতা: মেমোরিতে থাকে, তাই API restart হলে সবাই logout।

**`TokenAuthHandler.HandleAuthenticateAsync`** (প্রতিটি অনুরোধে চলে)
1. `Authorization: Bearer <token>` header পড়ে।
2. header না থাকলে "অচেনা ইউজার" (`NoResult`), তখন fallback policy 401 দেয়।
3. token `TokenStore`-এ না মিললে বা মেয়াদোত্তীর্ণ হলে `Fail` (401)।
4. মিললে ইউজারের id, নাম ও role দিয়ে claims বানায়। এরপর `[Authorize(Roles = "Manager")]` এই role দেখে 403 দেয় বা অনুমতি দেয়।

### ৩.৪ Controller-এর প্রতিটি method

(Dapper নিয়ম: `QueryAsync` = অনেক সারি পড়া, `ExecuteAsync` = insert/update/delete বা procedure, `ExecuteScalarAsync` = একটি মান, সব `:name` parameter দিয়ে)

**AuthController** (`/api/auth`)

| Method | কে পারে | কী করে |
|---|---|---|
| `Login` POST `/login` | সবাই | username দিয়ে `employees` থেকে hash আনে, `Verify` করে, ঠিক হলে token বানিয়ে `{token, employeeId, name, role}` দেয়। ভুল হলে 401। "Manager" role হলে Manager, বাকি সবাই Staff। |
| `Logout` POST `/logout` | logged in | token মুছে ফেলে |
| `Me` GET `/me` | logged in | token-এর ইউজার কে তা দেখায় |

**CategoriesController** / **SuppliersController**

| Method | কে পারে | কী করে |
|---|---|---|
| `GetAll` GET | logged in | সব তালিকা |
| `Create` POST | **Manager** | sequence থেকে id নিয়ে insert, নতুন id ফেরত |

**ProductsController** (`/api/products`)

| Method | কে পারে | কী করে |
|---|---|---|
| `GetAll` GET | logged in | `vw_product_catalog` থেকে তালিকা |
| `Get(id)` GET | logged in | একটি পণ্য (edit ফর্মের জন্য) |
| `Create` POST | **Manager** | নতুন পণ্য insert |
| `Update` PUT | **Manager** | তথ্য বদলায় (stock নয়, stock বদলায় Stock পেজে) |
| `Delete` DELETE | **Manager** | মোছে। কোনো অর্ডারে ব্যবহৃত হলে ORA-02292 → 409 |

**CustomersController** (`/api/customers`)

| Method | কে পারে | কী করে |
|---|---|---|
| `GetAll` GET | logged in | সব বা `?phone=` দিয়ে মোবাইল নম্বরে সার্চ (`LIKE`) |
| `Create` POST | logged in | নতুন customer |
| `Update` PUT | logged in | customer-এর তথ্য বদল |

**EmployeesController** (`/api/employees`)

| Method | কে পারে | কী করে |
|---|---|---|
| `GetAll` GET | logged in | সব কর্মচারী (hash পাঠায় না) |
| `Create` POST | **Manager** | username ফাঁকা বা পাসওয়ার্ড ৬ অক্ষরের কম হলে 400। নয়তো পাসওয়ার্ড hash করে insert |

**OrdersController** (`/api/orders`)

| Method | কে পারে | কী করে |
|---|---|---|
| `GetAll` GET | logged in | `vw_order_summary` থেকে অর্ডারের তালিকা |
| `Items(id)` GET `/{id}/items` | logged in | একটি অর্ডারের লাইনগুলো |
| `Sale` POST `/sale` | logged in | **একাধিক পণ্যের বিক্রি** (নিচে বিস্তারিত) |
| `Cancel(id)` POST `/{id}/cancel` | **Manager** | `pkg_jewelry.cancel_order` ডাকে |

**StockController** (`/api/stock`)

| Method | কে পারে | কী করে |
|---|---|---|
| `Restock` POST `/restock` | **Manager** | `pkg_jewelry.restock_product` ডাকে |
| `Transactions` GET `/transactions` | logged in | সাম্প্রতিক ১০০টি stock movement |

**ReportsController** (`/api/reports`)
- `Dashboard` GET `/dashboard`: একটি কলে পাঁচটি query চালিয়ে এই ডাটা দেয়: মোট বিক্রি ও অর্ডার সংখ্যা (Completed/Cancelled), পণ্য সংখ্যা ও stock মূল্য, কম স্টকের পণ্য (৩ বা কম), গত ৭ দিনের বিক্রি, সেরা ৫ পণ্য।

### ৩.৫ `OrdersController.Sale` ধাপে ধাপে (সবচেয়ে গুরুত্বপূর্ণ)

1. অনুরোধ ঠিক আছে কিনা দেখে: অন্তত একটি পণ্য আছে, সব পরিমাণ > 0।
2. **বিক্রেতা কে?** token-এর claim থেকে employee id নেয় (ব্যবহারকারী নিজে বেছে নেয় না, তাই অন্যের নামে বিক্রি দেখানো যায় না)।
3. connection খোলে এবং `BeginTransaction()` দিয়ে **transaction** শুরু করে।
4. `orders_seq.NEXTVAL` থেকে নতুন order id নেয়।
5. `pkg_jewelry.create_order` ডাকে।
6. প্রতিটি পণ্যের জন্য `pkg_jewelry.add_order_item` ডাকে (loop)।
7. সব ঠিক থাকলে `Commit()`, অর্ডার id ফেরত।
8. কোথাও error হলে `Rollback()` এবং error ওপরে পাঠায়, `Program.cs`-এর handler সেটাকে 400/404/409-এ বদলায়।

### ৩.৬ গুরুত্বপূর্ণ ধারণা

| ধারণা | মানে |
|---|---|
| `using var conn = db.Create()` | কাজ শেষে connection নিজে বন্ধ হয় |
| Parameter binding (`:name`) | ব্যবহারকারীর ইনপুট কখনো SQL স্ট্রিংয়ে জোড়া হয় না, তাই SQL Injection হয় না |
| Dapper | সরাসরি SQL ও procedure call, ফলাফল C# class-এ ভরে দেয় (Entity Framework-এর চেয়ে সরল, কারণ নিয়ম PL/SQL-এ) |
| `[Authorize(Roles = "Manager")]` | শুধু Manager পারবে, Staff পেলে 403 |
| Swagger | ব্রাউজারে endpoint পরীক্ষার পেজ |

---

## ৪. Frontend (React + Vite)

ফোল্ডার: `frontend/`

### ৪.১ ফাইল তালিকা

| ফাইল | কাজ |
|---|---|
| `vite.config.js` | `/api` অনুরোধ port 5000-এর backend-এ পাঠায় (CORS লাগে না) |
| `index.html` | মূল HTML, শিরোনাম "AURALUCIS", favicon হিসেবে logo |
| `src/main.jsx` | `<App />` ব্রাউজারে বসায় |
| `src/api.js` | backend-এর সব কল এক জায়গায় |
| `src/App.jsx` | মূল কাঠামো: sidebar, ট্যাব, login/logout |
| `src/pages/*.jsx` | প্রতিটি পেজ |
| `src/styles.css` | রঙ, layout, মোবাইল ডিজাইন |

### ৪.২ `api.js`

| Function | কাজ |
|---|---|
| `getUser()` / `saveUser()` / `clearUser()` | login-এর তথ্য (token, নাম, role) ব্রাউজারের localStorage-এ রাখা/পড়া/মোছা |
| `request(method, url, body)` | সব কলের মূল ফাংশন। token থাকলে `Authorization: Bearer ...` যোগ করে। **401** এলে তথ্য মুছে `auth-expired` event ছাড়ে (ফলে login পেজে ফেরে)। **403** এলে "Only a Manager can do this." দেখায়। অন্য error হলে server-এর `error` বার্তা দেখায় |
| `api.get / post / put / del` | `request`-এর সংক্ষিপ্ত রূপ |
| `money(n)` | সংখ্যাকে দুই দশমিক টাকায় সাজায় |

### ৪.৩ `App.jsx`

- `user` state: login করা ইউজার। না থাকলে `Login` পেজ দেখায়।
- `tab` state: কোন ট্যাব খোলা।
- `useEffect`: `auth-expired` event শুনে ইউজার null করে (token মেয়াদ শেষ বা API restart হলে)।
- `logout()`: `/api/auth/logout` ডাকে, localStorage মোছে।
- বাঁ পাশে sidebar (মোবাইলে নিচের ট্যাব বার), ডানে বর্তমান পেজ (`<Page user={user} />`)। প্রতিটি পেজ `user.role` দেখে বাটন দেখাবে কি না ঠিক করে।

### ৪.৪ প্রতিটি পেজের function

**`Login.jsx`**
- `submit`: `POST /api/auth/login` → সফল হলে `saveUser` ও `onLogin`; ব্যর্থ হলে লাল বার্তা।

**`Dashboard.jsx`**
- `useEffect`: `GET /api/reports/dashboard` ডেকে ডাটা আনে।
- পাঁচটি কার্ড, গত ৭ দিনের বার (`maxDay` দিয়ে সবচেয়ে বড় দিনের তুলনায় দৈর্ঘ্য), সেরা পণ্য, কম স্টকের তালিকা।

**`Products.jsx`**
- `load`: পণ্য, category ও supplier একসাথে আনে (`Promise.all`)।
- `startEdit(id)`: `GET /api/products/{id}` দিয়ে ফর্ম ভরে।
- `save`: edit মোডে `PUT`, নয়তো `POST`।
- `remove(id)`: নিশ্চিত করে `DELETE`।
- ফর্ম ও Edit/Delete বাটন শুধু **Manager** দেখে।

**`Customers.jsx`**
- `load(phone)`: তালিকা আনে, মোবাইল সার্চসহ।
- `startEdit(c)` / `cancelEdit` / `save`: যোগ বা বদল।

**`NewSale.jsx`**
- `load`: customer ও পণ্য আনে।
- `piecePrice(p)`: unit price + making charge।
- `addToCart()`: পণ্য ও পরিমাণ cart-এ যোগ করে। একই পণ্য আবার যোগ করলে পরিমাণ বাড়ায়। স্টকের বেশি হলে আগেই লাল বার্তা দেয়।
- `removeLine(id)`: cart থেকে বাদ।
- `total`: cart-এর মোট দাম হিসাব করে দেখায়।
- `submit`: `POST /api/orders/sale` এ `{customerId, items}` পাঠায়। সফল হলে "Order #N" দেখায়, cart খালি করে।
- বিক্রেতা হিসেবে লগইন করা ইউজারের নাম দেখায়।

**`Orders.jsx`**
- `load`: `GET /api/orders`।
- `toggle(id)`: `GET /api/orders/{id}/items` দিয়ে লাইন খোলে/বন্ধ করে।
- `cancel(id)`: `POST /api/orders/{id}/cancel`। বাটন শুধু **Manager** দেখে এবং শুধু Cancelled নয় এমন অর্ডারে।

**`Stock.jsx`**
- `load`: পণ্য ও stock movement আনে।
- `submit`: `POST /api/stock/restock`। ফর্ম শুধু **Manager** দেখে। নিচে সবার জন্য stock movement-এর তালিকা।

**`Setup.jsx`**
- `useList(url)`: তালিকা আনার ছোট hook।
- `Categories`, `Suppliers`, `Employees`: তিনটি অংশে তালিকা, আর ফর্ম (শুধু Manager)। Employee যোগ করলে username ও পাসওয়ার্ডসহ তৈরি হয়, সে সাথে সাথে login করতে পারে।

**`Messages.jsx`**: সবুজ (সফল) / লাল (error) বার্তা বার।

### ৪.৫ Role অনুযায়ী UI

| কাজ | Manager | Staff |
|---|---|---|
| Dashboard, তালিকা দেখা | ✔ | ✔ |
| বিক্রি করা | ✔ | ✔ |
| Customer যোগ/বদল | ✔ | ✔ |
| Product যোগ/বদল/মোছা | ✔ | ✘ |
| Restock | ✔ | ✘ |
| Order cancel | ✔ | ✘ |
| Category, Supplier, Employee যোগ | ✔ | ✘ |

দুই স্তরে সুরক্ষা: React বাটন লুকায় (সুবিধার জন্য), আর **backend 403 দেয়** (আসল নিরাপত্তা)। কেউ বাটন না দেখেও API ডাকলে backend আটকাবে।

### ৪.৬ ডিজাইন

- ডেস্কটপ: বাঁয়ে sidebar, ডানে পুরো প্রস্থ জুড়ে কনটেন্ট।
- মোবাইল (৮৬০px বা কম): উপরে ছোট বার, নিচে ফোন অ্যাপের মতো ট্যাব বার, ফর্ম এক কলামে, টেবিল পাশে সরানো যায়।

---

## ৫. শুরু থেকে শেষ: পাঁচটি গুরুত্বপূর্ণ প্রবাহ

### প্রবাহ ১: Login

| # | স্তর | কী ঘটে |
|---|---|---|
| 1 | React `Login.submit` | `POST /api/auth/login` {username, password} |
| 2 | Backend `AuthController.Login` | `employees` থেকে username দিয়ে `password_hash` আনে |
| 3 | `PasswordHasher.Verify` | পাসওয়ার্ড মেলায় |
| 4 | `TokenStore.Issue` | token বানায় (৮ ঘণ্টা) |
| 5 | React `saveUser` | token localStorage-এ রাখে, Dashboard খোলে |
| 6 | পরের প্রতিটি অনুরোধ | `api.request` token পাঠায়, `TokenAuthHandler` চিনে নেয় |

### প্রবাহ ২: বিক্রি (দুই পণ্য)

| # | স্তর | কী ঘটে |
|---|---|---|
| 1 | React `addToCart` ×2 | cart ভরে, স্টক যাচাই, মোট দেখায় |
| 2 | React `submit` | `POST /api/orders/sale` |
| 3 | `TokenAuthHandler` | ইউজার ও role চিনে নেয় |
| 4 | `OrdersController.Sale` | employee id নেয়, transaction শুরু, id নেয় |
| 5 | `pkg_jewelry.create_order` | `orders`-এ সারি |
| 6 | `pkg_jewelry.add_order_item` (প্রতি পণ্যে) | পণ্য লক, স্টক যাচাই, লাইন, স্টক কমানো, `SALE` লগ, মোট বাড়ানো |
| 7 | `tx.Commit()` | সব একসাথে সংরক্ষণ |
| 8 | React | "Order #N" দেখায়। স্টক কম হলে লাল বার্তা, কিছুই সংরক্ষিত হয় না |

### প্রবাহ ৩: অর্ডার cancel (শুধু Manager)

| # | স্তর | কী ঘটে |
|---|---|---|
| 1 | React `Orders.cancel` | `POST /api/orders/{id}/cancel` |
| 2 | Backend | `[Authorize(Roles="Manager")]` যাচাই (Staff হলে 403) |
| 3 | `pkg_jewelry.cancel_order` | অর্ডার লক, আগে বাতিল হয়েছে কিনা দেখে, স্টক ফেরত, `RETURN` লগ, status `Cancelled` |
| 4 | React | তালিকা নতুন করে আনে |
| 5 | দ্বিতীয়বার চাপলে | ORA-20004 → 409 → "Order is already cancelled." |

### প্রবাহ ৪: Restock

React `Stock.submit` → `POST /api/stock/restock` → `StockController.Restock` (Manager) → `pkg_jewelry.restock_product` → `products.stock_quantity` বাড়ে + `RESTOCK` লগ।

### প্রবাহ ৫: Dashboard

React `Dashboard.useEffect` → `GET /api/reports/dashboard` → `ReportsController.Dashboard` → ৫টি query (`orders`, `products`, `order_items` join) → JSON → কার্ড, বার, টেবিল।

---

## ৬. কোন কাজ কোথায়: দ্রুত খোঁজার টেবিল

| কাজ | Database | Backend | Frontend |
|---|---|---|---|
| ID তৈরি | sequence + trigger | (insert-এ `NEXTVAL`) | - |
| স্টক ঋণাত্মক আটকানো | check constraint + `add_order_item` | error → 400 | লাল বার্তা |
| বিক্রি | `create_order`, `add_order_item` | `OrdersController.Sale` | `NewSale.jsx` |
| একসাথে দুজন কেনা আটকানো | `FOR UPDATE` লক | - | - |
| Cancel | `cancel_order` | `OrdersController.Cancel` | `Orders.jsx` |
| Restock | `restock_product` | `StockController.Restock` | `Stock.jsx` |
| পাসওয়ার্ড নিরাপত্তা | `password_hash` কলাম | `PasswordHasher` | - |
| Login যাচাই | - | `AuthController.Login`, `TokenStore`, `TokenAuthHandler` | `Login.jsx`, `api.js` |
| অনুমতি (role) | `employees.role` | `[Authorize(Roles)]` | বাটন লুকানো |
| তালিকা (পণ্য/অর্ডার) | views | `GetAll` | `Products.jsx`, `Orders.jsx` |
| Dashboard | - | `ReportsController` | `Dashboard.jsx` |
| Error বার্তা | `RAISE_APPLICATION_ERROR` | `Program.cs` handler | `Messages.jsx` |
| মোবাইল ডিজাইন | - | - | `styles.css` |

---

## ৭. ডেমোতে কোন ফাইল খুলবেন

1. ER ও class diagram।
2. SQL\*Plus: `06_upgrade.sql`-এর package, stock ঋণাত্মক error, `record_sale`, `cancel_order`।
3. `OrdersController.cs`: `Sale` method (transaction দেখাতে)।
4. `Program.cs`: error handler আর login ব্যবস্থা।
5. `PasswordHasher.cs`: hash কেন দরকার।
6. Swagger: login → Authorize → বিক্রি।
7. ওয়েবসাইট: Staff দিয়ে login (সীমিত অধিকার), তারপর Admin।
8. `api.js`: token কীভাবে প্রতিটি অনুরোধে যায়।

---

## ৮. বলার ধারা (মুখস্থ নয়, পয়েন্ট ধরে বলুন)

1. "প্রথমে ডিজাইন: আটটি টেবিল, তাদের সম্পর্ক এই ER diagram-এ।"
2. "ডাটাবেসে শুধু ডাটা নয়, নিয়মও রেখেছি। স্টক ঋণাত্মক হতে পারে না, এটা constraint আর package দুই জায়গা থেকে আটকায়।"
3. "বিক্রি একটা transaction। দুটি পণ্যের একটার স্টক কম হলে পুরো বিক্রি বাতিল।"
4. "Backend ডাটাবেসকে কেবল ডাকে, নিয়ম নিজে বানায় না। কাজ হলো login, অনুমতি, আর error সুন্দর করে দেখানো।"
5. "Frontend শুধু দেখায় ও ডাকে। বাটন লুকানো সুবিধার জন্য, নিরাপত্তা backend-এ।"
6. "পাসওয়ার্ড hash করে রাখা, তাই ডাটাবেস চুরি হলেও আসল পাসওয়ার্ড জানা যায় না।"

---

## ৯. সম্ভাব্য প্রশ্ন ও উত্তর

**১. নিয়ম C# এ না লিখে PL/SQL এ কেন?**
নিয়ম এক জায়গায় থাকে এবং একটি transaction হিসেবে চলে। যে অ্যাপই ডাটাবেস ব্যবহার করুক, নিয়ম একই থাকে।

**২. দুজন একসাথে শেষ পণ্যটি কিনলে কী হয়?**
`SELECT ... FOR UPDATE` পণ্যের সারি লক করে। দ্বিতীয় জনকে অপেক্ষা করতে হয়, তারপর সে দেখে স্টক শেষ এবং error পায়।

**৩. পাসওয়ার্ড কীভাবে সংরক্ষিত?**
plain text নয়। salt সহ PBKDF2 hash (১,০০,০০০ বার)। প্রতিটি পাসওয়ার্ডের salt আলাদা, তাই একই পাসওয়ার্ডের hash আলাদা হয়।

**৪. Token কী, কেন JWT নয়?**
Token হলো login-এর পর পাওয়া র‍্যান্ডম কোড, যা প্রতিটি অনুরোধে পাঠানো হয়। আমি সরল পদ্ধতি নিয়েছি: সার্ভারের মেমোরিতে রাখা। JWT হলে সার্ভারে রাখতে হতো না, কিন্তু অতিরিক্ত লাইব্রেরি লাগত।

**৫. Staff cancel বাটন না দেখলেও API ডাকলে?**
403 পাবে। অনুমতি backend-এ যাচাই হয়, frontend-এর বাটন শুধু সুবিধার জন্য।

**৬. SQL Injection কীভাবে আটকালেন?**
সব query-তে parameter binding (`:name`)। ইনপুট কখনো SQL লেখায় জোড়া লাগে না।

**৭. Entity Framework কেন নয়?**
নিয়ম ইতিমধ্যে PL/SQL ও view-তে আছে। Dapper দিয়ে সরাসরি SQL ও procedure call করা সহজ। আর Oracle 10g-এর জন্য EF-এর Oracle provider উপযুক্ত নয়।

**৮. Cancel করলে অর্ডার মুছে ফেলেন না কেন?**
status বদলে stock ফেরত দিই, কিন্তু ইতিহাস রাখি। রিপোর্টে কাজে লাগে।

**৯. `order_items`-এ `unit_price` আবার কেন?**
পরে পণ্যের দাম বদলালেও পুরোনো অর্ডারে ক্রেতার দেওয়া আসল দাম থেকে যায়।

**১০. `total_amount` ও `line_total` রাখলেন কেন, হিসাব করেও তো পাওয়া যায়?**
ইচ্ছাকৃত। দ্রুত পড়া যায় এবং বিক্রির সময়ের হিসাব অপরিবর্তিত থাকে।

**১১. Making charge কীভাবে ধরা হয়?**
টুকরো প্রতি দাম = unit price + making charge। এই দাম `order_items.unit_price`-এ সংরক্ষিত হয়।

**১২. ফ্রন্টএন্ড ও ব্যাকএন্ড আলাদা কেন?**
একটি বদলালে অন্যটিকে ছুঁতে হয় না, আর একই API ওয়েব ও মোবাইল দুটিতেই চলে।

---

## ১০. সীমাবদ্ধতা (নিজেই বলে দিন)

- `Pending` order status টেবিলে আছে কিন্তু এখনো ব্যবহার হয় না।
- পাসওয়ার্ড বদলানোর পেজ নেই।
- রসিদ প্রিন্টের সুবিধা নেই।
- Token মেমোরিতে থাকে, তাই API restart হলে সবাই logout হয়।
- HTTPS নেই (শুধু লোকাল ডেমোর জন্য)।
- Employee মুছে ফেলার বা বদলানোর পেজ নেই।
- ভবিষ্যতে: Pending অর্ডার, পাসওয়ার্ড বদল, রসিদ প্রিন্ট, আরও রিপোর্ট।

---

## ১১. নতুন ফিচার (সংস্করণ ২)

### ১১.১ Pending অর্ডার (hold)
- **কী:** বিক্রি সঙ্গে সঙ্গে না করে অর্ডার ধরে রাখা। পণ্যের স্টক **সংরক্ষিত** (reserved) থাকে, মানে সাথে সাথে কমে যায়।
- **Database:** `create_order`-এ নতুন `p_status` ('Completed' বা 'Pending')। নতুন procedure `complete_order`: অর্ডার লক করে, status 'Pending' না হলে error -20005, নয়তো 'Completed' করে।
- **Cancel:** Pending অর্ডার cancel করলে স্টক ফেরত আসে (আগের `cancel_order`-ই কাজ করে)।
- **Backend:** `OrdersController.Sale` এ `pending` ফ্ল্যাগ, নতুন `Complete` (`POST /api/orders/{id}/complete`)। ORA-20005 → 409, ORA-20006 → 400।
- **Frontend:** `NewSale.jsx` এ "Hold as Pending" টিক; `Orders.jsx` এ Pending সারিতে **Complete** বাটন।

### ১১.২ রসিদ প্রিন্ট
- **Backend:** `OrdersController.Receipt` (`GET /api/orders/{id}/receipt`): অর্ডারের হেডার (customer, employee, তারিখ, মোট) ও লাইনগুলো।
- **Frontend:** `components/Receipt.jsx` পপ-আপ। রসিদ নম্বর `AL-000123` (order id থেকে)। **Print** বাটন `window.print()` চালায়; CSS `@media print` শুধু রসিদটা ছাপায়। "Save as PDF" দিয়ে PDF-ও হয়।
- বিক্রির পর রসিদ নিজে থেকে খোলে; Orders ট্যাবে প্রতিটি অর্ডারে **Receipt** বাটন।

### ১১.৩ পাসওয়ার্ড বদল ও কর্মচারী ব্যবস্থাপনা
- `POST /api/auth/change-password`: নিজের পাসওয়ার্ড বদল (বর্তমান পাসওয়ার্ড লাগে, নতুন কমপক্ষে ৬ অক্ষর)। ভুল হলে 400 (401 নয়, যাতে ওয়েবসাইট logout না করে দেয়)।
- Manager: কর্মচারীর তথ্য বদল (`PUT /api/employees/{id}`), login বন্ধ/চালু (`POST .../active`), পাসওয়ার্ড রিসেট (`POST .../reset-password`)।
- **Database:** `employees.is_active` (0/1)। বন্ধ থাকলে login হয় না ("This account is disabled")।
- **নিরাপত্তা নিয়ম:** নিজেকে disable করা যায় না, আর অন্তত একজন active Manager সবসময় থাকতে হবে। disable, role বদল বা পাসওয়ার্ড রিসেট করলে তার সব token মুছে যায় (`TokenStore.RevokeEmployee`), সে সঙ্গে সঙ্গে logout।

### ১১.৪ সার্চ ও ফিল্টার
- Products: নাম/ধাতু/category/supplier লিখে সার্চ, category ও metal ফিল্টার, "Low stock only"।
- Customers: নাম, মোবাইল, ইমেইল, ঠিকানা দিয়ে সার্চ।
- Orders: অর্ডার নম্বর/customer/staff, status, তারিখ (From-To)।
- এগুলো ব্রাউজারে লোড হওয়া তালিকার ওপর হয়। ডাটা খুব বেশি হলে server-side সার্চ লাগবে (সীমাবদ্ধতা)।

### ১১.৫ Customer purchase history
- `CustomersController.History` (`GET /api/customers/{id}/history`): customer-এর তথ্য, মোট খরচ (শুধু Completed অর্ডার), অর্ডার সংখ্যা, সব অর্ডারের তালিকা।
- Customers ট্যাবে **History** বাটন পপ-আপ খোলে, সেখান থেকে রসিদও দেখা যায়।

### ১১.৬ বিক্রির রিপোর্ট ও CSV
- `ReportsController.Sales` (`GET /api/reports/sales?from=&to=`), **শুধু Manager**: মোট বিক্রি, অর্ডার, বিক্রিত আইটেম, গড় অর্ডার, দিন/category/পণ্য/কর্মচারী অনুযায়ী ভাগ। শুধু Completed অর্ডার গোনা হয়। সর্বোচ্চ ১ বছরের পরিসর।
- **CSV:** `api.js`-এর `downloadCsv` ব্রাউজারেই ফাইল বানায় (Excel-এ খোলে)। Products, Customers, Orders ও প্রতিটি রিপোর্ট টেবিলে **Export CSV**।

### ১১.৭ Dark mode
- `styles.css`-এ সব রঙ CSS variable (`--bg`, `--card`, ...)। `<html data-theme="dark">` হলে ভিন্ন মান বসে।
- `App.jsx`: চাঁদ/সূর্য বাটন থিম বদলায় এবং `localStorage`-এ মনে রাখে।

### ১১.৮ কোন ফাইলে কী (নতুন/বদলানো)

| ফিচার | Database | Backend | Frontend |
|---|---|---|---|
| Pending | `07_features.sql` (`create_order`, `complete_order`) | `OrdersController` (Sale, Complete), `Program.cs` | `NewSale.jsx`, `Orders.jsx` |
| রসিদ | - | `OrdersController.Receipt` | `components/Receipt.jsx`, `components/Modal.jsx` |
| পাসওয়ার্ড/কর্মচারী | `employees.is_active` | `AuthController`, `EmployeesController`, `TokenStore` | `ChangePassword.jsx`, `Setup.jsx` |
| সার্চ/ফিল্টার | - | - | `Products.jsx`, `Customers.jsx`, `Orders.jsx` |
| History | - | `CustomersController.History` | `Customers.jsx` |
| রিপোর্ট/CSV | - | `ReportsController.Sales` | `Reports.jsx`, `api.js` |
| Dark mode | - | - | `styles.css`, `App.jsx`, `main.jsx` |

### ১১.৯ নতুন প্রশ্নোত্তর

**Pending অর্ডারে স্টক কেন আগেই কমে?** যাতে একই পণ্য অন্য কাউকে বিক্রি না হয়ে যায়। cancel করলে স্টক ফেরত আসে।

**শেষ Manager-কে disable করা যায় না কেন?** তাহলে কেউ আর পণ্য, কর্মচারী বা রিপোর্ট ম্যানেজ করতে পারত না।

**Disable করলে সঙ্গে সঙ্গে কীভাবে logout হয়?** তার সব token সার্ভারের মেমোরি থেকে মুছে যায়, পরের অনুরোধে 401।

**CSV কেন browser-এ বানানো?** সার্ভারে বাড়তি কোড লাগে না, আর যা স্ক্রিনে আছে (ফিল্টারসহ) হুবহু সেটাই এক্সপোর্ট হয়।

---

## ১২. নতুন ফিচার (সংস্করণ ৩)

### ১২.১  ডিসকাউন্ট, VAT, পেমেন্ট ও বাকি
- **Database:** `finalize_order` অর্ডারের আইটেমের যোগফল থেকে ডিসকাউন্ট বাদ দেয় (AMOUNT বা PERCENT), তারপর বাকি দামের ওপর দোকানের VAT % যোগ করে। `orders.total_amount` এখন "ক্রেতাকে যা দিতে হবে" (আইটেম - ডিসকাউন্ট + VAT)।
- **Staff-এর সীমা:** Staff সর্বোচ্চ ১০% ডিসকাউন্ট দিতে পারে (Manager যত খুশি)। সীমা পেরোলে ORA-20008।
- **পেমেন্ট:** `order_payments` টেবিলে প্রতিটি পেমেন্ট (Cash, Card, bKash, Nagad, Bank)। `add_payment` দেখে মোট পেমেন্ট যেন বাকির বেশি না হয় (ORA-20009)। বাতিল অর্ডারে পেমেন্ট নেওয়া যায় না (ORA-20012)।
- **বাকি (due):** মোট - পরিশোধিত। Customers ট্যাবে প্রতিজনের বাকি, Orders-এ **Take payment**, Dashboard-এ মোট বাকি।
- সব ধাপ (অর্ডার, আইটেম, ডিসকাউন্ট, VAT, পেমেন্ট) একটি transaction-এ।

### ১২.২  স্টক সমন্বয় (Stock adjustment)
- ভাঙা, হারানো, চুরি, পাওয়া গেছে বা গণনার ভুল: `adjust_stock` স্টক বাড়ায়/কমায় এবং `ADJUSTMENT` লগ লেখে।
- কারণ বাধ্যতামূলক (ORA-20014), শূন্য চলবে না (ORA-20013), স্টক ঋণাত্মক হলে আটকায় (ORA-20015)। শুধু Manager।

### ১২.৩  ক্রয়মূল্য ও লাভ
- `products.cost_price`। Restock-এ ক্রয়মূল্য দিলে গড় ক্রয়মূল্য (weighted average) নতুন করে হিসাব হয়: (পুরোনো স্টক × পুরোনো দাম + নতুন পরিমাণ × নতুন দাম) / মোট স্টক।
- বিক্রির সময় আইটেমে ক্রয়মূল্য কপি হয় (`order_items.cost_price`), তাই পরে দাম বদলালেও পুরোনো লাভ ঠিক থাকে।
- **লাভ = আইটেমের বিক্রয়মূল্য - ক্রয়মূল্য - ডিসকাউন্ট।** VAT আয় নয়, তাই বাদ।
- ক্রয়মূল্য শুধু Manager দেখে (API Staff-এর জন্য 0 পাঠায়)।

### ১২.৪  Audit log
- `audit_log` টেবিল: কে, কখন, কী করল (login, ভুল login, বিক্রি, পেমেন্ট, দাম বদল, কর্মচারী বদল, সেটিং)।
- দাম বদলের সময় পুরোনো -> নতুন মান লেখা হয়। শুধু Manager দেখে (Audit ট্যাব)।
- audit লেখা ব্যর্থ হলেও আসল কাজ থামে না।

### ১২.৫  রসিদের QR কোড ও পাবলিক পেজ
- প্রতিটি অর্ডারে একটি লম্বা র‍্যান্ডম `public_code`। QR-এ থাকে `ওয়েবসাইট/verify/<code>`।
- ক্রেতা scan করলে **login ছাড়া** শুধু পড়ার মতো রসিদ দেখে। তাতে ফোন, ঠিকানা, ইমেইল, কর্মচারীর নাম থাকে না, ক্রেতার শুধু প্রথম নাম থাকে।
- লগইন করা কর্মচারী একই পেজে **Open this order in the system** বাটন পায়।
- `localhost` ফোনে খোলে না। ডেমোতে ওয়েবসাইট লিংক হিসেবে কম্পিউটারের Wi-Fi ঠিকানা দিন। (Setup > Shop settings)

### ১২.৬  PDF, ইমেইল, WhatsApp
- **PDF:** ব্রাউজারে রসিদের ছবি তুলে (html2canvas) jsPDF দিয়ে PDF বানায়।
- **ইমেইল:** SMTP (appsettings.json > Email)। সেটিং না থাকলে পরিষ্কার বার্তা আসে।
- **WhatsApp:** `wa.me` লিংক, কোনো সেটআপ লাগে না।

### ১২.৭  চার্ট
- Dashboard: গত ৩০ দিনের line chart; category ও পেমেন্ট পদ্ধতির pie chart। Reports-এ তারিখ অনুযায়ী একই।
- চার্টগুলো সরাসরি SVG দিয়ে আঁকা, বাইরের লাইব্রেরি লাগেনি।

### ১২.৮  Shop settings ও Backup
- Setup > Shop settings: দোকানের নাম, ঠিকানা, ফোন, VAT %, ওয়েবসাইট লিংক।
- Backup/restore: `docs/BACKUP_RESTORE.md` ও `scripts/backup_auralucis.bat`, `restore_auralucis.bat` (Oracle `exp`/`imp`)।

### ১২.৯  নতুন প্রশ্নোত্তর
**QR-এ লগইন পেজের লিংক না দিয়ে আলাদা পেজ কেন?** ক্রেতা admin login দেখবে না, আর অন্য কারও তথ্যও দেখবে না। শুধু নিজের রসিদ, একটা না-অনুমান-করা কোড দিয়ে।
**ডিসকাউন্ট সীমা কোথায় আটকায়?** Database-এ (`finalize_order`), তাই API বাইপাস করলেও আটকাবে।
**লাভে VAT ধরা হয় না কেন?** VAT সরকারের পাওনা, দোকানের আয় নয়।
**পুরোনো অর্ডারের লাভ কেন বদলায় না?** বিক্রির সময়ের ক্রয়মূল্য আইটেমে সংরক্ষিত।

---

## ১৩. মেটাল রেট অনুযায়ী দাম ও শতকরা মেকিং চার্জ (সংস্করণ ৪)

### ১৩.১ কী
- সোনা/রুপার দৈনিক দর (প্রতি গ্রাম) আলাদা টেবিলে (`metal_rates`) জমা থাকে, পুরোনো দরও ইতিহাস হিসেবে থাকে।
- পণ্যের দাম দুইভাবে হতে পারে: **FIXED** (নিজে লেখা দাম) অথবা **RATE** (ওজন × আজকের দর)।
- মেকিং চার্জ হতে পারে নির্দিষ্ট টাকা অথবা দামের **শতকরা (%)**।

### ১৩.২ কীভাবে কাজ করে
- **Database:** `set_metal_rate` নতুন দর সংরক্ষণ করে এবং ওই ধাতু ও purity-র সব RATE পণ্যের দাম নতুন করে হিসাব করে (`reprice_products`)।
- সূত্র: `unit_price = ওজন × দর`; মেকিং % থাকলে `making_charge = unit_price × % / 100`।
- দাম `products.unit_price` ও `making_charge` কলামেই জমা থাকে, তাই বিক্রি, রসিদ ও রিপোর্ট আগের মতোই চলে।
- দর না থাকলে RATE পণ্য সেভ হয় না (ORA-20017 "No rate is set for Gold 22K").
- যে অর্ডার আগে বিক্রি হয়েছে বা Pending, তার দাম বদলায় না (বিক্রির সময়ের দাম আইটেমে জমা)।
- `vw_current_rates` view প্রতিটি ধাতু ও purity-র সর্বশেষ দর দেয়।

### ১৩.৩ কোন ফাইলে কী
| অংশ | ফাইল |
|---|---|
| Database | `database/09_metal_rates.sql` (টেবিল, view, `reprice_products`, `set_metal_rate`) |
| Backend | `RatesController` (দর দেখা, ইতিহাস, দর বসানো), `ProductsController` (RATE ও % সংরক্ষণ, transaction-এ reprice) |
| Frontend | `Rates.jsx` (Manager), `Products.jsx` (Pricing ও Making charge-এর ধরন), `Dashboard.jsx` (আজকের দর) |

### ১৩.৪ প্রশ্নোত্তর
**দাম প্রতিবার হিসাব না করে কলামে জমা রাখা কেন?** পুরো সিস্টেম (বিক্রি, রসিদ, রিপোর্ট) আগের মতো চলে, আর দর বদলালে একবারই সব পণ্য হালনাগাদ হয়।
**দর বদলালে পুরোনো রসিদ কি বদলায়?** না। বিক্রির সময়ের দাম `order_items`-এ সংরক্ষিত।
**Staff কি দর বসাতে পারে?** না, শুধু Manager। Staff Dashboard-এ আজকের দর দেখতে পারে।

---

## ১৪. বিক্রয় ফেরত, রিফান্ড ও এক্সচেঞ্জ (সংস্করণ ৫)

### ১৪.১ কী
- ম্যানেজার একটি সম্পূর্ণ (Completed) অর্ডারের কিছু আইটেম ফেরত নিতে পারে এবং হয় **টাকা ফেরত (refund)** দেয়, নয়তো **অন্য পণ্যের সাথে বদল (exchange)** করে।
- ফেরত আইটেম স্টকে ফিরে যায় (`RETURN` লগ), আর অর্ডারে ফেরতের হিসাব থাকে।
- শুধু Manager, কারণ টাকা বের হয়।

### ১৪.২ টাকার হিসাব
- ফেরত আইটেমের মূল্য (credit) = আইটেমের দাম - অর্ডারের ডিসকাউন্টের অংশ + VAT-এর অংশ। যেমন সব আইটেম ফেরত দিলে ঠিক অর্ডারের মোট টাকাই ফেরত আসে।
- `orders.returned_amount` ফেরতের মোট মূল্য। বাকি (due) = মোট - ফেরত - পরিশোধিত।
- ফেরত টাকা দিলে `paid_amount` কমে, তাই বাকি ঠিক থাকে।
- ফেরতযোগ্য টাকা = পরিশোধিত - (মোট - ফেরত)। ক্রেতা যদি আগে পুরো টাকা না দিয়ে থাকে, ফেরতে প্রথমে তার বাকি কমে, তারপর বাড়তি অংশ টাকা হিসেবে ফেরত যায়।

### ১৪.৩ এক্সচেঞ্জ
- একই transaction-এ: ফেরত নেওয়া হয়, নতুন অর্ডার তৈরি হয়, ফেরতের টাকা নতুন অর্ডারে `Exchange` পেমেন্ট হিসেবে বসে, ক্রেতা বাকি পার্থক্য দেয়।
- নতুন পণ্যের দাম ফেরত পণ্যের চেয়ে কম হলে সিস্টেম আটকায় (নগদ ফেরত আলাদা করে refund দিয়ে করতে হবে)।
- `Exchange` পেমেন্ট "টাকা পাওয়া" রিপোর্টে ধরা হয় না, কারণ টাকা দোকানেই আছে।

### ১৪.৪ Database
- নতুন টেবিল `order_returns`, `order_return_items`; নতুন কলাম `order_items.returned_qty`, `orders.returned_amount/discount/vat`।
- Package `pkg_returns`: `start_return` (সম্পূর্ণ অর্ডার ও কারণ যাচাই), `return_item` (স্টক ফেরত, লাইনে returned_qty), `finish_return` (credit হিসাব), `settle_return` (টাকা ফেরত বা exchange)।
- Error: ORA-20020 (সম্পূর্ণ নয় এমন অর্ডার), 20021 (কারণ নেই), 20022 (আইটেম বাছা হয়নি), 20025 (বিক্রির চেয়ে বেশি ফেরত), 20028 (পাওনার চেয়ে বেশি রিফান্ড)।
- ফেরতের পর অর্ডার cancel করা যায় না (না হলে স্টক দুইবার ফিরত)। এটা API-তে আটকানো হয়েছে।

### ১৪.৫ রিপোর্ট
- Dashboard ও Reports-এর বিক্রি, লাভ, বাকি ফেরত বাদ দিয়ে (net) দেখায়। ফেরত যে বিক্রি থেকে এসেছে, সেটাই কমে।
- "টাকা পাওয়া" = পেমেন্ট - রিফান্ড।

### ১৪.৬ কোন ফাইলে কী
| অংশ | ফাইল |
|---|---|
| Database | `database/10_returns.sql` |
| Backend | `ReturnsController` (refund, exchange, history), `ReportsController`, `OrdersController`, `CustomersController`, `ReceiptService` |
| Frontend | `Returns.jsx` (Manager), `Receipt.jsx`, `Verify.jsx`, `Orders.jsx`, `Reports.jsx` |

### ১৪.৭ প্রশ্নোত্তর
**ফেরতে ডিসকাউন্ট ও VAT কেন ধরা হয়?** ক্রেতা আসলে যে টাকা দিয়েছে তার অনুপাতেই ফেরত পাওয়া উচিত।
**ফেরতের পর cancel বন্ধ কেন?** cancel সব স্টক ফেরত দেয়, ফেরত আইটেমের স্টক আগেই ফিরেছে, তাই দুইবার হয়ে যেত।
**সব এক transaction কেন?** ফেরত, স্টক, টাকা ও নতুন অর্ডার সব একসাথে হবে, নয়তো কিছুই হবে না।

---

## ১৫. সরবরাহকারীর কাছ থেকে ক্রয় (সংস্করণ ৬)

### ১৫.১ কী
- কার কাছ থেকে, কোন চালান নম্বরে, কোন পণ্য কত পরিমাণে, কত দামে কেনা হলো তার হিসাব।
- কেনা মাত্র **স্টক বাড়ে**, পণ্যের **গড় ক্রয়মূল্য** নতুন করে হিসাব হয়, আর স্টকের ইতিহাসে `RESTOCK` লাইন বসে (সরবরাহকারী ও ক্রয়মূল্যসহ)।
- সরবরাহকারীকে কত টাকা বাকি আছে এবং কবে কত দেওয়া হলো, তার হিসাব। একবারে বা কিস্তিতে পরিশোধ করা যায়।
- শুধু Manager।

### ১৫.২ Database (`database/11_purchases.sql`)
- টেবিল: `purchases` (মোট, পরিশোধিত, চালান নম্বর), `purchase_items` (পণ্য, পরিমাণ, ক্রয়মূল্য), `purchase_payments` (সরবরাহকারীকে পেমেন্ট)। View: `vw_purchase_summary` (বাকি = মোট - পরিশোধিত)।
- Package `pkg_purchases`: `start_purchase` (ক্রয় খোলে), `add_purchase_item` (পণ্য লক করে, গড় ক্রয়মূল্য ও স্টক হালনাগাদ, লগ), `pay_supplier` (পাওনার বেশি দেওয়া আটকায়, ORA-20029)।
- গড় ক্রয়মূল্য = (পুরোনো স্টক × পুরোনো দাম + নতুন পরিমাণ × নতুন দাম) / মোট স্টক।
- Table-এর check constraint: পরিশোধিত কখনো মোটের বেশি হতে পারে না।

### ১৫.৩ Backend ও Frontend
- `PurchasesController`: তালিকা, বিস্তারিত (পণ্য ও পেমেন্টসহ), নতুন ক্রয়, সরবরাহকারীকে পেমেন্ট। ক্রয়ের সব ধাপ (ক্রয়, পণ্য, প্রথম পেমেন্ট) একটি transaction-এ।
- `Purchases.jsx`: ক্রয়ের ফর্ম (পণ্য যোগ, মোট, এখন কত দিচ্ছেন, বাকি), ক্রয়ের তালিকা, Details, Pay supplier, CSV।

### ১৫.৪ প্রশ্নোত্তর
**Restock আর Purchase-এ পার্থক্য কী?** Restock দ্রুত স্টক বাড়ায়। Purchase পুরো চালান (সরবরাহকারী, নম্বর, বাকি, পেমেন্ট) রাখে, আর স্টক ও ক্রয়মূল্যও হালনাগাদ করে।
**গড় ক্রয়মূল্য কেন?** একই পণ্য আলাদা দামে কিনলে লাভ ঠিকমতো হিসাব করতে।
**সরবরাহকারীকে বেশি টাকা দিলে?** `pkg_purchases` আটকায়, তাই ভুল হতে পারে না।
