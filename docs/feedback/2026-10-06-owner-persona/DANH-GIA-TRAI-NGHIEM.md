# Đánh giá trải nghiệm — nhập vai chủ chuỗi Salon Spa mua trọn gói

Vai: chủ tiệm không rành IT, vừa nhận bàn giao phần mềm, máy quầy Windows. Đi trọn hành trình
**nhận phần mềm → mở ứng dụng → xếp ca thợ → đặt lịch → thu tiền VietQR → xem doanh thu → bảo trì / cập nhật**,
ghi lại từng chỗ vướng và cách đã xử lý trong bản v1.5.0. Thử trên bản build production (chế độ Máy chủ cửa hàng).

## 1. Điểm vướng và cách xử lý

| # | Bước | Vướng mắc (góc nhìn chủ tiệm / nhân viên) | Mức | Đã xử lý |
|---|---|---|---|---|
| 1 | Mở ứng dụng | Bấm `HoYoSalon.bat` hiện **cửa sổ đen**; nhân viên tưởng lỗi, tắt đi | Cao | Mở qua `HoYoSalon.vbs` chạy ẩn; tự tạo biểu tượng **Hương Sen Salon** trên màn hình; lỗi hiện bằng hộp thoại Windows |
| 2 | Mở ứng dụng | Sau **BẮT ĐẦU** phải tự mở trình duyệt, gõ địa chỉ; cửa sổ Launcher nằm che màn hình | Trung bình | `/health` = 200 → tự mở ứng dụng, Launcher đếm 3 giây rồi tự thu gọn |
| 3 | Lần đầu | Máy tiệm mặc định chạy chế độ **Phát triển + dữ liệu mẫu** (khách giả, tài khoản mật khẩu công khai) | Cao | Máy ở nhánh `main` mặc định **Máy chủ cửa hàng** (không nạp mẫu) |
| 4 | Lần đầu | Phải **sửa `backend/.env`** để có tài khoản quản trị đầu tiên, Gmail gửi thư | Cao | Launcher > **Thiết lập cửa hàng**: biểu mẫu kiểm tra từng ô, tự ghi `.env` (giữ bản `.env.bak`), không hiện lại mật khẩu; nhắc ngay trên màn hình chính nếu chưa thiết lập |
| 5 | Thu tiền | Mã **VietQR không hiện**, thông báo nhắc biến `VITE_BANK_BIN`; sửa xong vẫn không hiện vì cần **build lại giao diện** | Cao | Ngân hàng / số tài khoản đọc **lúc chạy** từ máy chủ (`/public/salon-info`), chọn ngân hàng từ danh sách, tên chủ tài khoản tự in hoa không dấu |
| 6 | Thu tiền | Đổi tên tiệm / hotline: phiếu in và đầu trang vẫn tên cũ (giá trị lúc build) | Trung bình | Giao diện lấy tên, địa chỉ, hotline từ máy chủ khi khởi động |
| 7 | Thu tiền | Giao diện ghi "muốn sửa phải tạo phiếu điều chỉnh" nhưng **không có nút** | Cao | Nút **Lập phiếu điều chỉnh** (Chủ tiệm): sửa dòng, nhập lý do, phiếu cũ giữ nguyên, doanh thu theo phiếu mới |
| 8 | Đặt lịch | Khách chọn giờ bị người khác giành 2–3 lần là **bị chặn 1 giờ** (429) | Trung bình | Thua cuộc tranh khung giờ được trả lại lượt (rà soát bất biến 4) |
| 9 | Lễ tân | Hai máy cùng thao tác một lịch: lịch đã huỷ có thể **"sống lại"**, thông báo lỗi khó hiểu | Cao | Khoá dòng khi đổi trạng thái; thông báo "Lịch hẹn vừa được người khác cập nhật… Tải lại" |
| 10 | Xếp ca | Thêm giờ nghỉ giữa ca **đè lên khách đã đặt** không bị chặn; nghỉ theo giờ cắt ngang lịch không cảnh báo | Trung bình | Chặn kèm mã lịch; cảnh báo theo điều kiện chồng lấn |
| 11 | Bảo trì | Không có **sao lưu hằng ngày** (yêu cầu phi chức năng 02:00), sao lưu tay phải gõ lệnh | Cao | Tự sao lưu 02:00 + bù khi máy bật lại; Launcher: **Sao lưu dữ liệu ngay**, **Mở thư mục sao lưu** |
| 12 | Cập nhật | Muốn cập nhật phải biết có bản mới, nhiều bước | Trung bình | Launcher tự kiểm tra (khi mở + 30 phút), nút **CẬP NHẬT (vX.Y.Z)** + **MỚI**, 1 chạm có sao lưu trước, lỗi tự quay về |
| 13 | Hằng ngày | Mất điện / bật máy lại: phải nhớ mở Launcher và bấm BẮT ĐẦU | Thấp | Cài đặt > **Tự bật hệ thống khi mở máy** |

## 2. Rủi ro còn lại (cần kỹ thuật viên)

- **Khôi phục từ bản sao lưu** vẫn là thao tác dòng lệnh (`pg_restore`, `docs/TRIEN-KHAI.md` mục 4.5) — cố ý không đưa
  lên nút bấm vì ghi đè toàn bộ dữ liệu.
- Cần **Docker Desktop** đang chạy; Launcher tự thử mở và hướng dẫn, nhưng máy yếu có thể mất 1–2 phút.
- Máy quầy **ngủ / tắt** thì khách không đặt được qua mạng; truy cập từ xa cần đường hầm Cloudflare (`docs/TRIEN-KHAI.md`).
- Gmail cần **mật khẩu ứng dụng** (bật xác minh 2 bước) — đã ghi chú ngay trong biểu mẫu.

## 3. Tài liệu bàn giao

- Cho chủ tiệm / lễ tân: [`docs/guides/BAN-GIAO-CHU-TIEM.md`](../../guides/BAN-GIAO-CHU-TIEM.md) — cài đặt một lần, việc
  hằng ngày, cập nhật, sao lưu, bảng xử lý sự cố, bảo mật tối thiểu.
- Cho kỹ thuật viên: `docs/TRIEN-KHAI.md` (triển khai, khôi phục), `README.md` (Launcher, lệnh), `docs/testing/AUDIT-5-BAT-BIEN-2026-10-06.md`.
