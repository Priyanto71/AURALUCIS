# AURALUCIS demo checklist

Logins: admin / admin123 (Manager), staff / staff123 (Staff)

## Before the demo
1. Start services OracleServiceXE and OracleXETNSListener.
2. Backend: `cd backend\JewelryApi` then `dotnet run` (stop any old instance first: port 5000).
3. Frontend: `cd frontend` then `npm run dev`, open http://localhost:5173.
4. SQL*Plus logged in as the schema user, with `SET LINESIZE 200` and `SET PAGESIZE 50`.

## Order of the demo
1. ER and class diagram.
2. SQL*Plus: objects, constraints, negative stock error, `record_sale`, `cancel_order`, second cancel error.
3. Swagger: login, Authorize, products, sale with two products, cancel, error cases.
4. Website: login as staff (cannot cancel / add product), logout, login as admin.
5. Dashboard, New sale with 2 products, Orders (items, cancel), Stock history, Setup (add employee).
6. Limitations: Pending status unused, no password change, no receipt print.

## New features to show (after the basic demo)
1. Dark mode button (moon icon, bottom left) and the 4-step phone view (F12, Ctrl+Shift+M).
2. New sale with two products, tick "Hold as Pending": the receipt shows PENDING. Orders tab, press Complete.
3. Receipt: Print, or choose "Save as PDF".
4. Orders tab: filter by status and dates, Export CSV.
5. Customers tab: History button (total spent and orders).
6. Reports tab (Manager): choose dates, Export CSV.
7. Key icon: change your own password. Setup tab: edit an employee, Disable the staff login, then try to log in as staff (blocked).
8. Staff login: no Reports tab, no cancel, no product form.
