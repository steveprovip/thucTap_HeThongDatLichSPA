@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Salon - Spa Booking : khoi dong toan bo he thong

echo ============================================================
echo   HE THONG DAT LICH SALON - SPA
echo   Khoi dong bang MOT lenh: docker + backend + frontend
echo ============================================================
echo.

cd /d "%~dp0"

REM ---------------------------------------------------------- 1. Kiem tra Node
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai ban 20 tro len tai https://nodejs.org
  pause & exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
echo [1/6] Node.js: & node -v

REM ---------------------------------------------------------- 2. Ha tang docker
where docker >nul 2>nul
if errorlevel 1 (
  echo [CANH BAO] Khong tim thay Docker. Bo qua buoc dung PostgreSQL/Maildev.
  echo            Hay tu dam bao PostgreSQL dang chay theo cau hinh trong backend\.env
) else (
  echo [2/6] Dung PostgreSQL 15, PgAdmin va Maildev ...
  docker compose up -d
  if errorlevel 1 (
    echo [LOI] Khong khoi dong duoc docker compose. Kiem tra Docker Desktop da chay chua.
    pause & exit /b 1
  )
  echo       Cho PostgreSQL san sang ...
  set /a TRIES=0
  :WAITDB
  set /a TRIES+=1
  docker compose exec -T postgres pg_isready -U salon -d salon_booking >nul 2>nul
  if errorlevel 1 (
    if !TRIES! GEQ 40 (
      echo [LOI] PostgreSQL khong san sang sau 80 giay.
      pause & exit /b 1
    )
    timeout /t 2 /nobreak >nul
    goto WAITDB
  )
  echo       PostgreSQL da san sang.
)

REM ---------------------------------------------------------- 3. Cai dat goi
if not exist "node_modules" (
  echo [3/6] Cai dat goi cho workspace goc ...
  call npm install --no-fund --no-audit
) else ( echo [3/6] Workspace goc da co node_modules. )

if not exist "backend\node_modules" (
  echo       Cai dat goi cho backend ...
  call npm install --prefix backend --no-fund --no-audit
) else ( echo       Backend da co node_modules. )

if not exist "frontend\node_modules" (
  echo       Cai dat goi cho frontend ...
  call npm install --prefix frontend --no-fund --no-audit
) else ( echo       Frontend da co node_modules. )

REM ---------------------------------------------------------- 4. Tep .env
if not exist "backend\.env" copy /y "backend\.env.example" "backend\.env" >nul
if not exist "frontend\.env" copy /y "frontend\.env.example" "frontend\.env" >nul
if not exist ".env" copy /y ".env.example" ".env" >nul
echo [4/6] Da chuan bi cac tep .env.

REM ---------------------------------------------------------- 5. Nap du lieu mau
echo [5/6] Nap luoc do va du lieu mau (chay lai nhieu lan van an toan) ...
call npm run seed --prefix backend
if errorlevel 1 (
  echo [LOI] Nap du lieu mau that bai. Kiem tra ket noi CSDL trong backend\.env
  pause & exit /b 1
)

REM ---------------------------------------------------------- 6. Chay ung dung
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
echo   Dang khoi dong backend... Trinh duyet se tu dong mo ngay khi he thong san sang!
echo   Nhan Ctrl+C trong cua so nay de dung ca hai tien trinh.
echo ============================================================
echo.

REM Tien trinh chay ngam tu dong cho Backend san sang (HTTP 200) roi moi mo trinh duyet
start /b "" powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { Start-Sleep -Seconds 2; try { $res = Invoke-WebRequest -Uri 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 2; if ($res.StatusCode -eq 200) { Start-Process 'http://localhost:5173'; break } } catch {} }"

call npm run start:all
endlocal
