@echo off
title [1-CLICK] Chay E2E Testing Salon Spa (Deterministic Mode)
color 0A
cls
echo ==============================================================================
echo             SALON-SPA BOOKING - E2E TESTING AUTOMATION
echo                Che do: Quick Deterministic E2E Test
echo ==============================================================================
echo.
echo [*] Dang khoi dong Frontend va kich hoat bo kiem thu E2E...
echo.

cd /d "%~dp0..\.."
call npm run test:ai:e2e:deterministic

echo.
if %errorlevel% equ 0 (
    echo ==============================================================================
    echo [THANH CONG] Toan bo test case Salon-Spa da vuot qua - 100 PERCENT PASSED!
    echo Bao cao chi tiet: .e2e\report.json
    echo ==============================================================================
) else (
    echo ==============================================================================
    echo [LUU Y] Co test case chua dat, vui long kiem tra log ben tren.
    echo ==============================================================================
)
echo.
pause
