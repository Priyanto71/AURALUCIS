# AURALUCIS — Fresh Installation

This guide is for a completely new installation in an EMPTY Oracle schema.
It is not an upgrade procedure. Never run the full installer against a database
that already contains AURALUCIS data.

## 1. Prepare Oracle

Create a dedicated Oracle schema using your local Oracle administration tools.
Choose your own strong database password.

Do not put real database passwords in this document, source code, or Git.

## 2. Install the database

Open SQL*Plus using the new schema account.

From the `database` directory, run:

    @install_all.sql

The installer executes migrations 01 through 13 and then runs
`check_install.sql`.

Review `install_log.txt`. The expected successful check includes:

    ALL GOOD: required tables, views, packages and columns of versions 1 to 13 are installed.

If SQL errors occur, stop and investigate them before continuing.

## 3. Configure the backend

Configure the Oracle connection locally in the backend configuration.
Keep `appsettings.json` out of Git.

Alternatively, provide the same configuration value through this environment variable:

    ConnectionStrings__Oracle (maps to ConnectionStrings:Oracle)

Set its value to the connection string for your own Oracle schema.

Optional email settings use Email:Host, Email:Port, Email:User,
Email:Password, Email:From and Email:EnableSsl.
Cloudinary settings use Cloudinary:CloudName, Cloudinary:ApiKey
and Cloudinary:ApiSecret.

These configuration keys can also be supplied through environment variables
using double underscores instead of colons, for example Email__Host and
Cloudinary__CloudName. Never put their secrets in frontend files.

## 4. Create the first Owner

Keep the backend stopped.

From the repository root, run:

    dotnet run --project backend/JewelryApi -- --bootstrap-owner

Enter the requested name, username, email and password in the interactive
terminal. Password input is hidden.

The command refuses to create an Owner if one already exists.

Do not run this command to reset or replace an existing Owner account.

## 5. Start the application

Backend:

    cd backend/JewelryApi
    dotnet run

Frontend, in another terminal:

    cd frontend
    npm install
    npm run dev

Open:

    http://localhost:5173

Sign in using the Owner credentials created in step 4.

## 6. Sample data

The clean installation includes sample categories, suppliers, products,
customers and an employee record. Employee login accounts are provisioned
separately.

Configure shop settings and metal rates before demonstrating pricing.

## 7. Existing installations

For an existing database, do not run `install_all.sql` or repeat migrations
that have already been applied.

Back up the database first. Identify the exact unapplied upgrade scripts and
follow the upgrade procedure for that database version.

## 8. Backup and restore

See `docs/BACKUP_RESTORE.md` before using the backup or restore scripts.

Restore operations can replace database contents. Verify the target schema
and backup before proceeding.
