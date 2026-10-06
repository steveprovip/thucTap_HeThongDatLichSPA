#!/usr/bin/env bash
# Khởi động toàn bộ hệ thống bằng MỘT lệnh (macOS / Linux): ./scripts/unix/run_project.sh
# Yêu cầu: Node.js 20+. Phần còn lại (.env, Docker, cơ sở dữ liệu, backend, frontend, mở trình duyệt)
# do scripts/launcher.mjs tự xử lý, dùng chung với run_project.bat.
# Biến tuỳ chọn: SALON_SKIP_DOCKER=1 -> dùng PostgreSQL riêng, SALON_NO_BROWSER=1 -> không tự mở trình duyệt.
set -euo pipefail
cd "$(dirname "$0")/../.."  # scripts/unix -> gốc dự án

if ! command -v node >/dev/null 2>&1; then
  echo "[LỖI] Chưa cài Node.js 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại ./scripts/unix/run_project.sh" >&2
  exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node,10)>=20?0:1)'; then
  echo "[LỖI] Node.js $(node -v) quá cũ, cần phiên bản 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại ./scripts/unix/run_project.sh" >&2
  exit 1
fi

exec node scripts/launcher.mjs start
