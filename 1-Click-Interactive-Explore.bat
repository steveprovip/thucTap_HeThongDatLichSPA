@echo off
title [1-CLICK] AI Autonomous Exploration cho Salon Spa (Kham pha va tim loi)
color 0D
cls
echo ==============================================================================
echo             SALON-SPA BOOKING - E2E TESTING AUTOMATION
echo                  Che do: AI Autonomous Exploration
echo ==============================================================================
echo.
echo [*] AI Agent se tu dong truy cap he thong Salon Spa, tu do kham pha tinh nang va tim loi...
echo.

cd /d "F:\hoc_tap\thuc_tap\du_an"
call npm run test:ai:e2e:explore

echo.
pause
