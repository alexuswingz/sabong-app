@echo off
echo Starting Sabong Backend Server...
echo.

cd /d "%~dp0backend"

REM Headless mode - no browser icon visible
set HEADLESS=true

echo Mode: HEADLESS (stealth mode - no visible browser)
echo.

call venv\Scripts\activate
python server.py
