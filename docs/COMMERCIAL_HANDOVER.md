# Cẩm nang vận hành & bàn giao thương mại — Salon & Spa Hương Sen

Tài liệu bàn giao cho 3 vai trò: **Chủ tiệm**, **Lễ tân / Thu ngân**, **Kỹ thuật viên bảo trì**.
Phạm vi: bản triển khai production (`deploy/docker/docker-compose.prod.yml`), sao lưu và phục hồi.

---

## 1. Kiến trúc triển khai

```
Khách / nhân viên ──HTTPS (Cloudflare Tunnel / reverse proxy)──▶ Nginx :8080 (giao diện, gzip + brotli, cache /assets)
                                                                   │ /api, /health, /uploads, SSE /api/events
                                                                   ▼
                                                     API NestJS :3000 (production, migrate khi khởi động)
                                                                   │ mạng nội bộ (không ra Internet)
                                                                   ▼
                                                     PostgreSQL 15 (volume salon_pgdata)
  Redis 7 (profile "cache", tuỳ chọn khi chạy nhiều bản sao API)
```

| Thành phần | Volume | Ghi chú |
| --- | --- | --- |
| `postgres` | `salon_pgdata` | Dữ liệu khách, lịch, hoá đơn. Không mở cổng ra ngoài. |
| `api` | `salon_uploads`, `salon_backups` | Tự sao lưu 02:00 hằng ngày, giữ 14 bản. |
| `web` | — | Nginx Alpine + module brotli chính thức. |

---

## 2. Triển khai / cập nhật 1 chạm (Kỹ thuật viên)

1. Cài Docker Desktop (Windows) hoặc Docker Engine + Compose v2 (Linux).
2. Chạy **`deploy_production.cmd`** (Windows) hoặc **`./deploy_production.sh`** (Linux/macOS) ở thư mục gốc.
   Lần đầu script tạo `deploy/docker/production.env` từ mẫu rồi dừng.
3. Điền `production.env` (không commit — đã có trong `.gitignore`):

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `SALON_PROD_DB_PASSWORD` | ✔ | Mật khẩu CSDL ngẫu nhiên ≥ 24 ký tự |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ✔ | 2 chuỗi ngẫu nhiên khác nhau, ≥ 48 ký tự |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | ✔ | Tài khoản quản trị đầu tiên (tạo tự động) |
| `FRONTEND_URL`, `CORS_ORIGINS` | ✔ | Tên miền thật của tiệm |
| `SMTP_*`, `MAIL_FROM_ADDRESS` | ✔ | Gửi email xác nhận / nhắc lịch |
| `SALON_WEB_PORT`, `SALON_WEB_BIND` | | Cổng Nginx (mặc định `127.0.0.1:8080`) |
| `DISPATCH_WEBHOOK_URLS`, `DISPATCH_WEBHOOK_SECRET` | | Webhook Zalo ZNS / SMS (mục 6) |

4. Chạy lại script. Các bước tự động: build bundle → bật PostgreSQL → **migrate (bắt buộc sao lưu trước)** + tạo admin →
   bật API + Nginx → chờ `GET /health` = 200, kiểm `GET /api/public/salon-info` = 200 và trang chủ = 200.
5. Cập nhật phiên bản: `git pull` rồi chạy lại script (dữ liệu giữ nguyên trong volume).

Mở ra Internet: đặt Cloudflare Tunnel trỏ vào `http://127.0.0.1:8080` (xem `docs/TRIEN-KHAI.md`) và đặt
`SALON_PROD_TRUST_PROXY=2` để giới hạn tần suất theo IP thật của khách.

---

## 3. Chủ tiệm

| Việc | Ở đâu |
| --- | --- |
| Dịch vụ, bảng giá, ảnh dịch vụ | Thiết lập tiệm › Dịch vụ & bảng giá (lọc nhóm, tìm, 10/20/50 dòng) |
| Hồ sơ thợ, kỹ năng, trạng thái Đang làm / Tạm nghỉ | Hồ sơ thợ (lọc trạng thái, nhóm dịch vụ; 8 thẻ / 10 dòng mỗi trang) |
| Bảng ca tuần | Bảng ca làm (10 thợ / trang, bấm ô trống để thêm ca) |
| Doanh thu theo thợ / dịch vụ | Báo cáo › Doanh thu (biểu đồ Top 8 / Tất cả, tìm, sắp xếp, CSV) |
| Mã giảm giá | Mã giảm giá |
| Tài khoản nhân sự, nhật ký | Quản trị |
| Tài khoản nhận chuyển khoản (VietQR) | Launcher › Thiết lập cửa hàng |

**Chính sách cọc chống bùng lịch:** lịch online có tổng tạm tính **trên 500.000 đ** hiển thị yêu cầu cọc **30%**
(làm tròn 10.000 đ, tối thiểu 100.000 đ) kèm VietQR, nội dung chuyển khoản tự sinh `COC <SĐT> <MÃ LỊCH>`.
Lễ tân đối soát sao kê theo nội dung này rồi xác nhận lịch; cọc trừ vào hoá đơn, huỷ trước 24 giờ hoàn cọc.

---

## 4. Lễ tân / Thu ngân

1. **Chờ xác nhận**: lịch online mới; lịch chờ quá 12 giờ luôn đứng đầu. Kiểm cọc (nếu có) trước khi xác nhận.
2. **Lịch ngày**: check-in khi khách đến, bắt đầu / hoàn tất dịch vụ.
3. **Phiếu tính tiền**: thêm dịch vụ phát sinh, áp voucher, chọn tiền mặt / chuyển khoản, đóng phiếu.
4. **In hoá đơn nhiệt 80 mm (K80)**: nút **In hoá đơn** ở trang phiếu (phiếu phải được lưu) hoặc nút **In** ở từng dòng
   trong Danh sách phiếu. Trong hộp thoại in chọn máy in nhiệt, khổ giấy *80 mm / Roll*, lề *Không*, tỷ lệ 100%.
   Hoá đơn gồm logo, thông tin tiệm, khách, thợ, dịch vụ, chiết khấu voucher, tổng tiền, **VietQR** (phiếu chưa thu
   hoặc thu chuyển khoản; nội dung = mã phiếu) và lời cảm ơn.
5. **Khách vãng lai**: tạo lịch tại quầy (10/20/50 dòng / trang).

---

## 5. Sao lưu & phục hồi (Kỹ thuật viên)

**Tự động:** API sao lưu `pg_dump -Fc` lúc **02:00** hằng ngày vào volume `salon_backups`, giữ **14 bản** gần nhất;
máy tắt lúc 02:00 thì bật lên sẽ sao lưu bù sau 3 phút. Mỗi lần migrate đổi cấu trúc cũng sao lưu trước (bắt buộc).

```bash
# Sao lưu ngay
docker compose -f deploy/docker/docker-compose.prod.yml --env-file deploy/docker/production.env exec api node dist/database/backup-cli.js
# Chép bản sao lưu ra máy (đưa lên USB / ổ đám mây mỗi tuần)
docker cp "$(docker compose -f deploy/docker/docker-compose.prod.yml ps -q api)":/app/backups ./backups-export
```

**Phục hồi khi sự cố** (mất dữ liệu, migrate lỗi, máy hỏng):

```bash
DC="docker compose -f deploy/docker/docker-compose.prod.yml --env-file deploy/docker/production.env"
$DC stop api web                                   # ngừng ghi dữ liệu
docker cp ./backups-export/<tệp>.dump "$($DC ps -q postgres)":/tmp/restore.dump
$DC exec postgres pg_restore -U salon -d salon_booking --clean --if-exists /tmp/restore.dump
$DC up -d api web                                  # API tự migrate lên phiên bản hiện tại
curl -fsS http://127.0.0.1:8080/health             # phải trả 200
```

Diễn tập phục hồi mỗi quý trên máy thử. Bảng `invoices`, `invoice_items`, `audit_logs` có trigger chặn sửa / xoá /
TRUNCATE — đừng tắt trigger khi phục hồi.

---

## 6. Thông báo đa kênh (Zalo ZNS / SMS Brandname)

Backend phát sự kiện `appointment.created` và `appointment.confirmed` (POST JSON) tới mọi URL trong
`DISPATCH_WEBHOOK_URLS` (phân tách dấu phẩy):

| Header | Giá trị |
| --- | --- |
| `X-Salon-Event` | `appointment.created` / `appointment.confirmed` |
| `X-Salon-Delivery` | UUID sự kiện (chống xử lý trùng) |
| `X-Salon-Signature` | `sha256=<HMAC-SHA256(DISPATCH_WEBHOOK_SECRET, thân JSON)>` |

Thân: `{ id, type, occurredAt, data: { code, status, source, startAt, startAtText, customerName, customerPhone,
stylistName, services[], estimatedTotal } }`. Chạy nền, quá `DISPATCH_TIMEOUT_MS` hoặc lỗi 5xx thử lại 1 lần — không
bao giờ làm chậm / hỏng việc đặt lịch. Cổng trung gian (n8n, Make, máy chủ riêng) xác thực chữ ký rồi gọi API ZNS / SMS.
Nghiệm thu khi chưa có tài khoản: `GET /api/dispatch/recent` (Chủ tiệm / Quản trị) xem 50 sự kiện gần nhất.

---

## 7. Kiểm tra sức khoẻ & xử lý nhanh

| Triệu chứng | Kiểm tra | Xử lý |
| --- | --- | --- |
| Trang trắng / 502 | `$DC ps`, `$DC logs --tail 100 api` | `$DC restart api` |
| Đăng nhập lỗi hàng loạt | Đồng hồ máy chủ, `JWT_*` có bị đổi | Khôi phục secret cũ |
| Không gửi email | `SMTP_*`, hộp thư rác | Kiểm tra cổng 587 / mật khẩu ứng dụng |
| Đầy ổ đĩa | `docker system df` | `docker image prune`; chép bớt backup ra ngoài |
| AI trợ lý chậm | `model_AI_local/README.md` | Tắt AI local, trợ lý tự về chế độ luật |
