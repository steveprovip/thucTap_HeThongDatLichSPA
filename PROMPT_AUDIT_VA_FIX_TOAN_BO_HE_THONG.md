# MASTER PROMPT: AUDIT & RESOLUTION FOR QA ROUND 05/10/2026
## Target Model: Claude Sonnet 3.7 / 5.5 Extra Cowork (Anthropic Context Engineering)
## Workspace: F:\hoc_tap\thuc_tap\du_an
## Requirements: F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx
## QA Defect Logs: F:\hoc_tap\thuc_tap\du_an\loi_05_10_2026 (Sprint_2_Danh_Sach_Loi_QA.docx & extracted_images/)

---

<role>
Bạn là Kỹ sư Trưởng Hệ thống (Principal Fullstack Architect) kiêm Lead QA Auditor hàng đầu thế giới về NestJS, PostgreSQL 16, React 18 (Vite) và Tailwind CSS.
Nhiệm vụ của bạn là rà soát toàn diện mã nguồn tại `F:\hoc_tap\thuc_tap\du_an`, đối chiếu yêu cầu nghiệp vụ tại `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx`, tự động kiểm tra và xử lý dứt điểm 2 lỗi QA ghi nhận ngày 05/10/2026 tại `F:\hoc_tap\thuc_tap\du_an\loi_05_10_2026\Sprint_2_Danh_Sach_Loi_QA.docx`.
</role>

<context>
- Đường dẫn mã nguồn: `F:\hoc_tap\thuc_tap\du_an`
- Đề bài chuẩn: `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx` (4 Sprints, 39 User Stories, 165 Story Points)
- Nhật ký lỗi QA 05/10/2026: `F:\hoc_tap\thuc_tap\du_an\loi_05_10_2026\Sprint_2_Danh_Sach_Loi_QA.docx` (đã trích xuất 6 ảnh tại `loi_05_10_2026\extracted_images`)
- Nhánh hiện tại: `develop` / `main` (Release `v1.3.5`)
</context>

<investigation_and_fix_tasks>
Hãy trực tiếp đọc mã nguồn và giải quyết triệt để 2 lỗi sau ở CẢ HAI PHÍA (Backend NestJS, Database & Frontend React / Mock Adapter):

### 1. [LỖI 1: ĐỒNG BỘ THỐNG NHẤT CHỈ SỐ KHÁCH HÀNG & LỊCH SỬ DỊCH VỤ]
- **Hiện tượng**: Số lần sử dụng dịch vụ, số lượt hoàn tất và số lượt không đến hiển thị không đồng nhất giữa các màn hình (Danh sách khách hàng `CustomersPage.tsx`, Ngăn kéo chi tiết lịch `AppointmentDrawer.tsx`, và Form khách vãng lai `WalkInPage.tsx`).
- **Nguyên nhân**:
  1. Thiếu sự phân biệt rõ ràng giữa:
     - `totalVisits`: Số lượt đến / hoàn tất dịch vụ (`status = 'completed'`).
     - `noShowCount`: Số lượt không đến (`status = 'no_show'`).
     - `totalAppointments`: Tổng số lịch đã từng đặt (bao gồm cả lịch hẹn sắp tới, đã hủy, v.v.).
  2. Dữ liệu mẫu (seed data) trong `mockBackend.ts` và `seed.sql` có chỉ số `totalVisits` chưa khớp với số bản ghi lịch sử tương ứng của khách.
- **Giải pháp**:
  - Chuẩn hóa nhãn giao diện rõ ràng, thống nhất trên toàn bộ trang:
    * *"Lượt hoàn tất: X"* (hoặc *"Đã đến X lần"*).
    * *"Lượt không đến: Y"*.
    * *"Tổng lịch đã đặt: Z"*.
  - Đảm bảo hàm tính `refreshCounters` ở backend và `customerStats` ở frontend mock đếm chính xác 100% từ bảng `appointments`.

### 2. [LỖI 2: CHẶN ĐẶT LỊCH / TẠO LỊCH TRÊN NGÀY NGHỈ LỄ Ở PHÂN HỆ QUẢN TRỊ & LỄ TÂN]
- **Hiện tượng**: Trang công khai của khách đã chặn ngày nghỉ lễ, nhưng trong giao diện của Chủ tiệm và Lễ tân (Tạo khách vãng lai `WalkInPage.tsx`, Dời lịch hẹn `AppointmentDrawer.tsx`) vẫn chưa chặn hoặc chưa có thông báo rõ ràng khi chọn trúng ngày nghỉ lễ của tiệm.
- **Nguyên nhân**:
  - `WalkInModal` trong `WalkInPage.tsx` khi chọn ngày (`date`) chưa kiểm tra thuộc tính `timeline.salonClosed` và `timeline.closedReason` để cảnh báo và chặn nút lưu.
  - Form dời lịch trong `AppointmentDrawer.tsx` chưa hiển thị banner chặn khi ngày đích rơi vào ngày lễ tiệm đóng cửa.
  - Backend API `POST /appointments/walk-in` và `PATCH /appointments/:id/reschedule` cần đảm bảo trả về lỗi tiếng Việt rõ ràng nếu ngày rơi vào ngày lễ toàn tiệm.
- **Giải pháp**:
  - Tại `WalkInPage.tsx`: Khi `timeline?.salonClosed` = true, hiển thị khung cảnh báo màu vàng/đỏ: *"Tiệm nghỉ trong ngày này ({lý_do_nghỉ_lễ}). Không thể tạo lịch hẹn."* và vô hiệu hóa nút Tạo lịch.
  - Tại `AppointmentDrawer.tsx`: Chặn chọn ngày nghỉ lễ khi dời lịch.
  - Đồng bộ logic kiểm tra ngày lễ vào cả Backend NestJS và `mockBackend.ts`.
</investigation_and_fix_tasks>

<execution_protocol>
1. **BƯỚC 1: SỬA CODE CHÍNH XÁC (SURGICAL FIX)**:
   - Sửa `CustomersPage.tsx`, `AppointmentDrawer.tsx`, `WalkInPage.tsx`.
   - Sửa `mockBackend.ts`, `seed.sql`, `appointments.service.ts`, `customers.service.ts`.
2. **BƯỚC 2: CHẠY BỘ KIỂM ĐỊNH (QUALITY GATES)**:
   - Backend unit tests: `npm --prefix backend run test` (Đạt 100%).
   - Linting: `npm --prefix backend run lint` & `npm --prefix frontend run lint` (0 error, 0 warning, cấm `any`).
   - Frontend build: `npm --prefix frontend run build` (Build Vite thành công).
3. **BƯỚC 3: ĐỒNG BỘ GIT**: Commit toàn bộ bằng tác giả `steveprovip` (tuyệt đối không chèn thẻ Co-Authored-By).
4. **BƯỚC 4: RUNBOOK CHO TRƯƠNG KHÁNH**: Viết các bước 1-Click (`run_project.bat`) để Khánh kiểm chứng cả 2 mục trên.
</execution_protocol>
