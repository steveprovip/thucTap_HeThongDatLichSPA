@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."
rem scripts\windows -> gốc dự án

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [LỖI] Chưa cài Node.js 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại tệp này.
  pause
  exit /b 1
)

title Salon Spa - Duong ham Cloudflare
node scripts\launcher.mjs tunnel
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Đường hầm không chạy được. Đọc thông báo ở trên rồi chạy lại start_tunnel.bat.
  pause
)
exit /b %RC%
