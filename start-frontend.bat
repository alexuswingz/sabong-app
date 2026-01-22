@echo off
echo ========================================
echo    SABONG DECLARATOR - Frontend
echo ========================================
echo.

cd /d "%~dp0frontend"

echo Installing dependencies...
call npm install

echo.
echo ========================================
echo    Starting Frontend Dev Server...
echo ========================================
echo.
echo Open http://localhost:5173 in your browser
echo.

call npm run dev

pause
