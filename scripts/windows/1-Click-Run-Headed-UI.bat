@echo off
title [1-CLICK] Chay E2E Test Salon Spa voi Trinh Duyet That (Headed UI Mode)
color 0B
cls
echo ==============================================================================
echo             SALON-SPA BOOKING - E2E TESTING AUTOMATION
echo         Che do: Truc quan Headed Mode (Mo trinh duyet that Chromium)
echo ==============================================================================
echo.
echo [*] Dang mo trinh duyet Chromium de ban truc tiep xem thao tac tu dong...
echo.

cd /d "%~dp0..\.."
call npm run test:ai:e2e:headed

echo.
echo ==============================================================================
echo Hoan tat chay kiem thu truc quan!
echo ==============================================================================
echo.
pause
