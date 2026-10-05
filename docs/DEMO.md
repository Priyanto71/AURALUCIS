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
