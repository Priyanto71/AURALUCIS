-- =========================================================
-- AURALUCIS: FULL CLEAN INSTALL (scripts 01 to 13, then the install check)
-- Run it in an EMPTY schema, from this folder:
--      sqlplus USER/PASSWORD@127.0.0.1:1521/XE @install_all.sql
-- It writes everything it prints to install_log.txt next to it.
-- Do NOT run it on a database that already has your data (use the single upgrade scripts for that).
-- =========================================================
SET DEFINE OFF
SET ECHO OFF
SET SERVEROUTPUT ON SIZE 100000
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SPOOL install_log.txt

PROMPT ===== 01 sequences and tables =====
@@01_sequences_tables.sql
PROMPT ===== 02 triggers =====
@@02_triggers.sql
PROMPT ===== 03 views =====
@@03_views.sql
PROMPT ===== 04 first package =====
@@04_package.sql
PROMPT ===== 05 seed data =====
@@05_seed_data.sql
PROMPT ===== 06 login columns and multi-product sales =====
@@06_upgrade.sql
PROMPT ===== 07 pending orders =====
@@07_features.sql
PROMPT ===== 08 payments, VAT, cost, audit, settings =====
@@08_sales_finance_audit.sql
PROMPT ===== 09 metal rates =====
@@09_metal_rates.sql
PROMPT ===== 10 returns and exchanges =====
@@10_returns.sql
PROMPT ===== 11 supplier purchases =====
@@11_purchases.sql
PROMPT ===== 12 public catalogue and password recovery =====
@@12_public_catalog_owner.sql
PROMPT ===== 13 product identification, old gold and service jobs =====
@@13_missing_features.sql
PROMPT ===== check =====
@@check_install.sql

SPOOL OFF
PROMPT
PROMPT SQL scripts finished. Check install_log.txt for "ALL GOOD".
PROMPT Create the first Owner account separately using the local bootstrap command.
PROMPT If you see "ORA-" errors in the log, send me the lines around them.
EXIT
