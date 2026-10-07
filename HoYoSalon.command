#!/bin/bash
# HoYoSalon trên macOS: nhấp đúp tệp này trong Finder để mở Launcher (giống HoYoSalon.bat trên Windows).
# Lần đầu tạo ứng dụng "Hương Sen Salon" trong ~/Applications (kéo vào Dock): bấm ứng dụng đó thì KHÔNG có cửa sổ Terminal.
#   ./HoYoSalon.command --no-open    chỉ chạy máy chủ Launcher (không mở cửa sổ)
# Không mở được ("không xác định được nhà phát triển")? Chuột phải tệp > Mở, hoặc: xattr -dr com.apple.quarantine .
cd "$(dirname "$0")" || exit 1

# Terminal đọc ~/.zprofile nhưng vẫn bổ sung các nơi cài công cụ quen thuộc của macOS cho chắc
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.docker/bin"

fail() {
  echo "[LỖI] $1" >&2
  osascript -e "display dialog \"$1\" buttons {\"OK\"} default button 1 with icon caution" >/dev/null 2>&1
  open "https://nodejs.org/vi/download" >/dev/null 2>&1
  exit 1
}
command -v node >/dev/null 2>&1 || fail "Chưa cài Node.js 20 trở lên. Cài bản LTS ở trang vừa mở rồi nhấp đúp lại HoYoSalon.command."
node -e 'process.exit(parseInt(process.versions.node,10)>=20?0:1)' || fail "Node.js $(node -v) quá cũ, cần phiên bản 20 trở lên. Cài bản LTS ở trang vừa mở rồi nhấp đúp lại."

mkdir -p logs
# Tạo (hoặc tạo lại khi đã chuyển thư mục) ứng dụng ~/Applications/Hương Sen Salon.app; lỗi ở bước này không chặn việc mở Launcher
if [ "$(cat .salon-shortcut 2>/dev/null)" != "$PWD" ]; then
  node scripts/lib/macos-app.mjs && printf '%s' "$PWD" > .salon-shortcut
fi

nohup node scripts/hoyo/launcher-ui.mjs "$@" >> logs/launcher-ui.log 2>&1 &
disown 2>/dev/null || true
echo "Đang mở Hương Sen Salon Launcher. Có thể đóng cửa sổ Terminal này."
sleep 1
exit 0
