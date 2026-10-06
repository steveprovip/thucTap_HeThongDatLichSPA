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
node -e "process.exit(parseInt(process.versions.node,10)>=20?0:1)"
if errorlevel 1 (
  echo.
  echo [LỖI] Node.js quá cũ, cần phiên bản 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại tệp này.
  pause
  exit /b 1
)

title Salon Spa - May chu
node scripts\launcher.mjs serve
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Máy chủ KHÔNG chạy được hoặc đã dừng bất thường. Đọc thông báo ở trên rồi chạy lại start_server.bat.
  pause
)
exit /b %RC%
