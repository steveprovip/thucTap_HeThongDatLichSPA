#!/usr/bin/env bash
set -e

echo "=============================================================================="
echo "[GIT SETUP] CAU HINH GIT CHUAN DOANH NGHIEP CHO THANH VIEN NHOM 3 (MAC/LINUX)"
echo "=============================================================================="
echo ""

read -p "1. Nhap Ho va Ten cua ban (VD: Nguyen Nam Khanh): " GIT_NAME
read -p "2. Nhap Email dang ky GitHub cua ban: " GIT_EMAIL

if [ -z "$GIT_NAME" ] || [ -z "$GIT_EMAIL" ]; then
    echo "[LOI] Ho ten va Email khong duoc de trong!"
    exit 1
fi

echo ""
echo "[*] Dang thiet lap thong tin tac gia Git..."
git config user.name "$GIT_NAME"
git config user.email "$GIT_EMAIL"

echo "[*] Dang thiet lap quy chuan xu ly xuong dong va keo code..."
git config core.autocrlf input
git config pull.rebase false
git config init.defaultBranch main

echo ""
echo "=============================================================================="
echo "[THANH CONG] DA CAU HINH XONG GIT TREN MAY BAN:"
echo "- user.name  : $GIT_NAME"
echo "- user.email : $GIT_EMAIL"
echo "=============================================================================="
