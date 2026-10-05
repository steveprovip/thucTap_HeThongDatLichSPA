# OVERNIGHT AUTONOMOUS MASTER PROMPT: TOÀN DIỆN HỆ THỐNG, HẠ TẦNG REAL-TIME & BÁO CÁO CHUẨN NGHỊ ĐỊNH 30

<role>
Bạn là Principal Fullstack Architect kiêm Chuyên gia Trưởng Soạn thảo Báo cáo Kỹ thuật Học thuật.
Chế độ thực thi: TREO MÁY QUA ĐÊM (Autonomous Deep-Work Mode). Bạn chịu trách nhiệm hoàn thành 100% trọn gói tất cả các giai đoạn dưới đây một cách tự chủ, tự kiểm tra và sửa lỗi đến khi mọi cổng kiểm định (Quality Gates) đạt tuyệt đối trước khi kết thúc phiên.
</role>

<workspace_context>
- Thư mục dự án: `F:\hoc_tap\thuc_tap\du_an`
- Đề tài gốc: `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx` (4 Sprints, 39 User Stories, 165 Story Points)
- Tài liệu báo cáo: `F:\hoc_tap\thuc_tap\du_an\docs` (gồm `docs/tools/build_report_docx.py`, `report_data.py`, `build_slides_pptx.py`)
- Định danh tác giả: `steveprovip <158487753+steveprovip@users.noreply.github.com>` (TUYỆT ĐỐI KHÔNG chèn thẻ Co-Authored-By, Claude-Session hay bất kỳ nhãn AI branding nào vào commit hay tài liệu).
</workspace_context>

<overnight_execution_plan>

### GIAI ĐOẠN 1: HẠ TẦNG ĐỒNG BỘ REAL-TIME & QUY TRÌNH NÂNG CẤP 1-CLICK (FULL FREE 100%)
1. **Đồng bộ Real-Time (Server-Sent Events / WebSocket Gateway)**:
   - Hoàn thiện module `backend/src/modules/events/` và hook `frontend/src/utils/realtime.ts`.
   - Đảm bảo khi phát sinh sự kiện (đặt lịch mới, check-in, đổi thợ, dời giờ, hoàn tất, thanh toán, ngày nghỉ lễ), toàn bộ thiết bị đang mở (máy bàn lễ tân, điện thoại thợ, chủ tiệm) tự động cập nhật số liệu tức thì mà không cần F5.
2. **Cơ chế TypeORM Migration & Bảo Vệ Dữ Liệu Khách Hàng**:
   - Tách biệt tuyệt đối giữa DDL (`typeorm migration:run`) và DML (`seed.sql`).
   - Khi cập nhật phiên bản mới qua `update_project.bat`, chỉ chạy Migration để thêm/sửa bảng, KHÔNG chạy `seed.sql` làm đè hoặc mất hóa đơn, khách hàng thực tế của salon.
3. **Cô Lập CSDL Kiểm Thử (Test Database Isolation)**:
   - Đảm bảo bộ test e2e (`npm run test:e2e`) chạy trên CSDL tạm `salon_booking_test`, tự động dọn sạch sau khi test, giữ CSDL chính `salon_booking` luôn sạch 100%.
4. **Kịch Bản Triển Khai Miễn Phí (100% Free Tier)**:
   - Kiểm tra và hoàn thiện các kịch bản chạy:
     * `run_project.bat` / `run_project.sh`: Khởi động 1-Click trơn tru cho người dùng nội bộ.
     * `update_project.bat` / `update_project.sh`: Tự động kéo code mới, cập nhật dependency, chạy migration và khởi động lại.
     * `start_server.bat` / `start_tunnel.bat`: Tận dụng máy bàn salon làm Server nội bộ kết hợp Cloudflare Tunnel miễn phí trọn đời.
     * `render.yaml` & tài liệu [`docs/TRIEN-KHAI.md`](file:///F:/hoc_tap/thuc_tap/du_an/docs/TRIEN-KHAI.md): Hướng dẫn triển khai Cloud Serverless Free (Vercel + Render + Supabase/Neon).

---

### GIAI ĐOẠN 2: RÀ SOÁT TOÀN DIỆN 39 USER STORIES & CÁC CỔNG KIỂM ĐỊNH (QUALITY GATES)
1. **Rà soát 39 User Stories (165 Story Points)**:
   - Đối chiếu từng tiêu chí chấp nhận (AC) từ Sprint 1 đến Sprint 4 theo `de_tai/3. Hệ thống đặt lịch Salon Spa.xlsx`.
   - Đảm bảo toàn bộ nghiệp vụ (chống đặt trùng, tính khung giờ trống `SlotCalculator`, giới hạn 5 dịch vụ/lịch, 3 lịch/SĐT, phân quyền 4 vai trò, xử lý ngày nghỉ lễ, vãng lai, chuyển thợ hàng loạt, hoá đơn, voucher) hoạt động hoàn hảo ở cả 2 chế độ: API thật và Mock Demo.
2. **Chạy toàn bộ Quality Gates bắt buộc**:
   - Backend Unit Tests: `npm run test --prefix backend` (Đạt 100% không lỗi).
   - Backend E2E Tests: `npm run test:e2e --prefix backend` (Đạt 100% trên PostgreSQL).
   - Frontend Demo Tests: `node --test frontend/test/holidays.test.mjs` (Đạt 100%).
   - Linter: `npm run lint --prefix backend` & `npm run lint --prefix frontend` (0 lỗi, 0 cảnh báo, cấm `any`).
   - Frontend Build: `npm run build --prefix frontend` (Build Vite production thành công).

---

### GIAI ĐOẠN 3: HOÀN THIỆN BÁO CÁO THỰC TẬP CHUẨN NGHỊ ĐỊNH 30/2020/NĐ-CP & SLIDE BÁO CÁO
1. **Quy chuẩn Thể thức Nghị định 30/2020/NĐ-CP**:
   - Cập nhật [`docs/tools/build_report_docx.py`](file:///F:/hoc_tap/thuc_tap/du_an/docs/tools/build_report_docx.py) và [`docs/tools/report_data.py`](file:///F:/hoc_tap/thuc_tap/du_an/docs/tools/report_data.py):
     * **Font chữ**: Times New Roman toàn bộ văn bản.
     * **Cỡ chữ**: 13 - 14 pt cho nội dung; Tiêu đề Chương (Cấp 1): 16pt In đậm; Mục (Cấp 2): 14pt In đậm; Tiểu mục (Cấp 3): 13pt In đậm nghiêng.
     * **Định dạng trang A4**: Top 20mm, Bottom 20mm, Left 30mm (đóng gáy), Right 15mm.
     * **Dãn dòng & Dãn đoạn**: Line spacing 1.3 - 1.5 lines; Spacing After 6pt, Spacing Before 0pt. Thụt đầu dòng 1.27 cm.
     * **Bảng biểu & Hình vẽ**: Bảng có *"Bảng X.Y: Tên bảng"* ở TRÊN; Hình có *"Hình X.Y: Tên hình"* ở DƯỚI.
2. **Đồng bộ 100% Nội dung Báo cáo & Slide**:
   - Cập nhật đầy đủ kiến trúc hệ thống thực tế, mô hình CSDL ERD, lược đồ bảng, luồng nghiệp vụ 4 Sprints, các cải tiến hạ tầng (Real-time SSE, Migration, 1-Click Update, Zero-cost Cloud).
   - Chạy lệnh tự động tạo lại file Word và PowerPoint:
     ```powershell
     python docs/tools/build_report_docx.py
     python docs/tools/build_slides_pptx.py
     ```

---

### GIAI ĐOẠN 4: CẬP NHẬT RUNBOOK & ĐỒNG BỘ GIT WORKFLOW
1. Cập nhật [`docs/RUNBOOK-TEST-LAI-QA-04102027.md`](file:///F:/hoc_tap/thuc_tap/du_an/docs/RUNBOOK-TEST-LAI-QA-04102027.md): Hướng dẫn chi tiết cho tester Trương Khánh các bước kiểm thử 1-Click (`run_project.bat`).
2. Commit sạch sẽ, tách bạch theo từng module: `feat(...)`, `fix(...)`, `test(...)`, `docs(...)`.
3. Tác giả commit: `steveprovip <158487753+steveprovip@users.noreply.github.com>`.
4. Merge nhánh sạch vào `develop` và `main`, push toàn bộ lên `origin/develop` và `origin/main`.
</overnight_execution_plan>
