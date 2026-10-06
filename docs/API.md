# Danh mục endpoint

Tất cả endpoint đều có tiền tố `/api`, trừ `/health`.
Tài liệu tương tác đầy đủ: http://localhost:3000/api/docs

Ký hiệu vai trò: **C** Khách · **S** Thợ · **R** Lễ tân · **O** Chủ tiệm · **A** Admin ·
**⊘** công khai (không cần đăng nhập).

## Xác thực — `/auth`

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | ⊘ | Đăng nhập, trả access token 30 phút + refresh token 7 ngày |
| POST | `/auth/refresh` | ⊘ | Cấp lại access token, xoay vòng refresh token |
| POST | `/auth/logout` | mọi vai trò | Thu hồi refresh token |
| GET | `/auth/me` | mọi vai trò | Thông tin tài khoản đang đăng nhập |
| POST | `/auth/change-password` | mọi vai trò | Đổi mật khẩu |
| POST | `/auth/forgot-password` | ⊘ | Gửi liên kết đặt lại, tối đa 3 lần/giờ/email |
| POST | `/auth/reset-password` | ⊘ | Đặt lại mật khẩu, huỷ mọi phiên cũ |
| GET | `/auth/permission-matrix` | ⊘ | Bảng phân quyền dùng cho màn hình đối chiếu |

## Trang công khai — `/public`

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/public/catalog?search=` | Danh mục dịch vụ theo nhóm, tìm kiếm không dấu |
| POST | `/public/quote` | Tổng thời lượng và tiền tạm tính của một gói dịch vụ |
| GET | `/public/stylists?serviceIds=` | Thợ làm được toàn bộ dịch vụ đã chọn |
| GET | `/public/availability?date=&serviceIds=&stylistId=` | Khung giờ còn trống + gợi ý ngày khác |
| POST | `/public/bookings` | Chốt lịch, trả mã tra cứu 8 ký tự |
| POST | `/public/lookup` | Tra cứu bằng mã hoặc số điện thoại |
| POST | `/public/cancel` | Khách tự huỷ bằng mã tra cứu |

## Lịch hẹn — `/appointments`

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/appointments/timeline?date=` | R O A | Lịch ngày dạng cột theo thợ |
| GET | `/appointments/my-day?date=` | S | Lịch cá nhân của thợ |
| GET | `/appointments/pending` | R O A | Lịch chờ xác nhận |
| GET | `/appointments/reject-reasons` | R O | Danh sách lý do từ chối |
| GET | `/appointments/today-summary` | R O A | Số lịch theo trạng thái trong ngày |
| GET | `/appointments/availability` | R O A | Khung giờ trống cho màn hình nội bộ |
| GET | `/appointments` | R O A S | Danh sách có lọc và phân trang |
| GET | `/appointments/:id` | R O A S* | Chi tiết kèm lịch sử thay đổi |
| GET | `/appointments/:id/customer-history` | R O A S* | 10 lượt gần nhất của khách |
| POST | `/appointments/walk-in` | R O | Tạo lịch tại quầy |
| PATCH | `/appointments/:id/confirm` | R O | Xác nhận |
| PATCH | `/appointments/:id/reject` | R O | Từ chối kèm lý do |
| PATCH | `/appointments/:id/check-in` | R O | Check-in khách |
| PATCH | `/appointments/:id/reschedule` | R O | Đổi thợ hoặc dời giờ |
| PATCH | `/appointments/:id/no-show` | R O | Đánh dấu không đến |
| PATCH | `/appointments/:id/undo-no-show` | R O | Hoàn tác trong 15 phút |
| PATCH | `/appointments/:id/cancel` | R O | Tiệm huỷ lịch |
| PATCH | `/appointments/:id/start` | S* R O | Bắt đầu lượt dịch vụ |
| PATCH | `/appointments/:id/complete` | S* R O | Hoàn tất lượt dịch vụ |
| POST | `/appointments/:id/service-note` | S* R O | Ghi chú kỹ thuật |
| GET | `/appointments/bulk-reassign/suggestions` | R O | Gợi ý chuyển lịch hàng loạt |
| POST | `/appointments/bulk-reassign` | R O | Áp dụng chuyển theo lô |

`S*` = thợ chỉ thao tác được trên lịch hẹn của chính mình.

## Danh mục và nhân sự

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET / POST / PATCH / DELETE | `/service-categories` | đọc: R O A S · ghi: O |
| GET / POST / PATCH / DELETE | `/services` | đọc: R O A S · ghi: O |
| GET / POST / PATCH | `/stylists`, `/stylists/:id/avatar` | đọc: R O A S · ghi: O |
| GET / POST | `/stylists/:id/shifts`, `/shifts`, `/shifts/copy-week` | đọc: R O A S · ghi: O |
| PATCH / DELETE | `/shifts/:id` | O |
| GET / POST / DELETE | `/stylists/:id/time-off`, `/time-off` | đọc: R O A S · ghi: O R |
| GET / PUT | `/working-hours` | đọc: R O A S · ghi: O |
| GET / POST / DELETE | `/holidays` | đọc: R O A S · ghi: O |
| GET / POST / PATCH | `/users` | đọc: A O · ghi: A |
| POST | `/users/:id/reset-password`, `/users/:id/unlock` | A |
| GET | `/audit-logs` | A O |

## Khách hàng, thanh toán, đánh giá, báo cáo

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | `/customers`, `/customers/by-phone/:phone`, `/customers/:id/history` | R O A (S cho chi tiết) |
| PATCH | `/customers/:id` | R O |
| GET / POST / PATCH | `/invoices`, `/invoices/:id/pay`, `/invoices/:id/close` | R O (A chỉ xem) |
| POST | `/invoices/:id/adjust` | O |
| GET / POST / DELETE | `/vouchers` | đọc: R O A · ghi: O |
| GET / POST | `/reviews/token/:token`, `/reviews/by-code` | ⊘ |
| GET | `/reviews/stylist-ratings` | O A |
| GET | `/analytics/today`, `/analytics/revenue` | O A R |
| GET | `/analytics/slot-density` | O A |
| GET | `/analytics/export/{stylists,services,invoices}.csv` | O A |
| GET / PATCH | `/notifications`, `/notifications/:id/read` | S R O A |

## Dạng phản hồi

Thành công:

```json
{ "success": true, "data": { } }
```

Lỗi — thông điệp luôn bằng tiếng Việt, `field` chỉ ra ô nhập bị sai:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0",
  "field": "phone",
  "path": "/api/public/bookings",
  "timestamp": "2026-09-22T07:48:00.000Z"
}
```


## Bổ sung v1.4.0 — Góp ý Mentor Sprint 2

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/public/salon-info` | Công khai | Liên hệ, mạng xã hội, giờ mở cửa, đội ngũ chuyên viên (chân trang) |
| POST | `/api/public/holds` | Công khai | Giữ chỗ khung giờ 10 phút (`SLOT_HOLD_MINUTES`) khi khách điền form; 409 `SLOT_HELD` nếu khách khác đang giữ |
| DELETE | `/api/public/holds/:token` | Công khai | Trả chỗ đang giữ |
| POST | `/api/public/bookings/email` | Công khai | Gửi (lại) email xác nhận — xác thực mã tra cứu + SĐT, 5 lần/giờ/IP |
| GET | `/api/public/availability?holdToken=` | Công khai | Tham số mới: không ẩn khung giờ đang giữ của chính khách |
| POST | `/api/public/bookings` (`holdToken`) | Công khai | Tham số mới: đổi chỗ đang giữ thành lịch hẹn |
| GET | `/api/appointments/smart-slots?serviceIds&date&days&stylistId&limit` | Lễ tân, Chủ tiệm, Admin | Trợ lý AI xếp lịch: gợi ý có điểm + lý do, khoảng rảnh từng thợ |
| GET | `/api/holidays/suggestions?year` | Chủ tiệm, Lễ tân | Ngày lễ quốc gia của năm + trạng thái ready / exists / conflict / past |
| POST | `/api/holidays/generate` `{ year, keys?, force? }` | Chủ tiệm | Áp dụng 1-click; ngày trùng lịch khách chỉ tạo khi `force` |
| GET | `/api/shifts/coverage?from&to&minStaff` | Chủ tiệm, Lễ tân, Admin | Khung giờ mở cửa chưa đủ thợ + gợi ý thợ cân bằng giờ làm (≤ 31 ngày) |
| GET | `/api/shift-requests/mine` | Thợ | Yêu cầu đăng ký ca / nghỉ của tôi |
| POST | `/api/shift-requests` `{ items[] }` | Thợ | Đăng ký ca làm (giờ 24h) hoặc xin nghỉ, tối đa 31 ngày / lần, trước tối đa 60 ngày |
| DELETE | `/api/shift-requests/:id` | Thợ | Huỷ yêu cầu còn chờ duyệt |
| GET | `/api/shift-requests?status&from&to&stylistId` | Chủ tiệm, Lễ tân, Admin | Danh sách yêu cầu |
| POST | `/api/shift-requests/:id/approve` `{ startTime?, endTime?, note?, force? }` | Chủ tiệm | Duyệt (có thể chỉnh giờ) → tạo ca / ngày nghỉ thật |
| POST | `/api/shift-requests/:id/reject` `{ note? }` | Chủ tiệm | Từ chối kèm lý do |
| POST | `/api/shift-requests/approve-batch` `{ ids[] }` | Chủ tiệm | Duyệt nhiều yêu cầu |
