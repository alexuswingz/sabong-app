@echo off
echo Starting Sabong Backend Server (DEPLOYMENT MODE)...
echo.

cd /d "%~dp0backend"

REM For SERVER deployment: use headless browser
set HEADLESS=true

echo Mode: HEADLESS=%HEADLESS% (stealth mode)
echo.

call venv\Scripts\activate
python server.py
