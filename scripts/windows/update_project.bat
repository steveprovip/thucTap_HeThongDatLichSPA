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

title Salon Spa - Cap nhat phien ban moi
(
  node scripts\launcher.mjs update
  if errorlevel 1 (
    echo.
    echo Cập nhật KHÔNG thành công. Đọc thông báo ở trên: hệ thống cũ được giữ nguyên hoặc đã được bật lại.
    if not "%SALON_NO_PAUSE%"=="1" pause
    exit /b 1
  )
  echo.
  echo Cập nhật hoàn tất. Hệ thống đã chạy ở cửa sổ mới "Salon serve".
  if not "%SALON_NO_PAUSE%"=="1" pause
  exit /b 0
)
