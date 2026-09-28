#!/usr/bin/env bash
# =============================================================================
#  HỆ THỐNG ĐẶT LỊCH SALON - SPA : khởi động toàn bộ bằng một lệnh (macOS / Linux)
#  Yêu cầu: Node.js 20+, Docker (đang chạy).
#  Biến tuỳ chọn: SALON_SKIP_DOCKER=1  -> dùng PostgreSQL riêng (không dùng Docker)
#                 SALON_NO_BROWSER=1   -> không tự mở trình duyệt
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

fail() {
  echo
  echo "[LỖI] $*" >&2
  echo "Khởi động KHÔNG thành công. Đọc thông báo lỗi ở trên rồi chạy lại ./run_project.sh" >&2
  exit 1
}

echo "============================================================"
echo "  HỆ THỐNG ĐẶT LỊCH SALON - SPA"
echo "  Khởi động bằng MỘT lệnh: docker + backend + frontend"
echo "============================================================"
echo

# ---------------------------------------------------------------- 1. Node.js
command -v node >/dev/null 2>&1 || fail "Chưa cài Node.js 20+ (https://nodejs.org)"
node scripts/launcher.mjs check-node || fail "Phiên bản Node.js quá cũ"
echo "[1/6] Node.js $(node -v)"

# ---------------------------------------------------------------- 2. Docker
if [ "${SALON_SKIP_DOCKER:-0}" = "1" ]; then
  echo "[2/6] Bỏ qua Docker (SALON_SKIP_DOCKER=1). Dùng PostgreSQL theo backend/.env"
elif command -v docker >/dev/null 2>&1; then
  echo "[2/6] Kiểm tra Docker ..."
  tries=0
  until docker info >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -eq 1 ]; then
      echo "      Docker chưa sẵn sàng - đang chờ tối đa 2 phút ..."
      if [ "$(uname -s)" = "Darwin" ]; then open -ga Docker >/dev/null 2>&1 || true; fi
    fi
    [ "$tries" -ge 60 ] && fail "Docker không phản hồi sau 2 phút. Hãy bật Docker Desktop / dịch vụ docker rồi chạy lại."
    sleep 2
  done
  echo "      Dựng PostgreSQL 15, PgAdmin và Maildev (lần đầu phải tải image, có thể mất vài phút) ..."
  docker compose up -d || fail "docker compose up thất bại. Cổng 5432/5050/1080 có thể đang bị chiếm (vd. PostgreSQL cài sẵn): đặt POSTGRES_PORT=5433 trong .env và DB_PORT=5433 trong backend/.env. Nếu trùng tên container: docker rm -f salon_postgres salon_pgadmin salon_maildev"
  echo "      Container đã chạy."
else
  echo "[2/6] [CẢNH BÁO] Không có Docker. Hãy tự đảm bảo PostgreSQL chạy theo backend/.env"
fi

# ---------------------------------------------------------------- 3-4. .env + gói + cổng
echo "[3/6] Chuẩn bị tệp .env và gói npm ..."
set +e
node scripts/launcher.mjs prepare
rc=$?
set -e
if [ "$rc" -eq 10 ]; then
  echo "Hệ thống đang chạy ở một cửa sổ khác - đã mở trình duyệt."
  exit 0
fi
[ "$rc" -eq 0 ] || fail "Chuẩn bị môi trường thất bại"
echo "[4/6] Cổng 3000 và 5173 đang trống."

# ---------------------------------------------------------------- 5. Lược đồ + dữ liệu mẫu
echo "[5/6] Nạp lược đồ và dữ liệu mẫu (chạy lại nhiều lần vẫn an toàn) ..."
npm run seed --prefix backend || fail "Nạp dữ liệu mẫu thất bại. Xem 'Gợi ý' ở trên; kiểm tra backend/.env"

# ---------------------------------------------------------------- 6. Chạy ứng dụng
cat <<'INFO'

[6/6] Khởi động API và giao diện ...

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

  Trình duyệt CHỈ mở khi http://localhost:3000/health trả về 200
  (API đã biên dịch xong và kết nối được CSDL) - thường mất 15-40 giây.
  Nhấn Ctrl+C để dừng toàn bộ.
============================================================
INFO

exec npm run start:launch
