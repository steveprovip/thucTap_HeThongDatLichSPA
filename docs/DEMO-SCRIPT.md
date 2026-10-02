# Kịch bản demo nghiệm thu (S4-10)

Kịch bản viết sẵn theo từng bước, **mỗi bước ghi rõ tài khoản dùng**. Diễn tập trọn kịch bản
ít nhất một lần trước buổi sprint review.

Chuẩn bị: chạy `run_project.bat`, mở sẵn bốn tab —
giao diện `http://localhost:5173`, hộp thư ảo `http://localhost:1080`,
tài liệu API `http://localhost:3000/api/docs`, và một cửa sổ ẩn danh để đóng vai khách.

---

## Phần A — Sprint 1: nền tảng tài khoản và danh mục gốc (4 phút)

| # | Tài khoản | Thao tác | Điều cần chỉ ra |
|---|---|---|---|
| A1 | `owner@salon.vn` / `Owner@123` | Đăng nhập | Menu trái có Tổng quan, Doanh thu, Dịch vụ, Hồ sơ thợ, Ca làm, Giờ mở cửa |
| A2 | `reception@salon.vn` / `Reception@123` | Đăng nhập ở cửa sổ khác | Menu **khác hẳn**: không có Tài khoản nhân sự, không có Khung giờ & no-show |
| A3 | `stylist1@salon.vn` / `Stylist@123` | Đăng nhập | Chỉ còn Lịch của tôi, Dịch vụ, Bảng ca làm |
| A4 | `admin@salon.vn` / `Admin@123` | Đăng nhập | Có Tài khoản nhân sự, Nhật ký, Bảng phân quyền |
| A5 | Lễ tân | Mở tab Console, chạy:<br>`fetch('/api/services',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage['salon.accessToken']},body:'{}'}).then(r=>r.json()).then(console.log)` | Trả về **403** `"Bạn không có quyền thực hiện thao tác này"` — chặn ở máy chủ chứ không chỉ ẩn nút |
| A6 | Chủ tiệm | Dịch vụ & bảng giá → Thêm dịch vụ, đặt thời lượng 40 phút | Ô chọn thời lượng chỉ cho bội số 15; nhập giá 25.000.000 đ → báo lỗi ngay |
| A7 | Chủ tiệm | Tạo "Cắt tóc demo" 30 phút, gán cho 2 thợ | Dịch vụ xuất hiện ngay trên trang khách |

---

## Phần B — Sprint 2: ca làm và đặt lịch công khai (5 phút)

| # | Tài khoản | Thao tác | Điều cần chỉ ra |
|---|---|---|---|
| B1 | Chủ tiệm | Bảng ca làm → xem tuần hiện tại | Mỗi thợ nghỉ cố định một ngày; ca 09:00–18:00 nghỉ trưa 12:00–13:00 |
| B2 | Chủ tiệm | Bấm **Sao chép sang tuần sau** | Thông báo số ca đã tạo; ngày đã có lịch hẹn được bỏ qua để không làm mất lịch khách |
| B3 | Chủ tiệm | Thêm ca 07:00–08:00 cho một thợ | Bị chặn: *"Ca làm phải nằm trong giờ mở cửa của tiệm hôm đó (08:30 - 20:00)"* |
| B4 | **Khách** (cửa sổ ẩn danh) | Mở `/dat-lich`, chọn **Cắt tóc nam (30′)** + **Nhuộm tóc thời trang (120′)** | Thanh dưới hiện `2 dịch vụ · 2 giờ 30 phút · 1.070.000 đ` |
| B5 | Khách | Sang bước Khung giờ | Chỉ hiện khung giờ có thợ rảnh **liên tục 150 phút**; các khung đè vào nghỉ trưa biến mất |
| B6 | Khách | Sang bước Chọn thợ | Chỉ liệt kê thợ làm được **cả hai** dịch vụ; có tuỳ chọn "Thợ bất kỳ" |
| B7 | Khách | Điền tên + SĐT `090123456` | Báo lỗi ngay tại ô: *"Số điện thoại phải gồm đúng 10 chữ số"* |
| B8 | Khách | Sửa thành `0901234567`, bấm **Chốt lịch hẹn** | Hiện mã tra cứu 8 ký tự + tóm tắt; nếu có email thì Maildev nhận thư xác nhận ngay |
| B9 | — | Mở http://localhost:1080 | Email xác nhận có mã tra cứu, dịch vụ, thợ, giờ bắt đầu và địa chỉ tiệm |

### B10 — Chứng minh chống đặt trùng (điểm nhấn kỹ thuật)

Chạy trong terminal:

```bash
cd backend
npm run test:e2e -- booking-concurrency
```

Kết quả mong đợi: **1 thành công / 19 nhận 409** với thông điệp
*"Khung giờ vừa có người đặt, vui lòng chọn khung giờ khác"*, kèm ca kiểm thử chứng minh
ràng buộc `EXCLUDE` ở tầng CSDL chặn cả khi ghi thẳng vào bảng.

---

## Phần C — Sprint 3: vận hành trong ngày (5 phút)

| # | Tài khoản | Thao tác | Điều cần chỉ ra |
|---|---|---|---|
| C1 | Lễ tân | Lịch ngày | Mỗi thợ một cột, trục dọc 15 phút, vạch đỏ là giờ hiện tại, vùng nghỉ tô sọc |
| C2 | Lễ tân | Chờ xác nhận → **Xác nhận** lịch khách vừa đặt ở B8 | Trạng thái chuyển sang *Đã xác nhận*; thợ nhận thông báo trong chuông |
| C3 | Lễ tân | Khách vãng lai → gõ SĐT `0911000001` | Tự điền tên **Trần Bảo Ngân** và hiện 5 lượt gần nhất |
| C4 | Lễ tân | Tạo lịch tại quầy cho khung giờ gần nhất | Vào thẳng *Đã xác nhận*, bỏ qua ràng buộc đặt trước 60 phút |
| C5 | Lễ tân | Bấm vào lịch vừa tạo → **Check-in** | Chuyển *Đã đến*, ghi giờ tới thực tế |
| C6 | Lễ tân | Mở một lịch khác → **Đổi thợ / dời giờ** | Danh sách chỉ hiện thợ đủ kỹ năng; chọn khung giờ đang bận → bị chặn kèm lý do |
| C7 | Lễ tân | Chuyển lịch hàng loạt → chọn một thợ, ngày hôm nay | Mỗi lịch có gợi ý thợ thay thế hoặc phương án dời giờ; lịch không có phương án nào bị gom vào nhóm *Cần gọi khách* |
| C8 | Thợ được gán ở C5 | Lịch của tôi → **Bắt đầu** rồi **Hoàn tất** | Số điện thoại khách hiển thị `098***1234`; ghi chú kỹ thuật lưu được 500 ký tự |

---

## Phần D — Sprint 4: thanh toán, đánh giá, báo cáo (5 phút)

| # | Tài khoản | Thao tác | Điều cần chỉ ra |
|---|---|---|---|
| D1 | Lễ tân | Mở lịch vừa hoàn tất → **Lập phiếu tính tiền** | Phiếu tự nạp dịch vụ kèm đơn giá tại thời điểm hẹn |
| D2 | Lễ tân | Thêm dòng "Sáp vuốt tóc" 180.000 đ | Tổng tính lại ngay, hiển thị `300.000 đ` |
| D3 | Lễ tân | Nhập mã `NGAYTHUONG10` → **Áp dụng** | `300.000 đ − 30.000 đ = 270.000 đ` |
| D4 | Lễ tân | Nhập mã `HETHAN2024` | Báo *"Mã giảm giá đã hết hạn"*, tổng tiền **không đổi** |
| D5 | Lễ tân | Bấm **Đóng phiếu** khi chưa thanh toán | Bị chặn: *"Chỉ đóng lịch hẹn khi phiếu đã được thanh toán"* |
| D6 | Lễ tân | Chọn Chuyển khoản, bỏ trống ghi chú → Thanh toán | Bị chặn: *"Thanh toán chuyển khoản cần nhập ghi chú đối soát"* |
| D7 | Lễ tân | Nhập ghi chú đối soát → Thanh toán → **Đóng phiếu** | Phiếu khoá lại, hệ thống phát sinh liên kết đánh giá |
| D8 | — | Mở Maildev | Email mời đánh giá, liên kết dùng một lần trong 7 ngày |
| D9 | **Khách** | Bấm liên kết → chấm **5 sao** + nhận xét | Hiện lời cảm ơn |
| D10 | Khách | Bấm lại liên kết cũ | *"Liên kết đánh giá này đã được sử dụng"* |
| D11 | Chủ tiệm | Tổng quan hôm nay | Doanh thu đã thu, số thợ theo ca, lịch hẹn theo 7 trạng thái; tự làm mới mỗi 60 giây |
| D12 | Chủ tiệm | Doanh thu → khoảng ngày tháng này | Doanh thu cộng vào **đúng thợ** vừa làm ở C8; tổng theo thợ khớp tổng chung |
| D13 | Chủ tiệm | Bấm **CSV theo thợ** | Tệp mở trên Excel hiển thị đúng tiếng Việt (UTF-8 có BOM) |
| D14 | Chủ tiệm | Khung giờ & no-show | Biểu đồ cột ngày thường so với cuối tuần, tỉ lệ không đến một chữ số thập phân |
| D15 | Admin | Nhật ký hoạt động | Mọi thao tác ở trên đều có dòng nhật ký kèm người thực hiện, thời điểm và IP |
| D16 | Admin | Bảng phân quyền | Ma trận lấy thẳng từ máy chủ — cùng nguồn với guard chặn API |

---

## Phần E — Bảo mật và responsive (2 phút)

| # | Thao tác | Điều cần chỉ ra |
|---|---|---|
| E1 | Đăng nhập sai mật khẩu 5 lần với `stylist5@salon.vn` | Lần thứ 5: *"Tài khoản đã bị khoá … thử lại sau 15 phút"*; đúng mật khẩu vẫn bị chặn |
| E2 | Admin → Tài khoản nhân sự → mở khoá tài khoản đó | Đăng nhập lại được ngay |
| E3 | Admin ngưng hoạt động một tài khoản đang mở phiên | Phiên đó mất hiệu lực ở request kế tiếp |
| E4 | Thu cửa sổ trình duyệt còn 360px, mở trang khách | Không tràn ngang, nút bấm đủ lớn cho một tay, thanh điều hướng dưới cùng |
| E5 | Mở lịch ngày ở 1366px | Lưới cột đọc được, cột giờ dính bên trái khi cuộn ngang |

---

## Bảng ghi lỗi phát hiện trong lúc diễn tập

| # | Bước | Mô tả lỗi | Mức độ | Trạng thái xử lý |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
