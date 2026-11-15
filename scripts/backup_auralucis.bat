@echo off
REM AURALUCIS database backup (Oracle 10g XE, classic "exp" tool)
REM Double-click this file, or run it from cmd. The backup goes to C:\AURALUCIS_BACKUP
setlocal
set /p DBUSER=Oracle user (for example lucifer): 
set /p DBPASS=Oracle password: 
if not exist C:\AURALUCIS_BACKUP mkdir C:\AURALUCIS_BACKUP
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmm"') do set STAMP=%%i

echo.
echo Backing up schema %DBUSER% ...
exp userid=%DBUSER%/%DBPASS%@XE owner=%DBUSER% file=C:\AURALUCIS_BACKUP\auralucis_%STAMP%.dmp log=C:\AURALUCIS_BACKUP\auralucis_%STAMP%.log

echo.
echo Done. Check the files in C:\AURALUCIS_BACKUP
echo   auralucis_%STAMP%.dmp   (the backup)
echo   auralucis_%STAMP%.log   (the report: look for "Export terminated successfully")
pause
