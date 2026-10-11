#!/usr/bin/env sh
# Triển khai production 1 chạm (Linux / macOS): build ảnh → migrate CSDL (có sao lưu trước) → khởi động → healthcheck 200.
#   ./deploy_production.sh            (lần đầu tự tạo deploy/docker/production.env từ mẫu rồi dừng để điền)
#   SALON_WEB_PORT=8080 ./deploy_production.sh
set -eu
cd "$(dirname "$0")"
COMPOSE_FILE=deploy/docker/docker-compose.prod.yml
ENV_FILE=deploy/docker/production.env
export SALON_PROD_ENV_FILE="$(pwd)/$ENV_FILE"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[LỖI] %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Chưa cài Docker (https://docs.docker.com/engine/install/)."
docker compose version >/dev/null 2>&1 || fail "Thiếu Docker Compose v2 (lệnh 'docker compose')."
docker info >/dev/null 2>&1 || fail "Docker chưa chạy. Bật Docker rồi chạy lại."

if [ ! -f "$ENV_FILE" ]; then
  cp deploy/docker/production.env.example "$ENV_FILE"
  fail "Đã tạo $ENV_FILE từ mẫu. Điền mật khẩu CSDL, JWT secret, tài khoản quản trị đầu tiên rồi chạy lại."
fi
if grep -q 'REPLACE_WITH' "$ENV_FILE"; then
  fail "$ENV_FILE còn giá trị REPLACE_WITH_… — thay bằng giá trị thật trước khi triển khai."
fi
# Compose tự đọc production.env (--env-file); ở đây chỉ cần cổng Nginx để kiểm tra health
PORT="$(grep -E '^SALON_WEB_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d ' ')"
PORT="${PORT:-8080}"
DC="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

say "1/4 Build ảnh API + giao diện (bundle production)"
SALON_PROD_REVISION="$(git rev-parse --short HEAD 2>/dev/null || echo unreleased)" $DC build

say "2/4 Khởi động PostgreSQL"
$DC up -d postgres

say "3/4 Migrate CSDL (sao lưu bắt buộc trước khi đổi cấu trúc) + tài khoản quản trị"
$DC run --rm --no-deps api sh -c "node dist/database/migrate.js run --backup=required && node dist/database/run-bootstrap.js"

say "4/4 Khởi động API + Nginx"
$DC up -d api web

printf 'Chờ http://127.0.0.1:%s/health trả 200 ' "$PORT"
i=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health" || true)" = "200" ]; do
  i=$((i + 1))
  [ "$i" -ge 90 ] && { $DC ps; $DC logs --tail 60 api; fail "Healthcheck không đạt sau 180 giây."; }
  printf '.'; sleep 2
done
printf ' OK\n'
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/public/salon-info")"
WEB_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")"
[ "$API_CODE" = "200" ] && [ "$WEB_CODE" = "200" ] || fail "API=$API_CODE, giao diện=$WEB_CODE (cần 200)."
$DC ps
say "TRIỂN KHAI XONG: http://127.0.0.1:$PORT  (health 200, API 200, giao diện 200)"
