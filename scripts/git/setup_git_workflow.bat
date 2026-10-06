@echo off
chcp 65001 > nul
echo ==============================================================================
echo [GIT SETUP] CAU HINH GIT CHUAN DOANH NGHIEP CHO THANH VIEN NHOM 3
echo ==============================================================================
echo.

set /p GIT_NAME="1. Nhap Ho va Ten cua ban (VD: Nguyen Nam Khanh): "
set /p GIT_EMAIL="2. Nhap Email dang ky GitHub cua ban: "

if "%GIT_NAME%"=="" (
    echo [LOI] Ho ten khong duoc de trong!
    pause
    exit /b 1
)

if "%GIT_EMAIL%"=="" (
    echo [LOI] Email khong duoc de trong!
    pause
    exit /b 1
)

echo.
echo [*] Dang thiet lap thong tin tac gia Git...
git config user.name "%GIT_NAME%"
git config user.email "%GIT_EMAIL%"

echo [*] Dang thiet lap quy chuan xu ly xuong dong va keo code...
git config core.autocrlf true
git config pull.rebase false
git config init.defaultBranch main

echo.
echo ==============================================================================
echo [THANH CONG] DA CAU HINH XONG GIT TREN MAY BAN:
echo - user.name  : %GIT_NAME%
echo - user.email : %GIT_EMAIL%
echo ==============================================================================
echo.
pause
