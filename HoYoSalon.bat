@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title HoYoSalon Launcher - He thong dat lich Salon Spa

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [LỖI] Chưa cài Node.js 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại HoYoSalon.bat.
  start "" https://nodejs.org/vi/download
  pause
  exit /b 1
)
node -e "process.exit(parseInt(process.versions.node,10)>=20?0:1)"
if errorlevel 1 (
  echo.
  echo [LỖI] Node.js quá cũ, cần phiên bản 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại HoYoSalon.bat.
  pause
  exit /b 1
)

echo ============================================================
echo   HoYoSalon Launcher - Hệ thống đặt lịch Salon Spa
echo   Cửa sổ Launcher sẽ mở ngay. Bấm BẮT ĐẦU hoặc CẬP NHẬT.
echo   Thu nhỏ cửa sổ đen này; Launcher tự thoát khi bạn đóng
echo   cửa sổ Launcher (hệ thống Salon vẫn tiếp tục chạy).
echo ============================================================
node scripts\hoyo\launcher-ui.mjs %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Launcher dừng với lỗi. Xem logs\launcher-ui.log hoặc chạy scripts\windows\run_project.bat.
  pause
)
exit /b %RC%
