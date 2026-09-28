#!/usr/bin/env bash
# Khởi động toàn bộ hệ thống bằng một lệnh trên macOS / Linux.
set -euo pipefail
cd "$(dirname "$0")"

echo "============================================================"
echo "  HỆ THỐNG ĐẶT LỊCH SALON - SPA"
echo "============================================================"

command -v node >/dev/null || { echo "[LỖI] Chưa cài Node.js 20+"; exit 1; }
echo "[1/6] Node.js $(node -v)"

if command -v docker >/dev/null; then
  echo "[2/6] Dựng PostgreSQL 15, PgAdmin và Maildev..."
  docker compose up -d
  printf '      Chờ PostgreSQL sẵn sàng'
  for _ in $(seq 1 40); do
    if docker compose exec -T postgres pg_isready -U salon -d salon_booking >/dev/null 2>&1; then
      echo " — sẵn sàng."; break
    fi
    printf '.'; sleep 2
  done
else
  echo "[CẢNH BÁO] Không có Docker, bỏ qua bước dựng hạ tầng."
fi

echo "[3/6] Cài đặt gói..."
[ -d node_modules ] || npm install --no-fund --no-audit
[ -d backend/node_modules ] || npm install --prefix backend --no-fund --no-audit
[ -d frontend/node_modules ] || npm install --prefix frontend --no-fund --no-audit

echo "[4/6] Chuẩn bị tệp .env..."
[ -f .env ] || cp .env.example .env
[ -f backend/.env ] || cp backend/.env.example backend/.env
[ -f frontend/.env ] || cp frontend/.env.example frontend/.env

echo "[5/6] Nạp lược đồ và dữ liệu mẫu..."
npm run seed --prefix backend

cat <<'INFO'
[6/6] Khởi động API và giao diện...

  API        : http://localhost:3000/api
  Tài liệu   : http://localhost:3000/api/docs
  Giao diện  : http://localhost:5173
  Hộp thư ảo : http://localhost:1080   (Maildev)
  PgAdmin    : http://localhost:5050

  Tài khoản mẫu:
    admin@salon.vn      / Admin@123       (Quản trị hệ thống)
    owner@salon.vn      / Owner@123       (Chủ tiệm)
    reception@salon.vn  / Reception@123   (Lễ tân)
    stylist1@salon.vn   / Stylist@123     (Thợ, còn stylist2..5)
(
  for _ in $(seq 1 60); do
    sleep 2
    if curl -s -f http://localhost:3000/health >/dev/null 2>&1; then
      if command -v xdg-open >/dev/null; then xdg-open http://localhost:5173 >/dev/null 2>&1
      elif command -v open >/dev/null; then open http://localhost:5173 >/dev/null 2>&1
      fi
      break
    fi
  done
) &

npm run start:all
