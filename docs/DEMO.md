# AURALUCIS — Demo Checklist

Use a dedicated demo database containing sample data only.
Never demonstrate with real customer, employee, order or payment information.

## 1. Start the application

1. Start OracleServiceXE and OracleXETNSListener.
2. Start the backend from `backend\JewelryApi` using `dotnet run`.
3. Start the frontend from `frontend` using `npm run dev`.
4. Open `http://localhost:5173`.
5. Sign in using a locally provisioned demo employee account.

There are no default demo passwords. Create employee accounts locally
and use the appropriate roles for the demonstration.

## 2. Core application walkthrough

1. Show the ER diagram and explain the database structure.
2. Show the Dashboard.
3. Open Products and demonstrate product records.
4. Open Customers and demonstrate customer records.
5. Create a sale with multiple products.
6. Open Orders and review the sale.
7. Open Stock and review stock information.
8. Open Rates and demonstrate metal-rate configuration.
9. Open Reports and show the available reporting features.
10. Open Audit and explain how activities are recorded.
11. Open Setup and demonstrate shop and employee settings.

## 3. Role and access demonstration

Use separate demo accounts for the available roles.

1. Sign in as Owner or Manager and demonstrate the permitted management features.
2. Sign in as Staff and demonstrate the restricted interface.
3. Show that access to restricted operations is controlled by the application.
4. Never use a real employee account for a public demonstration.

## 4. Additional features

Where configured and available in the current build, demonstrate:

- Dark mode and responsive mobile layout.
- Pending orders and order completion.
- Receipt printing and PDF export.
- Order filtering and CSV export.
- Customer purchase history.
- Reports and charts.
- Employee management and password changes.
- Public product catalogue and receipt verification.
- Product image uploads.
- Metal-rate pricing and rate history.
- Returns and exchanges.
- Supplier purchases and supplier payments.

## 5. Configuration-dependent features

- Configure SMTP before demonstrating email delivery or password recovery.
- Configure Cloudinary before demonstrating image uploads.
- Configure the shop website URL before demonstrating receipt QR links.
- Use a phone on the same network when demonstrating a locally hosted website.

## 6. Safety during the demo

- Use disposable demo records for sales, returns, exchanges and purchases.
- Do not run destructive tests against a database containing real business data.
- Do not run the full smoke test against the live working database.
- Do not expose database credentials, API secrets or private configuration files.
- Review `docs/BACKUP_RESTORE.md` before demonstrating database restoration.
