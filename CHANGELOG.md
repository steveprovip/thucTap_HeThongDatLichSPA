# Nhật ký cập nhật

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).
Launcher (`HoYoSalon.bat`) đọc tệp này cho mục **Có gì mới** và **Nhật ký cập nhật**.

## [1.4.0] - 2026-10-06

### Launcher HoYoSalon
- Một điểm vào duy nhất `HoYoSalon.bat`: cửa sổ Launcher nền tối kính mờ, nút lớn **BẮT ĐẦU** chạy toàn bộ hệ thống và tự mở ứng dụng khi sẵn sàng.
- Tự kiểm tra phiên bản mới trên GitHub; có bản mới thì nút đổi thành **CẬP NHẬT vX.Y.Z**, thanh tiến trình theo từng bước (tải mã → cài gói → build → sao lưu + migration → chạy lại).
- Bảng **Thông tin & Chẩn đoán**: phiên bản và trạng thái kết nối, nhật ký cập nhật, xem log Client / Server / CSDL / Cập nhật trực tiếp, xuất gói `system_logs.zip` (đã ẩn mật khẩu, khoá), sao chép thông tin thiết bị.

### Góp ý Mentor Sprint 2 (06/10/2026)
- Bảng ca làm việc gọn, dễ đọc: mỗi thợ một dòng, ca tô màu theo buổi, ngày tiệm nghỉ gạch chéo, đếm số thợ trực mỗi ngày.
- Bộ chọn giờ 24 giờ (00:00 → 23:45, bước 15 phút) cho ca làm, nghỉ giữa ca, nghỉ phép và giờ mở cửa.
- Trợ lý AI xếp lịch ngay trong màn hình tạo lịch: gợi ý khung giờ tốt nhất (sớm · vừa khít · cân bằng thợ) kèm lý do.
- AI sinh toàn bộ ngày lễ Việt Nam cả năm 1 cú nhấp (âm lịch thiên văn), không chèn lên ngày khách đã đặt.
- Thợ tự đăng ký ca làm / xin nghỉ cả tuần, quản lý duyệt (có thể chỉnh giờ) hoặc từ chối kèm lý do.
- Chân trang nền tối nổi bật: địa chỉ + chỉ đường, hotline, email, Facebook, Zalo, giờ mở cửa, đội ngũ chuyên viên.
- Trang chủ hiển thị dày hơn: lưới 4 cột liền mạch, 2 hàng + "Xem thêm", hết khoảng trống hai bên.
- Cảnh báo khung giờ mở cửa chưa có thợ trực, gợi ý thợ rảnh ít giờ làm nhất để xếp nhanh.
- Email xác nhận đặt lịch đầy đủ hơn, gửi ngay; khách chưa nhập email vẫn gửi được từ màn hình đặt lịch thành công.
- Tạm giữ chỗ 10 phút khi khách đang điền thông tin đặt lịch, có đồng hồ đếm ngược và nút giữ thêm.
- Quy trình nhánh Git chuẩn: main (Production) · develop (Staging) · feature/* · fix/* · docs/*.

### Cấu trúc dự án
- Sắp xếp lại thư mục chuẩn monorepo: `deploy/docker`, `backend/database`, `docs/{reports,presentations,requirements,feedback,testing,guides}`, `scripts/{windows,unix,ai,hoyo,lib}`.
- Thêm `scripts/update.mjs`, `scripts/backup.mjs`; bỏ mọi đường dẫn tuyệt đối ổ F:\ trong kịch bản.

## [1.3.6] - 2026-10-05
### Sửa lỗi
- Thống nhất số liệu khách (tổng lịch, lượt hoàn tất, lượt không đến) ở mọi màn hình.
- Chặn tạo / dời lịch vào ngày tiệm nghỉ lễ với thông báo nêu rõ lý do.

## [1.3.5] - 2026-10-04
### Cải tiến
- Cảnh báo tách lịch cố định ở thanh đặt lịch; khoá tra cứu 30 phút có đồng hồ đếm ngược.

## [1.3.4] - 2026-10-04
### Sửa lỗi
- QA vòng 3: làm sạch bản nháp đặt lịch, kiểm tra lịch tại quầy, mã tra cứu 8 ký tự, sửa ngày ISO.

## [1.3.3] - 2026-10-04
### Launcher
- Launcher 1-click vững chắc, tự tạo .env, mặc định chạy API thật (không rơi vào chế độ Demo).

## [1.3.2] - 2026-10-04
### Thêm mới
- Giới tính thợ cho ảnh đại diện; đồng bộ luật chế độ Demo (QA-01..08); runbook QA Sprint 2.

## [1.3.1] - 2026-10-03
### Bảo mật
- Gia cố kiểm tra DTO, giới hạn tần suất huỷ lịch, lint nghiêm ngặt.

## [1.3.0] - 2026-10-02
### Thêm mới
- Sửa 23 lỗi QA, lá chắn chống đặt trùng, thanh toán VietQR động, bộ kiểm thử hồi quy.

## [1.2.5] - 2026-09-28
### Launcher
- Tiến trình giám sát API/WEB, tự khởi động lại khi sập (0xC0000409), dừng sạch cả cây tiến trình.

## [1.2.0] - 2026-09-27
### Sửa lỗi
- Sửa 8 lỗi kiểm định Sprint 1, ảnh dự phòng ngoại tuyến, mật khẩu tạm và nút quay lại.

## [1.1.0] - 2026-09-25
### Giao diện
- Giao diện phong cách Fresha sáng sang trọng, chuyển động và ảnh riêng cho từng dịch vụ.
