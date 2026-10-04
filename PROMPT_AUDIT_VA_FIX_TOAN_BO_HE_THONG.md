# MASTER PROMPT: DEEP AUDIT, ROUND 3 QA BUG FIX & TOTAL SYSTEM RESOLUTION
## Target Model: Claude Sonnet 3.7 / 5.5 Extra Cowork (Anthropic Context Engineering)
## Workspace: F:\hoc_tap\thuc_tap\du_an
## Requirements: F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx
## QA Defect Logs: F:\hoc_tap\thuc_tap\du_an\loi_04102027 (Sprint_2_Danh_Sach_Loi_QA.docx & extracted_images/)

---

<role>
Bạn là Kỹ sư Trưởng Hệ thống kiêm QA Lead Auditor hàng đầu thế giới về NestJS, PostgreSQL 16, React 18, Vite, và State Management (LocalStorage / Context API).
Nhiệm vụ của bạn là rà soát toàn diện từ đầu mã nguồn dự án tại `F:\hoc_tap\thuc_tap\du_an`, đối chiếu yêu cầu nghiệp vụ tại `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx` và giải quyết dứt điểm 7 lỗi QA thực tế mới nhất mà tester Trương Khánh ghi nhận trong `F:\hoc_tap\thuc_tap\du_an\loi_04102027\Sprint_2_Danh_Sach_Loi_QA.docx`.
</role>

<context>
- Đường dẫn mã nguồn: `F:\hoc_tap\thuc_tap\du_an`
- Đề bài chuẩn: `F:\hoc_tap\thuc_tap\du_an\de_tai\3. Hệ thống đặt lịch Salon Spa.xlsx` (4 Sprints, 39 User Stories, 165 Story Points)
- Danh sách lỗi QA mới nhất: `F:\hoc_tap\thuc_tap\du_an\loi_04102027\Sprint_2_Danh_Sach_Loi_QA.docx` (đã trích xuất 15 ảnh minh hoạ tại `loi_04102027\extracted_images`)
- Nhánh hiện tại: `develop` / `main` (Release `v1.3.3`)
</context>

<investigation_and_fix_tasks>
Hãy trực tiếp đọc mã nguồn, kiểm tra bản chất từng lỗi và sửa dứt điểm 7 lỗi sau ở CẢ HAI PHÍA (Backend NestJS, Database & Frontend React / Mock Adapter):

1. **[LỖI 1 - ĐẶT LỊCH CHỌN 2 DỊCH VỤ NHƯNG BÁO ĐÃ CHỌN 5/5]**:
   - *Hiện tượng*: Khách chọn 2 dịch vụ nhưng giao diện báo "Bạn đã chọn tối đa 5 dịch vụ", nút thêm bị khóa không chọn tiếp được.
   - *Nguyên nhân cốt lõi*: `BookingContext.tsx` nạp bản nháp cũ từ `localStorage.getItem('salon.bookingDraft')` chứa các dịch vụ của lần test trước đó (hoặc mảng `selected` không được làm sạch/lọc theo danh sách dịch vụ hợp lệ của danh mục hiện tại).
   - *Giải pháp*: Làm sạch và đồng bộ lại `selected` khi danh mục dịch vụ thay đổi; thêm cơ chế reset/validate bản nháp trong `BookingContext.tsx` để không bị lưu rác 5 dịch vụ cũ.

2. **[LỖI 2 - KHÔNG XỬ LÝ LỊCH HẸN / THÊM KHÁCH VÃNG LAI ĐƯỢC]**:
   - *Hiện tượng*: Lễ tân tạo lịch nhanh tại quầy (`WalkInModal` trong `WalkInPage.tsx`) hoặc thao tác duyệt/chuyển trạng thái lịch hẹn bị lỗi / không bấm được.
   - *Nguyên nhân cốt lõi*: Ràng buộc kiểm tra thợ rảnh `stylistFits()`, giờ bắt đầu ở quá khứ `timeToMinutes(nowRounded())`, hoặc endpoint `/appointments/walk-in` / `/appointments/:id/check-in` trong `mockBackend.ts` và backend bị thiếu quyền/xung đột dữ liệu.
   - *Giải pháp*: Kiểm tra toàn bộ luồng tạo khách vãng lai ở cả backend và mock adapter; đảm bảo form điền đầy đủ dữ liệu là tạo thành công ngay lập tức.

3. **[LỖI 3 - CẢNH BÁO TÁCH 2 LẦN HẸN KHI TỔNG THỜI LƯỢNG VƯỢT CA DÀI NHẤT]**:
   - Kiểm tra logic API `publicApi.quote()` và hàm tính `longestShiftInWeek` ở backend lẫn frontend; đảm bảo chỉ hiện cảnh báo vàng khi tổng phút > ca dài nhất trong 7 ngày tới của thợ đủ kỹ năng.

4. **[LỖI 4 - GIỚI HẠN TỐI ĐA 3 LỊCH HẸN CHƯA HOÀN TẤT / SĐT]**:
   - Đảm bảo từ lần đặt thứ 4 trở đi trên cùng một SĐT, hệ thống từ chối bằng thông báo tiếng Việt: *"Số điện thoại này đang có 3 lịch hẹn chưa hoàn tất, vui lòng hoàn tất hoặc huỷ bớt trước khi đặt thêm"*.

5. **[LỖI 5 - GIỚI HẠN 5 LƯỢT ĐẶT TỪ 1 IP TRONG 1 GIỜ]**:
   - Đảm bảo trả về HTTP 429 Too Many Requests kèm mã `RATE_LIMITED` và `Retry-After`.

6. **[LỖI 6 - TẠM KHÓA TRA CỨU 30 PHÚT SAU 10 LẦN TRA SAI]**:
   - Kiểm tra bộ đếm brute-force tra cứu theo IP; khóa đúng 30 phút (`LOOKUP_LOCKED`).

7. **[LỖI 7 - THỢ CHƯA XẾP CA KHÔNG ĐƯỢC NHẬN LỊCH]**:
   - Tại Bước 3 (chọn thợ), thợ không có ca làm việc trong ngày được chọn TUYỆT ĐỐI không hiển thị ở danh sách thợ rảnh và không nhận lịch tự động.
</investigation_and_fix_tasks>

<execution_protocol>
1. **BƯỚC 1 - RÀ SOÁT MÃ NGUỒN**: Đọc trực tiếp `BookingContext.tsx`, `Step1Services.tsx`, `WalkInPage.tsx`, `mockBackend.ts`, `booking.service.ts` và xác định chính xác dòng code gây lỗi.
2. **BƯỚC 2 - VÁ CODE CHÍNH XÁC (SURGICAL FIX)**: Áp dụng YAGNI & Ponytail (tối giản diff, không sinh code thừa, sửa tận gốc).
3. **BƯỚC 3 - CHẠY BỘ KIỂM ĐỊNH (QUALITY GATES)**:
   - Backend unit tests: `npm --prefix backend run test` (Đạt 100%).
   - Backend & Frontend lint: `npm --prefix backend run lint` & `npm --prefix frontend run lint` (0 error, 0 warning).
   - Frontend build: `npm --prefix frontend run build` (Build Vite thành công).
4. **BƯỚC 4 - ĐỒNG BỘ GIT**: Commit toàn bộ bằng tác giả `steveprovip` (tuyệt đối không chèn thẻ Co-Authored-By).
5. **BƯỚC 5 - RUNBOOK TEST CHO TRƯƠNG KHÁNH**: Viết hướng dẫn ngắn gọn cách chạy 1-Click (`run_project.bat`) và các bước bấm chuột để kiểm chứng cả 7 lỗi.
</execution_protocol>
