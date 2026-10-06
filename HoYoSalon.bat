@echo off
rem HoYoSalon - mở Launcher KHÔNG có cửa sổ đen: chuyển cho scripts\windows\HoYoSalon.vbs (wscript, chạy ẩn) rồi đóng ngay.
rem Lần đầu sẽ tạo lối tắt "Hương Sen Salon" trên màn hình: bấm lối tắt đó thì không thấy cửa sổ đen nào.
rem   HoYoSalon.bat --console    chạy Launcher ngay trong cửa sổ này (xem lỗi trực tiếp khi cần hỗ trợ kỹ thuật)
if /i "%~1"=="--console" goto console
start "" wscript.exe //nologo "%~dp0scripts\windows\HoYoSalon.vbs" %*
exit /b 0

:console
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
echo   HoYoSalon Launcher - chế độ cửa sổ lệnh (hỗ trợ kỹ thuật)
echo   Cửa sổ Launcher sẽ mở ngay. Bấm BẮT ĐẦU hoặc CẬP NHẬT.
echo ============================================================
node scripts\hoyo\launcher-ui.mjs
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Launcher dừng với lỗi. Xem logs\launcher-ui.log hoặc chạy scripts\windows\run_project.bat.
  pause
)
exit /b %RC%
