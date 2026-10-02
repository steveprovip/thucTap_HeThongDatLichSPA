# Môi trường staging — một trang (S1-10)

## Dựng môi trường

```bat
run_project.bat          :: Windows
./run_project.sh         # macOS / Linux
```

Một lệnh duy nhất dựng đủ ba thành phần: cơ sở dữ liệu, backend, frontend.

## Đường dẫn

| Thành phần | Đường dẫn cục bộ | Ghi chú |
|---|---|---|
| Giao diện khách + nội bộ | http://localhost:5173 | React 18 + Vite |
| API | http://localhost:3000/api | NestJS |
| Tài liệu API | http://localhost:3000/api/docs | Swagger UI |
| Hộp thư ảo | http://localhost:1080 | Maildev — đọc mọi email hệ thống gửi |
| PgAdmin | http://localhost:5050 | `admin@salon.local` / `admin123` |
| PostgreSQL | `localhost:5432` | `salon` / `salon123` / db `salon_booking` |

Khi triển khai lên máy chủ staging thật, thay `localhost` bằng tên miền và cập nhật
`FRONTEND_URL` trong `backend/.env` để các liên kết trong email trỏ đúng.

## Tài khoản đăng nhập mẫu

| Vai trò | Email | Mật khẩu | Vào thẳng màn hình |
|---|---|---|---|
| Quản trị hệ thống | `admin@salon.vn` | `Admin@123` | Tài khoản nhân sự |
| Chủ tiệm | `owner@salon.vn` | `Owner@123` | Tổng quan hôm nay |
| Lễ tân | `reception@salon.vn` | `Reception@123` | Lịch ngày |
| Thợ — Nguyễn Thu Hà | `stylist1@salon.vn` | `Stylist@123` | Lịch của tôi |
| Thợ — Trần Minh Tuấn | `stylist2@salon.vn` | `Stylist@123` | Lịch của tôi |
| Thợ — Lê Thị Bích Ngọc | `stylist3@salon.vn` | `Stylist@123` | Lịch của tôi |
| Thợ — Phạm Quốc Bảo | `stylist4@salon.vn` | `Stylist@123` | Lịch của tôi |
| Thợ — Võ Kim Chi | `stylist5@salon.vn` | `Stylist@123` | Lịch của tôi |

Khách hàng không cần tài khoản.

## Bộ dữ liệu mẫu

Nạp bằng `npm run db:seed`. **Chạy lại nhiều lần cho kết quả giống nhau, không nhân đôi
bản ghi** — mọi bản ghi tĩnh dùng UUID cố định với `ON CONFLICT DO NOTHING`, phần động
sinh theo hàm băm tất định của (ngày, thợ, khung giờ).

| Đối tượng | Số lượng |
|---|---|
| Tài khoản nội bộ | 8 (1 admin, 1 chủ tiệm, 1 lễ tân, 5 thợ) |
| Thợ | 5, mỗi người nghỉ cố định một ngày trong tuần |
| Nhóm dịch vụ | 4 (Tóc · Gội-Dưỡng · Chăm sóc da · Trang điểm & Móng) |
| Dịch vụ | 12, thời lượng 30–120 phút, giá 120.000 – 950.000 đ |
| Ca làm | ~300 ca, từ 35 ngày trước đến 30 ngày sau |
| Khách hàng | 15 hồ sơ |
| Lịch hẹn | ~400, đủ 7 trạng thái |
| Phiếu tính tiền đã đóng | ~287 |
| Đánh giá | ~287, có cả lượt chưa chấm điểm |
| Mã giảm giá | 3 (còn hạn, giảm tiền, đã hết hạn để kiểm thử) |

## Reset sạch

```bash
npm run db:reset     # xoá volume docker rồi dựng lại, schema + seed chạy tự động
```

## Kiểm tra nhanh sau khi dựng

```bash
curl http://localhost:3000/health
# {"success":true,"data":{"status":"ok","database":"up","timezone":"Asia/Ho_Chi_Minh",...}}
```
