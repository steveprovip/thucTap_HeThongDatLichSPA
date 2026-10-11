# Nhật ký cập nhật

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).
Launcher (biểu tượng Hương Sen Salon / `HoYoSalon.bat`) đọc tệp này cho mục **Có gì mới** và **Nhật ký cập nhật**.

## [2.0.0] - 2026-10-11

### Trí tuệ nhân tạo (AI Local & Trợ lý đàm thoại)
- **Tích hợp mô hình AI Local Spark-X2.5-4B** (Q4_K_M ~2,6 GB) chạy trực tiếp trên GPU máy tính tiệm (hỗ trợ NVIDIA CUDA, Vulkan và CPU) đạt tốc độ ~98 tok/s.
- Kịch bản tải và cài đặt 1-chạm `tai_model_local.cmd` và `chay_ai_local.cmd`, tự động phát hiện GPU và khôi phục khi mất mạng.
- Trợ lý AI đàm thoại tự nhiên cho cả khách đặt lịch và quản trị viên tiệm, hỗ trợ gợi ý dịch vụ theo nhu cầu và điền thẳng vào form đặt lịch.
- Cơ chế 2 tầng: tự nhận diện máy chủ AI local; nếu chưa bật tự chuyển về Smart Rule Assistant mà không bao giờ báo lỗi.

### Dữ liệu thực tế & Giao diện người dùng (UX/UI)
- Bộ dữ liệu thực tế: 43 dịch vụ spa & tóc với ảnh Unsplash bản quyền độ nét cao, 14 thợ chuyên nghiệp, 900 khách hàng và hơn 7.900 lịch hẹn mẫu.
- **Phân trang toàn diện (Universal Pagination)**: Hook `useClientPage` đồng bộ giao diện phân trang 10/20/50 dòng cho toàn bộ các bảng (Doanh thu, Dịch vụ, Hồ sơ thợ, Lịch ca, Nhân sự, Mã giảm giá, Phiếu tính tiền).
- Trang Doanh thu: Biểu đồ cột tự động chọn Top 8 dịch vụ doanh thu cao nhất (kèm nút xem Tất cả), loại bỏ hoàn toàn lỗi đè chữ trên nhãn.
- Trang Dịch vụ: Tự động reset về trang 1 khi chuyển nhóm dịch vụ hoặc tìm kiếm.
- Trang Hồ sơ thợ: Hỗ trợ chuyển đổi linh hoạt dạng Thẻ (8 thợ/trang) và Bảng (10 thợ/trang), lọc trạng thái và nhóm kỹ năng.

### Thương mại hóa & Vận hành doanh nghiệp (B2B SaaS)
- **In hoá đơn nhiệt K80 (80mm)**: Nút in hoá đơn nhanh tại quầy thu ngân chuẩn máy in bill POS, mã VietQR động theo mã hoá đơn.
- **Cọc chống bùng lịch**: Đơn dịch vụ trên 500.000 đ tự động kích hoạt chính sách cọc 30% kèm hướng dẫn chuyển khoản VietQR cú pháp `COC <SĐT> <MÃ LỊCH>`.
- **Webhook Event Dispatcher**: Hệ thống phát sự kiện đặt/xác nhận lịch ký HMAC-SHA256 sẵn sàng kết nối Zalo ZNS và SMS Brandname.
- **Triển khai Production 1-Chạm**: `deploy_production.cmd` và `docker-compose.prod.yml` đóng gói Nginx (Brotli + Gzip), NestJS, PostgreSQL 15 an toàn.
- Cẩm nang bàn giao 3 vai trò (Chủ tiệm, Lễ tân, Kỹ thuật viên) tại `docs/COMMERCIAL_HANDOVER.md`.

## [1.6.0] - 2026-10-09

### Sao lưu an toàn & Bảo vệ CSDL
- Nâng cấp cơ chế sao lưu CSDL `pg_dump -Fc` tự động lúc 02:00, lưu trữ 14 bản gần nhất.
- Bảo vệ giao dịch và rollback an toàn khi chạy migrations.
- Đóng gói Docker production cơ bản.

## [1.5.2] - 2026-10-07

### Kiểm tra bản mới: báo đúng nguyên nhân
- Máy có mạng nhưng Launcher báo "Không kết nối được kho mã" và hiện commit / nhánh là "—": nay phân loại đúng nguyên nhân — thư mục không phải git clone (chép thư mục / giải nén .zip), chưa cài Git, kho riêng tư chưa đăng nhập GitHub, mạng chặn, Git từ chối thư mục khác chủ sở hữu (*dubious ownership*, nay tự xử lý) — kèm cách sửa và chi tiết lỗi git.
- Nút **Sửa kết nối cập nhật** (nối thư mục chép / .zip với kho mã, giữ nguyên .env, dữ liệu, sao lưu; thay đổi tay lưu thành `logs/adopt-*.patch`) và **Đăng nhập GitHub** (kho riêng tư).
- Không còn báo "Đang là bản mới nhất" khi chưa kiểm tra được; cảnh báo hiện ngay trên màn hình chính.
- Giao diện hỏi trạng thái mỗi 1,5 giây từng chạy 8+ tiến trình git mỗi lần: nay nhớ kết quả 5 giây (nhẹ máy yếu).

### Khởi động lần đầu nhanh hơn
- Không còn tự tải **PgAdmin** (~0,5 GB); chỉ dựng PostgreSQL (+ Maildev khi cần). Cần PgAdmin: `npm run db:up`.
- Docker + PostgreSQL, cài gói npm và build chạy **song song**; backend và giao diện cài / build đồng thời; `npm ci` cho lần cài sạch; bỏ cài gói thư mục gốc (chỉ dành cho kiểm thử AI).
- Build giao diện bằng `vite build` (bỏ `tsc` lặp lại), migration / tài khoản quản trị / kiểm tra bảo mật chạy bằng bản đã biên dịch thay vì ts-node (11,8 s → 1,3 s đo thực tế).
- Mỗi bước được đo giờ (`⏱`) và lưu `logs/startup-timing.json`, có trong `system_logs.zip`: máy chậm gửi tệp này là biết chậm ở bước nào.
- Đo thật khởi động lạnh chế độ máy chủ (không Docker): 52 s → 29 s.

## [1.5.1] - 2026-10-07

### macOS
- Thêm **`HoYoSalon.command`** (nhấp đúp) và ứng dụng **Hương Sen Salon.app** tự tạo trong `~/Applications`: mở Launcher không cần Terminal.
- Sửa lỗi `Permission denied` khi chạy `./scripts/unix/start_server.sh`, `start_tunnel.sh`, `update_project.sh` (thiếu quyền chạy trong git).
- Ứng dụng mở từ Finder/Dock không có PATH của Terminal: Launcher tự bổ sung thư mục của Docker Desktop, Homebrew và Node.js để thấy `docker`, `npm`, `git` (hết lỗi `docker-credential-desktop` / "chưa cài Docker").
- Cửa sổ Launcher mở dạng ứng dụng (không thanh địa chỉ) bằng Chrome / Edge / Brave nếu có, như trên Windows.
- Hướng dẫn riêng: `docs/guides/CHAY-TREN-MACOS.md`.
- Tự giải phóng cổng 3000/5173 khi mở Launcher giờ chỉ dọn tiến trình đang **lắng nghe** cổng VÀ thuộc thư mục dự án (trước đây `lsof -ti :cổng` còn bắn nhầm trình duyệt đang kết nối và mọi chương trình khác giữ cổng); dọn bằng SIGTERM thay vì kill -9.

## [1.5.0] - 2026-10-06

### Launcher: 1 chạm như game
- Không còn cửa sổ đen: biểu tượng **Hương Sen Salon** trên màn hình mở Launcher chạy ẩn (HoYoSalon.vbs); lỗi hiện bằng hộp thoại.
- Hệ thống sẵn sàng (`/health` = 200) thì tự mở ứng dụng và Launcher tự thu gọn sau 3 giây.
- Tự kiểm tra bản mới khi mở và mỗi 30 phút; nút **CẬP NHẬT (vX.Y.Z)** kèm nhãn **MỚI**, kể cả khi hệ thống đang chạy.
- Cập nhật 1 chạm: sao lưu CSDL → git pull → cài gói → build → migration → chạy lại → mở ứng dụng; lỗi tự quay về bản cũ.
- **Thiết lập cửa hàng**: nhập tên tiệm, hotline, ngân hàng nhận VietQR, Gmail gửi thư, tài khoản quản trị đầu tiên — không sửa tệp .env.
- **Sao lưu dữ liệu ngay**, **Mở thư mục sao lưu**, **Tự bật hệ thống khi mở máy**; máy tiệm (nhánh main) mặc định chế độ Máy chủ cửa hàng.

### Vận hành tiệm
- Mã VietQR và thông tin tiệm đọc lúc chạy từ máy chủ: đổi tài khoản ngân hàng / tên tiệm không cần build lại.
- Chủ tiệm lập **phiếu điều chỉnh** cho phiếu đã đóng (sửa dòng, ghi lý do; phiếu cũ giữ để đối chiếu).
- Tự sao lưu CSDL lúc 02:00 mỗi ngày, sao lưu bù khi máy bật lại sau đêm tắt máy.

### Rà soát 5 bất biến theo tệp yêu cầu
- Giữ chỗ không còn dùng được để đặt dịch vụ thợ không làm được; giữ chỗ phải đúng lưới 15 phút.
- Dời lịch / chuyển hàng loạt ghi trong giao dịch có khoá; đổi trạng thái đồng thời không làm lịch đã huỷ "sống lại".
- Thua cuộc tranh khung giờ không bị trừ hạn mức 5 lượt đặt / giờ.
- Ngày nghỉ theo giờ cắt ngang lịch hẹn được cảnh báo; giờ nghỉ giữa ca không đè lên lịch đã đặt.
- Phiếu đã đóng bất biến ở tầng CSDL (trigger); hai lượt điều chỉnh cùng lúc chỉ một lượt thành công.

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
