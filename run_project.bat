@echo off
REM ============================================================================
REM  HE THONG DAT LICH SALON - SPA : khoi dong toan bo bang MOT cu nhap dup
REM  Yeu cau: Node.js 20+, Docker Desktop (dang bat).
REM  Bien tuy chon:  set SALON_SKIP_DOCKER=1  -> dung PostgreSQL rieng (khong dung Docker)
REM                  set SALON_NO_BROWSER=1   -> khong tu mo trinh duyet
REM  Luu y: tep nay KHONG dat nhan (:label) ben trong khoi ( ... ) vi cmd.exe
REM  xu ly goto trong khoi ngoac khong dang tin cay.
REM ============================================================================
setlocal EnableExtensions
chcp 65001 >nul
title Salon - Spa Booking : khoi dong toan bo he thong
cd /d "%~dp0"

echo ============================================================
echo   HE THONG DAT LICH SALON - SPA
echo   Khoi dong bang MOT lenh: docker + backend + frontend
echo ============================================================
echo.

REM ---------------------------------------------------------- 1. Node.js
where node >nul 2>nul
if errorlevel 1 goto :no_node
node scripts\launcher.mjs check-node
if errorlevel 1 goto :fail
for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
echo [1/6] Node.js %NODEVER%

REM ---------------------------------------------------------- 2. Docker
if "%SALON_SKIP_DOCKER%"=="1" goto :skip_docker
where docker >nul 2>nul
if errorlevel 1 goto :no_docker

echo [2/6] Kiem tra Docker Desktop ...
set /a DOCKER_TRIES=0
:wait_docker
docker info >nul 2>nul
if not errorlevel 1 goto :docker_ready
set /a DOCKER_TRIES+=1
if %DOCKER_TRIES% GEQ 60 goto :docker_down
if %DOCKER_TRIES%==1 call :start_docker_desktop
REM ping thay cho timeout: timeout loi khi stdin bi chuyen huong (chay tu Git Bash / IDE)
ping -n 3 127.0.0.1 >nul
goto :wait_docker

:docker_ready
echo       Dung PostgreSQL 15, PgAdmin va Maildev (lan dau phai tai image, co the mat vai phut) ...
docker compose up -d
if errorlevel 1 goto :compose_fail
echo       Container da chay.
goto :prepare

:skip_docker
echo [2/6] Bo qua Docker (SALON_SKIP_DOCKER=1). Dung PostgreSQL theo backend\.env
goto :prepare

:no_docker
echo [2/6] [CANH BAO] Khong tim thay lenh docker. Bo qua buoc dung PostgreSQL/Maildev.
echo            Hay tu dam bao PostgreSQL dang chay theo cau hinh trong backend\.env

REM ---------------------------------------------------------- 3-4. .env + goi + cong
:prepare
echo [3/6] Chuan bi tep .env va goi npm ...
node scripts\launcher.mjs prepare
if errorlevel 10 goto :already_running
if errorlevel 1 goto :fail
echo [4/6] Cong 3000 va 5173 dang trong.

REM ---------------------------------------------------------- 5. Luoc do + du lieu mau
echo [5/6] Nap luoc do va du lieu mau (chay lai nhieu lan van an toan) ...
call npm run seed --prefix backend
if errorlevel 1 goto :seed_fail

REM ---------------------------------------------------------- 6. Chay ung dung
echo.
echo [6/6] Khoi dong API va giao dien ...
echo.
echo   API        : http://localhost:3000/api
echo   Tai lieu   : http://localhost:3000/api/docs
echo   Giao dien  : http://localhost:5173
echo   Hop thu ao : http://localhost:1080   (Maildev)
echo   PgAdmin    : http://localhost:5050
echo.
echo   Tai khoan mau:
echo     admin@salon.vn      / Admin@123       (Quan tri he thong)
echo     owner@salon.vn      / Owner@123       (Chu tiem)
echo     reception@salon.vn  / Reception@123   (Le tan)
echo     stylist1@salon.vn   / Stylist@123     (Tho, con stylist2..5)
echo.
echo   Trinh duyet CHI mo khi http://localhost:3000/health tra ve 200
echo   (API da bien dich xong va ket noi duoc CSDL) - thuong mat 15-40 giay.
echo   Nhan Ctrl+C trong cua so nay de dung toan bo.
echo ============================================================
echo.
REM Chay thang tien trinh giam sat (khong qua npm/concurrently): tu khoi dong lai
REM dich vu bi sap, Ctrl+C dung sach ca cay tien trinh.
node scripts\launcher.mjs run
if errorlevel 1 goto :fail
goto :end

REM ---------------------------------------------------------- Xu ly loi
:no_node
echo [LOI] Chua cai Node.js. Tai ban 20 tro len tai https://nodejs.org roi chay lai.
goto :fail

:docker_down
echo [LOI] Docker Desktop khong phan hoi sau 2 phut.
echo       Mo Docker Desktop, cho bieu tuong ca voi chuyen sang "Engine running" roi chay lai.
goto :fail

:compose_fail
echo [LOI] docker compose up that bai. Nguyen nhan thuong gap:
echo       - Cong 5432 / 5050 / 1080 da bi chuong trinh khac chiem (vd. PostgreSQL cai san tren may).
echo         Cach sua: dat POSTGRES_PORT=5433 trong .env va DB_PORT=5433 trong backend\.env
echo       - Container cung ten (salon_postgres...) cua mot ban sao du an khac:
echo         docker rm -f salon_postgres salon_pgadmin salon_maildev
goto :fail

:seed_fail
echo [LOI] Nap du lieu mau that bai. Xem "Goi y" o tren; kiem tra ket noi CSDL trong backend\.env
goto :fail

:already_running
echo.
echo He thong dang chay o mot cua so khac - da mo trinh duyet. Cua so nay co the dong.
pause
goto :end

:start_docker_desktop
echo       Docker Desktop chua san sang - dang cho toi da 2 phut ...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  echo       Thu tu mo Docker Desktop ...
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
)
exit /b 0

:fail
echo.
echo Khoi dong KHONG thanh cong. Doc thong bao loi o tren roi chay lai run_project.bat
pause
endlocal
exit /b 1

:end
endlocal
exit /b 0
