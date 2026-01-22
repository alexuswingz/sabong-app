@echo off
echo ==========================================
echo   WCC Cookie Sync - Keep this running!
echo ==========================================
echo.

cd /d "%~dp0"

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found! Please install Python first.
    pause
    exit /b 1
)

:: Install requirements if needed
pip show playwright >nul 2>&1
if errorlevel 1 (
    echo Installing Playwright...
    pip install playwright httpx
    playwright install chromium
)

:: Run the sync script
echo Starting cookie sync...
echo.
python sync_cookies.py

pause
