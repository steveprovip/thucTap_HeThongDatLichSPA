@echo off
rem Triển khai production 1 chạm (Windows): build ảnh -> migrate CSDL (có sao lưu trước) -> khởi động -> healthcheck 200.
rem   deploy_production.cmd     (lần đầu tự tạo deploy\docker\production.env từ mẫu rồi dừng để điền)
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Trien khai production - Salon Spa Huong Sen
set "COMPOSE_FILE=deploy\docker\docker-compose.prod.yml"
set "ENV_FILE=deploy\docker\production.env"
set "SALON_PROD_ENV_FILE=%CD%\%ENV_FILE%"

where docker >nul 2>nul || (echo [LỖI] Chưa cài Docker Desktop. & goto :fail)
docker compose version >nul 2>nul || (echo [LỖI] Thiếu Docker Compose v2. & goto :fail)
docker info >nul 2>nul || (echo [LỖI] Docker chưa chạy. Mở Docker Desktop rồi chạy lại. & goto :fail)

if not exist "%ENV_FILE%" (
  copy /y "deploy\docker\production.env.example" "%ENV_FILE%" >nul
  echo [LƯU Ý] Đã tạo %ENV_FILE% từ mẫu. Điền mật khẩu CSDL, JWT secret, tài khoản quản trị rồi chạy lại.
  goto :fail
)
findstr /c:"REPLACE_WITH" "%ENV_FILE%" >nul && (echo [LỖI] %ENV_FILE% còn giá trị REPLACE_WITH_... — thay bằng giá trị thật. & goto :fail)

set "PORT=8080"
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do if /i "%%A"=="SALON_WEB_PORT" set "PORT=%%B"
set "REV=unreleased"
for /f %%R in ('git rev-parse --short HEAD 2^>nul') do set "REV=%%R"
set "SALON_PROD_REVISION=!REV!"
set "DC=docker compose -f %COMPOSE_FILE% --env-file %ENV_FILE%"

echo.
echo ==^> 1/4 Build ảnh API + giao diện (bundle production)
%DC% build || goto :fail
echo ==^> 2/4 Khởi động PostgreSQL
%DC% up -d postgres || goto :fail
echo ==^> 3/4 Migrate CSDL (sao lưu bắt buộc trước khi đổi cấu trúc) + tài khoản quản trị
%DC% run --rm --no-deps api sh -c "node dist/database/migrate.js run --backup=required && node dist/database/run-bootstrap.js" || goto :fail
echo ==^> 4/4 Khởi động API + Nginx
%DC% up -d api web || goto :fail

echo Chờ http://127.0.0.1:!PORT!/health trả 200 ...
set /a TRY=0
:wait
set /a TRY+=1
set "CODE="
for /f %%C in ('curl -s -o nul -w "%%{http_code}" "http://127.0.0.1:!PORT!/health"') do set "CODE=%%C"
if "!CODE!"=="200" goto :healthy
if !TRY! GEQ 90 (
  %DC% ps
  %DC% logs --tail 60 api
  echo [LỖI] Healthcheck không đạt sau 180 giây.
  goto :fail
)
ping -n 3 127.0.0.1 >nul
goto :wait

:healthy
set "API="
set "WEB="
for /f %%C in ('curl -s -o nul -w "%%{http_code}" "http://127.0.0.1:!PORT!/api/public/salon-info"') do set "API=%%C"
for /f %%C in ('curl -s -o nul -w "%%{http_code}" "http://127.0.0.1:!PORT!/"') do set "WEB=%%C"
if not "!API!"=="200" (echo [LỖI] API trả !API! ^(cần 200^). & goto :fail)
if not "!WEB!"=="200" (echo [LỖI] Giao diện trả !WEB! ^(cần 200^). & goto :fail)
%DC% ps
echo.
echo ============================================================
echo   TRIỂN KHAI XONG: http://127.0.0.1:!PORT!  (health 200, API 200, giao diện 200)
echo ============================================================
if not defined SALON_NO_PAUSE pause
exit /b 0

:fail
echo.
if not defined SALON_NO_PAUSE pause
exit /b 1
