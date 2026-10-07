#!/usr/bin/env bash
# Chạy hệ thống ở CHẾ ĐỘ MÁY CHỦ (bản production, một cổng, KHÔNG nạp dữ liệu mẫu): ./scripts/unix/start_server.sh
# Biến tuỳ chọn: SALON_SKIP_DOCKER=1 -> dùng PostgreSQL riêng, SALON_NO_BROWSER=1 -> không tự mở trình duyệt.
set -euo pipefail
cd "$(dirname "$0")/../.."  # scripts/unix -> gốc dự án

if ! command -v node >/dev/null 2>&1; then
  echo "[LỖI] Chưa cài Node.js 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại." >&2
  exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node,10)>=20?0:1)'; then
  echo "[LỖI] Node.js $(node -v) quá cũ, cần phiên bản 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại." >&2
  exit 1
fi

exec node scripts/launcher.mjs serve
