@echo off
title WCC Cookie Sync for Railway
color 0A

echo.
echo  ============================================================
echo   WCC COOKIE SYNC - Run this on your LOCAL PC
echo  ============================================================
echo.
echo   This script:
echo   1. Opens a browser and logs into WCC
echo   2. Extracts session cookies
echo   3. Pushes them to your Railway backend
echo   4. Repeats every 4 hours
echo.
echo   KEEP THIS WINDOW OPEN while your app is running!
echo.
echo  ============================================================
echo.

cd /d "%~dp0"

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo Please install Python from https://python.org
    echo.
    pause
    exit /b 1
)

:: Install requirements if needed
pip show playwright >nul 2>&1
if errorlevel 1 (
    echo [SETUP] Installing required packages...
    pip install playwright httpx
    echo.
    echo [SETUP] Installing browser...
    playwright install chromium
    echo.
)

:: Check if config needs updating
echo [INFO] Current configuration:
echo        - Edit sync_cookies.py to change RAILWAY_BACKEND URL
echo.

:: Run the sync script
echo [START] Launching cookie sync...
echo.
python sync_cookies.py

echo.
echo [STOPPED] Cookie sync has stopped.
pause
