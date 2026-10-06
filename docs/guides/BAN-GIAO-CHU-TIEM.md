# Hướng dẫn bàn giao cho chủ tiệm — Hương Sen Salon

Tài liệu dành cho **chủ tiệm và lễ tân**, không cần kiến thức IT. Mọi việc làm bằng chuột trong cửa sổ **Hương Sen Salon**
(biểu tượng hoa sen trên màn hình). Không phải mở cửa sổ đen, không phải sửa tệp cấu hình.

---

## 1. Kỹ thuật viên cài một lần (khoảng 30 phút)

| Việc | Ghi chú |
|---|---|
| Cài **Node.js LTS** (nodejs.org), **Git** (git-scm.com), **Docker Desktop** (docker.com) | Docker Desktop: bật "Start when you sign in" |
| Lấy phần mềm bằng `git clone <địa chỉ kho mã>` vào ổ D: hoặc F: | **Không tải dạng .zip** — bản .zip không tự cập nhật được |
| Nhấp đúp `HoYoSalon.bat` một lần | Tạo biểu tượng **Hương Sen Salon** trên màn hình; từ đây chỉ dùng biểu tượng này |
| Launcher > **Thiết lập cửa hàng**: nhập tên tiệm, địa chỉ, hotline, ngân hàng + số tài khoản, Gmail gửi thư, tài khoản quản trị đầu tiên | Bật ô **Dùng chế độ Máy chủ cửa hàng**. Gmail cần **mật khẩu ứng dụng** (Google > Bảo mật > Xác minh 2 bước > Mật khẩu ứng dụng) |
| Launcher > Cài đặt > **Tự bật hệ thống khi mở máy** | Tắt chế độ ngủ của máy quầy (Cài đặt Windows > Nguồn > Không bao giờ) |
| Bấm **BẮT ĐẦU** → đăng nhập bằng tài khoản quản trị → đổi mật khẩu → tạo tài khoản Chủ tiệm, Lễ tân, Thợ (Quản trị > Tài khoản nhân sự) | Lần đầu mất 2–5 phút (cài gói, build) |

## 2. Mỗi ngày

1. Bật máy → hệ thống tự chạy và mở trang làm việc (nếu đã bật "Tự bật hệ thống khi mở máy").
   Chưa bật thì bấm biểu tượng **Hương Sen Salon** → **BẮT ĐẦU**: trình duyệt tự mở, cửa sổ Launcher tự thu gọn.
2. Lễ tân: **Lịch ngày** (xác nhận, check-in, đổi thợ, dời giờ) → **Phiếu tính tiền** (Tiền mặt hoặc **VietQR Banking**:
   khách quét mã, số tiền và nội dung điền sẵn) → **Đóng phiếu**.
3. Thợ: **Lịch của tôi** (bắt đầu / hoàn tất), **Đăng ký lịch làm** cho tuần sau.
4. Chủ tiệm: **Tổng quan hôm nay**, **Bảng ca làm** (duyệt yêu cầu ca, hộp **Độ phủ ca** báo giờ thiếu thợ),
   **Doanh thu** (theo thợ, theo dịch vụ, xuất CSV mở bằng Excel).

## 3. Cập nhật phiên bản mới

Khi có bản mới, nút lớn trong Launcher đổi thành **CẬP NHẬT (vX.Y.Z)** kèm nhãn **MỚI**. Bấm một lần, chờ 1–3 phút:
Launcher tự **sao lưu dữ liệu → tải bản mới → cài đặt → nâng cấp cơ sở dữ liệu → chạy lại → mở trang**.
Lỗi ở bất kỳ bước nào thì tự quay về bản cũ, dữ liệu khách giữ nguyên. Nên cập nhật ngoài giờ đông khách.

## 4. Sao lưu dữ liệu

| Cách | Khi nào |
|---|---|
| Tự động **02:00 mỗi ngày** | Máy tắt lúc 02:00 thì tự sao lưu bù khoảng 3 phút sau khi bật hệ thống |
| Tự động trước mỗi lần **CẬP NHẬT** | Tệp có chữ `truoc_cap_nhat` |
| Bấm tay: Launcher > ⋯ > **Sao lưu dữ liệu ngay** | Trước khi sửa giá hàng loạt, cuối tháng… |

Launcher > ⋯ > **Mở thư mục sao lưu**: **mỗi tuần chép thư mục này sang USB hoặc Google Drive**. Bản sao nằm cùng ổ cứng
không cứu được khi hỏng ổ. **Khôi phục** từ bản sao lưu là thao tác ghi đè dữ liệu: gọi kỹ thuật viên
(hướng dẫn kỹ thuật: `docs/TRIEN-KHAI.md` mục 4.5).

## 5. Khi có sự cố

| Hiện tượng | Làm gì |
|---|---|
| Bấm biểu tượng không thấy gì | Đợi 10 giây rồi bấm lại (Launcher có thể đang mở sẵn). Có hộp thoại báo lỗi: bấm **Yes** để mở nhật ký |
| Launcher báo "Docker chưa chạy" | Mở **Docker Desktop**, chờ biểu tượng cá voi đứng yên, bấm **BẮT ĐẦU** lại |
| Mã VietQR không hiện | Launcher > **Thiết lập cửa hàng** > kiểm tra ngân hàng và số tài khoản > Lưu > đồng ý khởi động lại |
| Khách không nhận được email | Thiết lập cửa hàng > Gmail và **mật khẩu ứng dụng** (không phải mật khẩu đăng nhập Gmail) |
| Báo "Lịch hẹn vừa được người khác cập nhật" | Hai máy cùng thao tác một lịch: bấm tải lại trang, xem trạng thái mới rồi làm tiếp |
| Khác | Launcher > ⚙ **Thông tin & Chẩn đoán** > **Xuất system_logs.zip** (đã ẩn mật khẩu) và **Sao chép thông tin thiết bị** → gửi kỹ thuật viên |

## 6. Bảo mật tối thiểu

- Mỗi nhân viên một tài khoản riêng; nhân viên nghỉ việc: Quản trị > Tài khoản nhân sự > **Ngưng hoạt động** (phiên đăng nhập hết hiệu lực ngay).
- Không chia sẻ mật khẩu quản trị. Sai mật khẩu 5 lần tài khoản bị khoá 15 phút.
- Phiếu đã đóng không sửa được (kể cả quản trị) — sai sót thì **Lập phiếu điều chỉnh** có ghi lý do.
