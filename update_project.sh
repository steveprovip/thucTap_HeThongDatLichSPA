#!/usr/bin/env bash
# Cập nhật phiên bản mới bằng MỘT lệnh (macOS / Linux): ./update_project.sh
# git pull -> gói npm (nếu đổi) -> build -> sao lưu + migration CSDL -> chạy lại. Không nạp dữ liệu mẫu, không mất dữ liệu khách.
# Biến tuỳ chọn: UPDATE_BACKUP=required|auto|off (mặc định required), SALON_SKIP_DOCKER=1.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[LỖI] Chưa cài Node.js 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại." >&2
  exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node,10)>=20?0:1)'; then
  echo "[LỖI] Node.js $(node -v) quá cũ, cần phiên bản 20 trở lên. Tải bản LTS tại https://nodejs.org rồi chạy lại." >&2
  exit 1
fi

# exec: bash không đọc thêm dòng nào của tệp này nữa, nên git pull ghi đè update_project.sh giữa chừng vẫn an toàn
exec node scripts/launcher.mjs update "$@"
