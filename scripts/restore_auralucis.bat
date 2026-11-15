@echo off
REM AURALUCIS database restore (Oracle 10g XE, classic "imp" tool)
REM SAFE TEST: restore into a NEW empty user (for example restore_test) to prove the backup works.
REM REAL RESTORE: drop the damaged user first (see docs\BACKUP_RESTORE.md), create it again, then restore into it.
setlocal
set /p DUMP=Backup file (for example C:\AURALUCIS_BACKUP\auralucis_20261008_1030.dmp): 
set /p FROMUSER=User the backup was taken from (for example lucifer): 
set /p TOUSER=User to restore into (for example restore_test): 
set /p TOPASS=Password of the user to restore into: 

imp userid=%TOUSER%/%TOPASS%@XE file=%DUMP% fromuser=%FROMUSER% touser=%TOUSER% ignore=y log=%DUMP%.restore.log

echo.
echo Done. Open the .restore.log file and look for "Import terminated successfully".
pause
