# MASTER PROMPT: ỔN ĐỊNH HỆ THỐNG & CHUẨN HOÁ BÁO CÁO THỰC TẬP THEO NGHỊ ĐỊNH 30/2020/NĐ-CP

<role>
Bạn là Kỹ sư Trưởng kiêm Chuyên gia Soạn thảo Văn bản Kỹ thuật & Báo cáo Học thuật.
Nhiệm vụ: Dừng toàn bộ các nâng cấp hạ tầng phức tạp, đưa hệ thống về trạng thái chạy ổn định 100% qua 1-click (`run_project.bat`), xử lý triệt để lỗi ngày nghỉ lễ, và chuẩn hoá toàn bộ báo cáo tại `F:\hoc_tap\thuc_tap\du_an\docs` theo chuẩn Nghị định 30/2020/NĐ-CP.
</role>

<context>
- Thư mục dự án: `F:\hoc_tap\thuc_tap\du_an`
- Đề tài chuẩn: `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx` (4 Sprints, 39 User Stories, 165 Story Points)
- Tài liệu báo cáo: `F:\hoc_tap\thuc_tap\du_an\docs` (bao gồm công cụ sinh báo cáo tự động `docs/tools/build_report_docx.py`, `report_data.py`, và `Bao_Cao_Thuc_Tap_He_Thong_Dat_Lich_Salon_Spa.docx`)
- Tác giả commit: `steveprovip` (nghiêm cấm mọi thẻ Co-Authored-By hoặc Claude-Session)
</context>

<action_items>

### NHIỆM VỤ 1: DỪNG NÂNG CẤP HẠ TẦNG & ỔN ĐỊNH HỆ THỐNG 1-CLICK
1. Dừng ngay các luồng nghiên cứu/nâng cấp phân tán (Cloud Deploy, Cloudflare Tunnel, SSE) chưa cần thiết.
2. Sửa dứt điểm lỗi lưu ngày nghỉ lễ tại `backend/src/modules/working-hours/working-hours.service.ts`:
   - Khi có cảnh báo lịch bị ảnh hưởng và người dùng xác nhận (`dto.force = true`), phải lưu thành công vào bảng `salon_holidays`.
   - `@Audit` chỉ ghi nhận khi ngày nghỉ được INSERT/DELETE thành công vào CSDL, không ghi log khi chỉ trả cảnh báo warning.
3. Bảo đảm `run_project.bat` khởi động trơn tru: Docker $\rightarrow$ Backend NestJS $\rightarrow$ Frontend Vite $\rightarrow$ Mở trình duyệt.

### NHIỆM VỤ 2: CHUẨN HOÁ BÁO CÁO THEO NGHỊ ĐỊNH 30/2020/NĐ-CP & ĐỒNG BỘ HỆ THỐNG
1. Chỉnh sửa công cụ sinh báo cáo [`docs/tools/build_report_docx.py`](file:///F:/hoc_tap/thuc_tap/du_an/docs/tools/build_report_docx.py) và dữ liệu [`docs/tools/report_data.py`](file:///F:/hoc_tap/thuc_tap/du_an/docs/tools/report_data.py):
   - **Font chữ**: Times New Roman toàn văn bản.
   - **Cỡ chữ**: 13 - 14 pt cho nội dung chính; tiêu đề cấp 1: 16pt In đậm; cấp 2: 14pt In đậm; cấp 3: 13pt In đậm nghiêng.
   - **Định dạng trang (Page Setup A4)**:
     * Lề trên (Top margin): 20 mm (0.79 in).
     * Lề dưới (Bottom margin): 20 mm (0.79 in).
     * Lề trái (Left margin): 30 mm (1.18 in - để đóng gáy).
     * Lề phải (Right margin): 15 mm (0.59 in).
   - **Dãn dòng & Dãn đoạn**: Line spacing 1.3 - 1.5 lines; Spacing After 6pt, Spacing Before 0pt. Thụt đầu dòng (First line indent) 1.27 cm (1/2 inch).
   - **Đánh số trang**: Đặt ở giữa lề trên hoặc lề dưới theo chuẩn, trang đầu tiên không hiện số trang.
   - **Tiêu đề Bảng biểu & Hình ảnh**:
     * Bảng: "Bảng X.Y: Tên bảng" đặt phía TRÊN bảng, canh trái/giữa.
     * Hình: "Hình X.Y: Tên hình" đặt phía DƯỚI hình, canh giữa.
2. Đồng bộ 100% nội dung kỹ thuật trong báo cáo:
   - Kiến trúc 4 tầng: NestJS Controller/Service/Entity, TypeORM, PostgreSQL 16, React Vite.
   - Chi tiết 4 Sprints, 39 User Stories, 165 Story Points khớp từng tiêu chí chấp nhận (AC) với đề tài.
   - Bộ thuật toán tính khung giờ trống (`SlotCalculator`), cơ chế chống đặt trùng (`appointments_no_overlap`), mã tra cứu 8 ký tự, giới hạn rate limit.
3. Chạy lệnh sinh lại báo cáo hoàn chỉnh:
   ```powershell
   python docs/tools/build_report_docx.py
   python docs/tools/build_slides_pptx.py
   ```

### NHIỆM VỤ 3: KIỂM THỬ & ĐẨY LÊN GITHUB THEO QUY TRÌNH GIT WORKFLOW
1. Chạy Quality Gates:
   - Backend unit tests: `npm run test --prefix backend` (105/105 PASS).
   - Backend E2E tests: `npm run test:e2e --prefix backend` (57/57 PASS).
   - Frontend build: `npm run build --prefix frontend` (Sạch 100%).
2. Git Workflow:
   - Tạo commit rõ ràng, tách bạch: `fix(backend): ...`, `docs: format report according to decree 30/2020/ND-CP`.
   - Tác giả: `steveprovip <158487753+steveprovip@users.noreply.github.com>`.
   - Merge sạch vào nhánh `develop` và `main`, push đầy đủ lên `origin/develop` và `origin/main`.
</action_items>
