#!/usr/bin/env bash
# Mở đường hầm Cloudflare (Quick Tunnel, miễn phí) tới máy chủ đang chạy bằng start_server.sh: ./start_tunnel.sh
# Biến tuỳ chọn: CLOUDFLARED_PATH=/đường/dẫn/cloudflared, CLOUDFLARED_ALLOWED_MAIL=ban@gmail.com (chỉ cho email này vào, xác thực bằng mã OTP)
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "[LỖI] Chưa cài Node.js 20 trở lên: https://nodejs.org" >&2; exit 1; }
exec node scripts/launcher.mjs tunnel
