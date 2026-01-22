@echo off
echo ========================================
echo    SABONG DECLARATOR - Auto Start
echo ========================================
echo.
echo  * Auto-login to WCC (headless browser)
echo  * Stream will appear automatically
echo  * No buttons to click!
echo.
echo ========================================
echo.

echo Starting Backend Server (with auto-login)...
start "Sabong Backend" cmd /k "%~dp0start-backend.bat"

timeout /t 8 /nobreak > nul

echo Starting Frontend...
start "Sabong Frontend" cmd /k "%~dp0start-frontend.bat"

echo.
echo ========================================
echo    Both servers starting!
echo ========================================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Wait 10-15 seconds for auto-login to complete,
echo then the stream will show automatically!
echo.
echo Press any key to close this window...
pause > nul
