@echo off
title [1-CLICK] Chay AI Agent Vibe Testing cho Salon Spa
color 0E
cls
echo ==============================================================================
echo             SALON-SPA BOOKING - E2E TESTING AUTOMATION
echo          Che do: AI Agent (Natural Language Vibe Testing)
echo ==============================================================================
echo.
echo [*] Kiem tra API Key trong file .env ...

cd /d "F:\hoc_tap\thuc_tap\du_an"

echo.
echo [*] Dang khoi chay AI Agent tu dong phan tich DOM va thao tac dat lich...
echo.
call npx e2e run tests/03_vibe_ai_testing.e2e.ts --headed

echo.
echo ==============================================================================
echo [*] Luu y: Neu bao loi MODEL_PROVIDER_FAILED/UNAUTHENTICATED, ban hay mo file
echo     F:\hoc_tap\thuc_tap\du_an\.env va dien GEMINI_API_KEY hoac OPENAI_API_KEY vao nhe!
echo ==============================================================================
echo.
pause
