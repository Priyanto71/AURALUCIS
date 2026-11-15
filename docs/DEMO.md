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

## Version 3 features to show
1. Setup > Shop settings: set VAT to 5 and save. New sale: two products, discount 10 %, pay half by bKash. The totals box shows discount, VAT, total, paying now and due.
2. The receipt opens: shows discount, VAT, payments and the QR code. Try Print, Download PDF and WhatsApp. E-mail works after it is set up in appsettings.json.
3. Scan the QR code with a phone (same Wi-Fi, website link set to the computer's address): the public receipt page opens without login.
4. Orders: "Take payment" for the due amount. The due becomes 0.
5. Stock: restock with a cost price and supplier; then Stock adjustment (Damaged, remove 1) and see the ADJUSTMENT line in the history.
6. Products: cost price and profit per piece (Manager only). Reports: gross profit, margin, VAT, discounts, dues, and the charts.
7. Dashboard: line chart (30 days) and the two pie charts.
8. Audit: every sale, price change, login and payment is listed with who did it.
9. Backup: run scripts\backup_auralucis.bat and show the .dmp file; explain docs\BACKUP_RESTORE.md.
10. Staff login: discount over 10 % is refused, no cost prices, no Reports or Audit.

## Metal-rate pricing to show
1. Rates tab: set Gold 22K to 1200 per gram. Products: add a ring, 8.5 g, Pricing "By metal rate", making charge "A percent of the price" 10 %. The catalog shows unit price 10200 and making 1020 with small "rate" and "10%" tags.
2. Change the rate to 1250 on the Rates tab. The ring's price updates at once (10625). Dashboard shows "Today's metal rates".
3. Rate history lists both rates with who set them. The audit log shows SET_RATE.
4. A sale made before the change keeps its old price on the receipt.
