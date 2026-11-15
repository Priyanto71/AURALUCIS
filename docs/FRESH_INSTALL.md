# AURALUCIS: fresh install in one step (recommended if updates went wrong)

Use this when you want a clean, known-good system, for example before a demo, or when the single update zips got mixed up.
It builds a **new, empty database user** with all 11 scripts in the right order. Your old user and its data stay untouched.

## 1. Create an empty Oracle user (once)

```
sqlplus system/YOUR_SYSTEM_PASSWORD@127.0.0.1:1521/XE
```
```sql
CREATE USER auralucis IDENTIFIED BY auralucis123;
GRANT CONNECT, RESOURCE, CREATE VIEW TO auralucis;
ALTER USER auralucis QUOTA UNLIMITED ON USERS;
EXIT
```
(Choose your own password.)

## 2. Install everything

Double-click `scripts\fresh_install.bat` (or run it in cmd), then type `auralucis` and the password.
It runs scripts 01 to 11 and the install check, and writes `database\install_log.txt`.

Open the log. The end must show:
```
ALL GOOD: every table, view, package and column of versions 1 to 11 is installed.
```
plus the two demo logins (`admin`, `staff`). If it lists `MISSING`, `INVALID` or `ORA-` errors, send me the lines around them.

## 3. Point the website at the new user

Edit `backend\JewelryApi\appsettings.json`:
```
"Oracle": "User Id=auralucis;Password=auralucis123;Data Source=127.0.0.1:1521/XE;"
```
Restart `dotnet run`.

## 4. Check it works

```powershell
cd C:\AURALUCIS
powershell -ExecutionPolicy Bypass -File scripts\smoke_test.ps1 -Full
```
Then sign in at http://localhost:5173 with `admin` / `admin123`.

## Demo data
The install includes one sample category, supplier, product, customer and manager. Set the VAT and the website link in Setup, Shop settings; enter a gold rate in Rates; add a few products and customers before a demo.

## Starting over
To reset completely: as SYSTEM run `DROP USER auralucis CASCADE;`, create the user again (step 1) and repeat step 2.
