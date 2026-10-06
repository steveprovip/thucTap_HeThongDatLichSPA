# MASTER PROMPT: NÂNG CẤP LAUNCHER HOYOPLAY, CHUẨN HOÁ CẤU TRÚC QUỐC TẾ & XỬ LÝ 11 YÊU CẦU MENTOR

<role>
Bạn là Principal Fullstack Architect kiêm Technical Lead Hệ thống.
Nhiệm vụ: Nghiên cứu và hiện thực hoá trọn gói 3 trụ cột nâng cấp lớn:
1. Xây dựng Launcher 1-Click chuẩn phong cách HoYoPlay (Auto-Update, nút "Bắt đầu", bảng chẩn đoán Log/Phiên bản).
2. Tái cấu trúc thư mục `F:\hoc_tap\thuc_tap\du_an` theo chuẩn quốc tế (Clean Monorepo Enterprise Standard).
3. Xử lý triệt để 11 yêu cầu cải tiến nghiệp vụ của Mentor ghi nhận tại `loi_06_10_2026\TEXT NOTE SPRINT 2.docx`.
</role>

<workspace_context>
- Thư mục dự án: `F:\hoc_tap\thuc_tap\du_an`
- Yêu cầu Mentor: `F:\hoc_tap\thuc_tap\du_an\loi_06_10_2026\TEXT NOTE SPRINT 2.docx`
- Đề tài gốc: `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx` (4 Sprints, 39 User Stories, 165 Story Points)
- Tác giả commit: `steveprovip <158487753+steveprovip@users.noreply.github.com>` (không thêm bất kỳ nhãn AI branding nào).
</workspace_context>

<pillar_1_hoyoplay_launcher>
### TRỤ CỘT 1: XÂY DỰNG LAUNCHER PHONG CÁCH HOYOPLAY (1-CLICK DESKTOP / WEB LAUNCHER)
Thiết kế ứng dụng Launcher giao diện Dark Glassmorphism chuẩn phong cách HoYoPlay (`launcher.html` hoặc Desktop App Launcher):
1. **Nút Hành Động Thông Minh (Hero Action Button)**:
   - Nếu đang ở phiên bản mới nhất: Nút vàng sáng lớn **"BẮT ĐẦU"** $\rightarrow$ Nhấp vào là tự động khởi chạy ngầm và mở ngay trang ứng dụng.
   - Nếu máy chủ/GitHub có bản mới hơn: Tự động đổi thành nút xanh/vàng **"CẬP NHẬT"** kèm nhãn phiên bản mới (ví dụ: `v1.3.7`).
   - Khi nhấp **"CẬP NHẬT"**: Hiển thị thanh tiến trình (% tải, kéo code, chạy migration, build) $\rightarrow$ Cập nhật xong tự động chuyển sang nút **"BẮT ĐẦU"**.
2. **Modal / Tab "Thông Tin & Chẩn Đoán" (Khớp 100% UI HoYoPlay)**:
   - **Thông Tin Phiên Bản**: Hiển thị mã phiên bản hiện tại (VD: `v1.3.6`) và trạng thái kết nối.
   - **Xem Log Cập Nhật**: Mở pop-up Changelog hiển thị chi tiết các tính năng mới đã cập nhật.
   - **Kiểm Tra Phiên Bản Mới Nhất**: Nút gọi API check update từ GitHub release / remote.
   - **Xem Log Client / Server**: Cửa sổ xem trực tiếp log runtime của Backend NestJS, CSDL PostgreSQL và Frontend Vite.
   - **Tải Log Lên / Xuất Log**: Nút xuất gói log chẩn đoán (`system_logs.zip`) để gửi hỗ trợ kỹ thuật khi gặp sự cố.
   - **Sao Chép Thông Tin Thiết Bị**: Sao chép thông số cấu hình máy (OS, Node.js version, Port status, Docker status) vào clipboard.
</pillar_1_hoyoplay_launcher>

<pillar_2_clean_architecture_refactor>
### TRỤ CỘT 2: TÁI CẤU TRÚC THƯ MỤC CHUẨN QUỐC TẾ (CLEAN MONOREPO)
Dọn dẹp thư mục gốc `F:\hoc_tap\thuc_tap\du_an`, gom các file phân tán thành kiến trúc chuyên nghiệp:
```
F:\hoc_tap\thuc_tap\du_an/
├── apps/ (hoặc giữ backend/ và frontend/ độc lập)
│   ├── backend/         # NestJS 10 API, TypeORM, PostgreSQL Module
│   └── frontend/        # React 18, Vite, Tailwind CSS SPA
├── deploy/              # Cấu hình triển khai hạ tầng
│   ├── docker/          # docker-compose.yml, Dockerfiles
│   └── cloudflared/     # Cloudflare Tunnel config
├── docs/                # Toàn bộ tài liệu báo cáo, đề tài, runbook, slide
│   ├── reports/         # Bao_Cao_Thuc_Tap_He_Thong_Dat_Lich_Salon_Spa.docx
│   ├── presentations/   # Slide_Bao_Cao_He_Thong_Dat_Lich_Salon_Spa.pptx
│   └── tools/           # build_report_docx.py, report_data.py
├── scripts/             # Kịch bản tự động hoá và Launcher
│   ├── launcher.mjs     # Lõi điều phối Launcher & Giám sát tiến trình
│   ├── update.mjs       # Kịch bản cập nhật CSDL và Migration
│   └── backup.mjs       # Sao lưu dữ liệu
├── HoYoSalon.bat        # Điểm vào 1-Click duy nhất ở thư mục gốc
├── package.json         # Workspace Root Monorepo
└── README.md            # Tài liệu dự án
```
- Đảm bảo việc sắp xếp lại **KHÔNG làm gãy bất kỳ đường dẫn nào** trong Unit Tests, E2E Tests, CI/CD Actions và các script sinh tài liệu.
</pillar_2_clean_architecture_refactor>

<pillar_3_mentor_feedback_resolution>
### TRỤ CỘT 3: XỬ LÝ 11 YÊU CẦU CỦA ANH MENTOR (`loi_06_10_2026`)
1. **Phân chia lại nhánh Git**: Thiết lập cấu trúc nhánh chuẩn: `main` (Production), `develop` (Staging), `feature/*` (Tính năng), `fix/*` (Sửa lỗi), `docs/*` (Tài liệu).
2. **Giao diện Bảng ca làm việc**: Tối ưu lại trực quan, hiển thị gọn gàng, chia ca rõ ràng theo từng thợ, loại bỏ cảm giác rối mắt.
3. **Bộ chọn giờ 24h trong "Thêm ca làm"**: Đổi bộ chọn giờ sang định dạng 24:00 chuẩn (`00:00` đến `23:45`, bước nhảy 15 phút).
4. **AI Phân Tích Khung Giờ Đặt Lịch (Smart Slot Recommendation)**: Tích hợp widget AI phân tích thông minh ngay trong màn hình xếp lịch/vãng lai để gợi ý ca tối ưu nhất mà nhân viên không cần thoát ra ngoài tra cứu.
5. **AI Sinh Tự Động Ngày Nghỉ Lễ Trong Năm**: Bổ sung tính năng 1-Click sinh toàn bộ ngày lễ quốc gia Việt Nam (Tết Nguyên Đán, Giỗ Tổ Hùng Vương, 30/4 - 1/5, Quốc khánh 2/9...) vào `salon_holidays` để tránh lịch hẹn bị chèn vào ngày lễ.
6. **Quy trình Nhân viên Đăng Ký Lịch Làm $\rightarrow$ Quản Lý Phê Duyệt**: Thêm luồng thợ tự gửi yêu cầu ca làm/nghỉ phép, Quản lý/Chủ tiệm bấm "Duyệt" hoặc "Từ chối".
7. **Tùy biến Footer (Chân trang)**: Đổi màu chân trang nổi bật, bổ sung đầy đủ: Facebook, Zalo, địa chỉ tiệm, hotline, danh sách chuyên viên/bác sĩ tư vấn.
8. **Tăng Mật Độ Thông Tin Giao Diện (Data Density UI)**: Thu hẹp khoảng trắng 2 bên, hiển thị tối ưu dạng 2 hàng/lưới gọn, giúp xem được nhiều bản ghi mà không phải cuộn trang liên tục.
9. **Cân Bằng Phân Bổ Ca Làm**: Tự động cảnh báo hoặc gợi ý khi một khung giờ mở cửa trong ngày chưa có thợ nào trực ca.
10. **Gửi Email Xác Nhận Đặt Lịch Tự Động**: Đảm bảo 100% lịch đặt thành công (online hoặc tại quầy có email) đều tự động gửi email thông báo chi tiết qua SMTP/Maildev.
11. **Tạm Giữ Chỗ (Slot Hold / Pending Lock 10 - 15 Phút)**: Triển khai cơ chế khóa tạm thời khung giờ 10-15 phút khi khách đang trong tiến trình điền thông tin đặt lịch, tránh bị người khác cướp khung giờ trước khi kịp chốt.
</pillar_3_mentor_feedback_resolution>

<quality_gates_and_git_workflow>
- **Kiểm định**: Unit tests 100% PASS, E2E tests 100% PASS, Lint 0 warning, Build production sạch.
- **Báo cáo**: Sinh lại báo cáo Word và Slide đồng bộ theo Nghị định 30/2020/NĐ-CP.
- **Git**: Commit tách biệt từng hạng mục, tác giả `steveprovip`, merge sạch vào `develop` và `main`, push lên GitHub.
</quality_gates_and_git_workflow>
