# AURALUCIS: Database backup and restore (Oracle 10g XE)

Your data lives in the Oracle schema (for example `lucifer`). If the computer breaks or the data is deleted by mistake, a backup lets you bring it back.

## What to back up

| What | How | How often |
|---|---|---|
| The database (all tables, data, package, views) | `scripts\backup_auralucis.bat` (Oracle `exp`) | every day the shop is open, and before any upgrade script |
| `backend\JewelryApi\appsettings.json` (connection string, e-mail, SMS settings) | copy the file to the backup folder | when it changes |
| The code | already on GitHub | every commit |

Copy the backup folder (`C:\AURALUCIS_BACKUP`) to a USB drive or cloud drive too. A backup on the same computer does not help if that computer is lost.

## 1. Take a backup

1. Double-click `scripts\backup_auralucis.bat`.
2. Type the Oracle user (for example `lucifer`) and its password.
3. When it finishes, open the `.log` file. The last lines must say `Export terminated successfully without warnings.`
4. The backup is the `.dmp` file with the date and time in its name.

The same thing by hand, in cmd:

```
exp userid=lucifer/YOUR_PASSWORD@XE owner=lucifer file=C:\AURALUCIS_BACKUP\auralucis.dmp log=C:\AURALUCIS_BACKUP\auralucis.log
```

If cmd says `'exp' is not recognized`, open the folder that contains it first:

```
cd C:\oraclexe\app\oracle\product\10.2.0\server\BIN
```

## 2. Test that the backup really works (do this once, before you need it)

A backup you never tested is only a hope. Restore it into a separate, empty user:

```
sqlplus system/YOUR_SYSTEM_PASSWORD@XE
```
```sql
CREATE USER restore_test IDENTIFIED BY test1234;
GRANT CONNECT, RESOURCE, CREATE VIEW TO restore_test;
ALTER USER restore_test QUOTA UNLIMITED ON USERS;
EXIT
```

Then run `scripts\restore_auralucis.bat` and answer:
- backup file: your `.dmp` file
- user the backup was taken from: `lucifer`
- user to restore into: `restore_test` (password `test1234`)

Check the numbers match:

```
sqlplus restore_test/test1234@XE
```
```sql
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM order_payments;
```
Compare them with the same queries as `lucifer`. When they match, the backup works. Remove the test user afterwards:

```sql
DROP USER restore_test CASCADE;
```

## 3. Real restore after a disaster

Only do this when the real data is damaged or lost.

1. Close the API (`dotnet run` window) so nobody is connected.
2. As `system`, delete the damaged schema and create it again:
   ```sql
   DROP USER lucifer CASCADE;
   CREATE USER lucifer IDENTIFIED BY YOUR_PASSWORD;
   GRANT CONNECT, RESOURCE, CREATE VIEW TO lucifer;
   ALTER USER lucifer QUOTA UNLIMITED ON USERS;
   ```
3. Run `scripts\restore_auralucis.bat`: backup file = the latest `.dmp`, from user = `lucifer`, to user = `lucifer`.
4. Check the `.restore.log` file says `Import terminated successfully`.
5. Start the API again and sign in. Check the dashboard totals look right.

Everything is restored up to the moment of the backup. Sales made after that backup must be entered again, which is why backups should be frequent.

## 4. Automatic daily backup (optional)

Windows Task Scheduler can run the export every night. Do not save the password in a script that others can read. A simple safe habit is to run `backup_auralucis.bat` yourself at closing time.

## Good habits

- Keep the last 7 daily backups and one backup per month.
- Always take a backup before running a new SQL upgrade script (`07`, `08`, ...).
- Store backups away from the shop computer.
