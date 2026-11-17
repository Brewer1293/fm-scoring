@echo off
rem Double-click to start FM player scoring. Finds Python 3.11 or newer, then runs start.py.
cd /d "%~dp0"
chcp 65001 >nul

call :try py -3 && exit /b 0
call :try python && exit /b 0
call :try python3 && exit /b 0

echo FM player scoring needs Python 3.11 or newer, and it isn't installed yet.
echo.
echo Opening python.org in your browser: download Python and run the installer.
echo On its first screen, tick "Add python.exe to PATH". Then double-click this file again.
start "" "https://www.python.org/downloads/"
echo.
pause
exit /b 1

rem Run start.py with this Python if it's 3.11 or newer. ("python" may be Windows' shortcut to the
rem Microsoft Store rather than Python: the version check fails for it, so the next one is tried.)
:try
%* -c "import sys; sys.exit(sys.version_info < (3, 11))" >nul 2>&1 || exit /b 1
%* start.py
if errorlevel 1 pause
exit /b 0
