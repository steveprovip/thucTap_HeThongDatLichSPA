# Hồ sơ cải tiến Salon Spa

Ngày kiểm định: 2026-10-08 (Asia/Saigon)

**Trạng thái: CHƯA NGHIỆM THU PRODUCTION**

Giữ đề tài gốc gồm 39 user story, 165 point, 4 sprint, một cơ sở. PostgreSQL 15 là đích trong workbook gốc. Chỉ cải tiến độ tin cậy, đóng gói và bằng chứng phát hành. Không thêm đa chi nhánh, kho, AI đặt lịch hay thanh toán ngân hàng thật.

## Đề tài và phạm vi

- `docs/requirements/3. Hệ thống đặt lịch Salon Spa.xlsx`: Hệ thống đặt lịch Salon Spa

## Thay đổi đã thực hiện

### OPS01 Sao lưu đúng đích và giữ TLS

Chặn fallback Docker nếu host/port không khớp endpoint cấu hình; không đưa mật khẩu vào argv; giữ verify-full với kết nối yêu cầu kiểm tra chứng chỉ.

### OPS02 Archive nguyên vẹn và giữ đúng 14 bản

Ghi tệp .partial độc quyền, xác minh magic PGDMP rồi đổi tên; UUID tránh đè cùng giây. Retention chỉ áp dụng cho hash host/port/database, giữ 14 bản theo workbook, bảo toàn archive khác và tệp cũ.

### OPS03 Khôi phục phụ thuộc khi cập nhật lỗi

Launcher luôn npm ci theo lockfile, dừng khi lock lệch, không tự npm install. Khi rollback source sau build lỗi, cài lại phụ thuộc bản cũ trước khi khởi động. Thiếu cache/mạng sẽ báo lỗi và giữ dừng để tránh chạy sai gói.

### OPS04 Profile máy chủ và CI đa nền tảng

Thêm Dockerfile production Node 22/PostgreSQL 15, user không root, volume dữ liệu/upload/backup, không public cổng database, app chỉ loopback. CI bổ sung Windows/macOS/Linux và PostgreSQL 15/16. Chưa chạy CI từ xa.

### DOC01 Đồng bộ bằng chứng phát hành

Thêm scripts/release_evidence.py và 9 ca kiểm thử cho mỗi kho. release.json làm dữ liệu gốc cho STATUS.md và slide phát hành. Checksum phát hiện đổi đề tài, đổi mã, thêm tệp nguồn hoặc sửa artifact khiến bằng chứng cũ không còn khớp. Đây là kiểm tra tính nhất quán, không tự chạy lại test hay chứng nhận sản phẩm an toàn.

## Kiểm chứng ghi nhận

Kết quả là ảnh chụp của lần chạy có ngày và lệnh bên dưới. Kiểm tra checksum không chạy lại các bài test.

- **PASS** `npm run test --prefix backend -- --runInBand`: 177/177 unit test, 13 bộ.
- **PASS** `npm run test:e2e --prefix backend (TEST_DB_PORT=55432; tên riêng *_test)`: 105/105 E2E, 14 bộ, PostgreSQL 15 container cô lập. Có cảnh báo MaxListeners của HTTP server trong test, cần rà vòng đời listener.
- **PASS** `npm run build; npm run lint`: Backend/frontend build và lint đạt.
- **PASS** `npm run test:frontend; npm run test:scripts; npm run check:scripts`: 4/4 frontend; script 21 pass/1 skip; syntax check đạt.
- **PASS** `docker build -f deploy/docker/Dockerfile.production`: Image salon-spa:audit-final-20261008 build đạt.
- **PASS** `python scripts/test_release_evidence.py`: 9/9 test công cụ hồ sơ đạt.
- **PASS** `Docker isolated profile startup and HTTP probes`: {'project': 'salon', 'status': 'PASS', 'scope': 'Fresh disposable Docker project only; no customer data', 'endpoints': {'/': 200, '/health': 200}, 'restore_drill': 'PASS: pg_dump custom archive restored into a separate fresh audit database'}

## Điều kiện còn thiếu trước khi giao khách

- P0: AC bảo mật ở Product Overview B63 yêu cầu log truy cập dữ liệu cá nhân và xóa/ẩn danh theo yêu cầu. Rà soát chưa tìm thấy luồng đáp ứng đầy đủ. Cần thiết kế kiểm soát truy cập, lưu vết, bảo toàn hóa đơn/lịch sử và test trước nghiệm thu.
- P0: Cần SMTP thật, tên miền, TLS thật, thông tin cửa hàng và tài khoản khách hàng thử nghiệm. Cấu hình production mới là ứng viên, chưa public trên máy chủ khách.
- P1: Chạy CI trên Windows/Linux/macOS thật; kiểm tra cài mới đường dẫn tiếng Việt, mất mạng, update lỗi và khôi phục phụ thuộc. Chưa chứng minh macOS bằng máy thật.
- P1: Diễn tập nâng cấp từ dữ liệu phiên bản cũ, restore cả uploads/bí mật/cấu hình cùng DB và đo thời gian phục hồi. Không tự downgrade schema đang có dữ liệu.
- P1: Ghi pass/fail từng AC39 story, nhất là email đúng hạn, màn hình360px, phân quyền và thao tác tại quầy. Rà cảnh báo listener trong E2E.
- P1: Chưa hoàn tất kiểm toán phụ thuộc npm toàn bộ backend Salon; không suy từ lint/test sang kết luận không có lỗ hổng.

## Thay đổi so với nghiệp vụ đề tài

- Không thay đổi quy tắc nghiệp vụ đề tài trong đợt sửa này. Các thiếu sót AC và đề xuất vượt phạm vi được ghi riêng, chưa tự ý coi là hoàn thành.

## Hướng phát triển đề xuất

### Một bản web cho một cơ sở

Giao một URL HTTPS cho khách và nhân viên. Giữ bộ chạy cục bộ cho demo hoặc cơ sở cần máy nội bộ. Dùng cùng lockfile/migration, cấu hình khác nhau theo môi trường. Không mở đa chi nhánh hoặc tự đồng bộ offline vì ngoài đề tài.

### Cập nhật theo bản phát hành có thể quay lại

Build image trước khi chạm dịch vụ, ghi digest và revision, backup xác minh và rehearsal restore, áp migration trên staging có dữ liệu mô phỏng cũ, rồi kiểm tra đặt lịch và thu tiền. Chỉ rollback app khi schema tương thích. Hiện launcher cải thiện rollback gói; quy trình image/digest đầy đủ là phần tiếp theo.

### Nghiệm thu theo vòng đời lịch thật

Chạy đúng chuỗi đặt, xác nhận, nhắc, check-in, hoàn tất, tính tiền, đánh giá. Thu thập lỗi và thời gian xử lý ở một cơ sở thử trước khi mở rộng. Giữ các giới hạn15phút/60phút/chống trùng/giới hạnIP và SĐT trong workbook.

## Đối chiếu yêu cầu

Ánh xạ đến mã nguồn không đồng nghĩa tất cả tiêu chí nghiệm thu đã được kiểm thử.

- **S1-01** Là Quản trị hệ thống, tôi muốn đăng nhập bằng email và mật khẩu rồi được cấp phiên làm việc, để chỉ người của tiệm mới chạm được vào dữ liệu lịch hẹn và doanh thu.. Nguồn: 4. Product Backlog!A7. Bằng chứng: **S1-01** | 5 | Đăng nhập, khoá 15 phút sau 5 lần sai, JWT 30m/7d | `be/modules/auth/auth.service.ts` (`login`, `issueTokens`, `refresh`) | `fe/pages/auth/LoginPage.tsx`, `fe/api/client.ts` (tự làm mới token). Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-02** Là Quản trị hệ thống, tôi muốn tạo, sửa và ngưng hoạt động tài khoản nhân sự của tiệm, để thợ mới vào làm có tài khoản trong ngày và thợ nghỉ việc mất quyền truy cập ngay.. Nguồn: 4. Product Backlog!A8. Bằng chứng: **S1-02** | 5 | Tạo / sửa / ngưng hoạt động tài khoản, mật khẩu tạm qua email, chặn ngưng admin cuối cùng | `be/modules/users/users.service.ts` | `fe/pages/admin/UsersPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-03** Là Quản trị hệ thống, tôi muốn gán vai trò cho từng tài khoản và để hệ thống chặn theo vai trò ở cả menu lẫn API, để thợ không xem được doanh thu của tiệm và lễ tân không sửa được bảng giá.. Nguồn: 4. Product Backlog!A9. Bằng chứng: **S1-03** | 5 | 4 vai trò nhân sự và khách công khai, menu theo quyền, API trả 403 | `be/common/guards/roles.guard.ts`, `be/common/constants/roles.constant.ts` | `fe/layouts/AdminLayout.tsx`, `fe/pages/admin/PermissionMatrixPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-04** Là Lễ tân, tôi muốn tự đổi mật khẩu và khôi phục khi quên, để không phải nhờ người khác mỗi lần bị khoá ngoài vào giờ đông khách.. Nguồn: 4. Product Backlog!A10. Bằng chứng: **S1-04** | 3 | Đổi mật khẩu, quên mật khẩu, liên kết 30 phút dùng một lần, giới hạn 3 lần/giờ | `be/modules/auth/auth.service.ts` (`changePassword`, `forgotPassword`, `resetPassword`) | `fe/pages/auth/ChangePasswordPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-05** Là Chủ tiệm, tôi muốn khai báo từng dịch vụ kèm thời lượng chuẩn và giá, để hệ thống có cơ sở tính khung giờ trống thay vì lễ tân nhẩm trong đầu.. Nguồn: 4. Product Backlog!A11. Bằng chứng: **S1-05** | 5 | Dịch vụ: thời lượng bội số 15 (15–240), giá ≤ 20.000.000 đ, không xoá khi đã có lịch hẹn | `be/modules/services/services.service.ts`, CHECK constraint trong `schema.sql` | `fe/pages/admin/ServicesPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-06** Là Chủ tiệm, tôi muốn gom dịch vụ thành các nhóm như tóc, gội dưỡng, chăm sóc da, để khách mở trang đặt lịch không phải cuộn qua một danh sách dài bốn mươi dòng.. Nguồn: 4. Product Backlog!A12. Bằng chứng: **S1-06** | 3 | Nhóm dịch vụ, thứ tự hiển thị, chặn xoá nhóm còn dịch vụ | `be/modules/services/services.service.ts` (`removeCategory`) | `fe/pages/admin/ServicesPage.tsx` (hộp thoại nhóm). Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-07** Là Chủ tiệm, tôi muốn lập hồ sơ từng thợ và đánh dấu thợ đó làm được những dịch vụ nào, để khách không đặt nhầm thợ chỉ biết cắt cho một ca nhuộm.. Nguồn: 4. Product Backlog!A13. Bằng chứng: **S1-07** | 5 | Hồ sơ thợ, ảnh ≤ 2MB JPG/PNG, kỹ năng nhiều-nhiều, cảnh báo dịch vụ chưa có thợ | `be/modules/stylists/stylists.service.ts`, `stylists.controller.ts` (`uploadAvatar`) | `fe/pages/admin/StylistsPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-08** Là Chủ tiệm, tôi muốn khai báo giờ mở cửa của tiệm theo từng thứ trong tuần, để khung giờ đề xuất cho khách không rơi ra ngoài giờ làm việc.. Nguồn: 4. Product Backlog!A14. Bằng chứng: **S1-08** | 3 | Giờ mở cửa theo thứ, chênh tối thiểu 60 phút, múi giờ Asia/Ho_Chi_Minh | `be/modules/working-hours/working-hours.service.ts`, CHECK `swh_min_60m` | `fe/pages/admin/WorkingHoursPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-09** Là Quản trị hệ thống, tôi muốn xem nhật ký các thao tác thay đổi dữ liệu quan trọng, để khi một lịch hẹn biến mất còn lần ra ai đã sửa lúc nào.. Nguồn: 4. Product Backlog!A15. Bằng chứng: **S1-09** | 3 | Nhật ký hoạt động chỉ đọc, lọc theo ngày và tài khoản, 50 dòng/trang | `be/modules/audit/*`, `be/common/interceptors/audit-log.interceptor.ts`, trigger `audit_logs_readonly` trong `schema.sql` | `fe/pages/admin/AuditLogsPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S1-10** Là Quản trị hệ thống, tôi muốn có môi trường staging kèm bộ dữ liệu mẫu của một tiệm, để mọi sprint sau đều demo trên dữ liệu giống thật thay vì bảng trống.. Nguồn: 4. Product Backlog!A16. Bằng chứng: **S1-10** | 3 | Môi trường staging một lệnh + dữ liệu mẫu chạy lại không nhân đôi | `scripts\windows\run_project.bat`, `docker-compose.yml`, `backend/database/seed.sql`, `be/database/run-seed.ts` | — (tài liệu `docs/STAGING.md`). Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-01** Là Chủ tiệm, tôi muốn xếp ca làm theo tuần cho từng thợ và sao chép sang tuần kế tiếp, để không phải nhập lại bảng ca giống nhau mỗi thứ hai đầu tuần.. Nguồn: 4. Product Backlog!A19. Bằng chứng: **S2-01** | 8 | Ca theo tuần, nhiều ca/ngày, nghỉ giữa ca, chống chồng lấn, sao chép tuần, chặn xoá ca có lịch | `be/modules/stylists/stylists.service.ts` (`createShifts`, `copyWeek`, `removeShift`), EXCLUDE `stylist_shifts_no_overlap` | `fe/pages/admin/ShiftsPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-02** Là Chủ tiệm, tôi muốn khai báo ngày nghỉ của tiệm và ngày nghỉ riêng của từng thợ, để hệ thống không nhận lịch vào mùng một Tết hay ngày thợ xin nghỉ trước.. Nguồn: 4. Product Backlog!A20. Bằng chứng: **S2-02** | 3 | Ngày nghỉ tiệm theo khoảng ngày và nghỉ riêng của thợ, cảnh báo lịch bị ảnh hưởng | `be/modules/working-hours/working-hours.service.ts` (`createHoliday`), `be/modules/stylists/stylists.service.ts` (`createTimeOff`) | `fe/pages/admin/WorkingHoursPage.tsx`, `ShiftsPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-03** Là Khách hàng, tôi muốn xem trang công khai liệt kê dịch vụ theo nhóm kèm thời lượng và giá, để biết trước mình mất bao lâu và tốn bao nhiêu trước khi quyết định đặt.. Nguồn: 4. Product Backlog!A21. Bằng chứng: **S2-03** | 5 | Danh mục công khai theo nhóm, chỉ hiện dịch vụ có thợ, tìm kiếm không dấu, 360px | `be/modules/booking-engine/availability.service.ts` (`publicCatalog`) | `fe/pages/public/HomePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-04** Là Khách hàng, tôi muốn chọn nhiều dịch vụ trong một lượt đặt và thấy tổng thời lượng cùng tổng tiền tạm tính, để biết mình cần dành ra bao nhiêu thời gian cho buổi đó.. Nguồn: 4. Product Backlog!A22. Bằng chứng: **S2-04** | 3 | Chọn tối đa 5 dịch vụ, cộng dồn thời lượng và tiền tạm tính, cảnh báo vượt ca dài nhất | `public-booking.controller.ts` (`quote`), `slot-calculator.ts` (`sumDuration`, `longestShiftLength`) | `fe/contexts/BookingContext.tsx`, `steps/Step1Services.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-05** Là Khách hàng, tôi muốn chọn ngày rồi thấy đúng những khung giờ còn đủ chỗ cho các dịch vụ mình chọn, để không phải gọi điện hỏi lễ tân xem mấy giờ còn trống.. Nguồn: 4. Product Backlog!A23. Bằng chứng: **S2-05** | 8 | Bộ tính khung giờ trống 15 phút, gợi ý 2 ngày gần nhất còn chỗ, chặn quá khứ và dưới 60 phút | `be/modules/booking-engine/slot-calculator.ts` + `availability.service.ts` | `fe/pages/public/steps/Step2Slot.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-06** Là Khách hàng, tôi muốn chọn đích danh thợ quen hoặc để hệ thống tự phân thợ bất kỳ, để vẫn đặt được lịch khi thợ quen đã kín chỗ.. Nguồn: 4. Product Backlog!A24. Bằng chứng: **S2-06** | 3 | Chọn đích danh thợ hoặc thợ bất kỳ, ưu tiên thợ ít lịch nhất | `availability.service.ts` (`pickAutoStylist`, `capableStylists`) | `fe/pages/public/steps/Step3Stylist.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-07** Là Khách hàng, tôi muốn điền tên và số điện thoại rồi chốt lịch mà không cần tạo tài khoản, để đặt xong trong vòng một phút ngay trên điện thoại.. Nguồn: 4. Product Backlog!A25. Bằng chứng: **S2-07** | 5 | Chốt lịch không cần tài khoản, mã 8 ký tự, tối đa 3 lịch/SĐT, 5 lượt/IP/giờ | `be/modules/booking-engine/booking.service.ts` (`createBooking`), `be/modules/rate-limit/*` | `fe/pages/public/steps/Step4Confirm.tsx`, `BookingSuccess.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-08** Là Chủ tiệm, tôi muốn hệ thống từ chối lịch thứ hai khi hai khách bấm chốt cùng một khung giờ của một thợ, để tiệm không rơi vào cảnh hai người cùng đến vào mười giờ sáng.. Nguồn: 4. Product Backlog!A26. Bằng chứng: **S2-08** | 5 | Chống đặt trùng: SERIALIZABLE + FOR UPDATE + EXCLUDE, test 20 request đồng thời | `booking.service.ts` (`persistBooking`), `schema.sql` (`appointments_no_overlap`) | Thông báo và nạp lại khung giờ trong `BookingWizard.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S2-09** Là Khách hàng, tôi muốn tra cứu lịch hẹn bằng mã tra cứu hoặc số điện thoại, để kiểm tra lại giờ hẹn mà không phải gọi vào tiệm giờ đông khách.. Nguồn: 4. Product Backlog!A27. Bằng chứng: **S2-09** | 2 | Tra cứu bằng mã hoặc SĐT, chặn 30 phút sau 10 lần sai/IP/giờ | `booking.service.ts` (`lookup`), `rate-limit.service.ts` | `fe/pages/public/LookupPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-01** Là Lễ tân, tôi muốn xem lịch của cả ngày dưới dạng cột theo từng thợ, để nhìn một lần là biết ai đang bận tới mấy giờ thay vì lật sổ.. Nguồn: 4. Product Backlog!A30. Bằng chứng: **S3-01** | 8 | Lịch ngày dạng cột theo thợ, trục 15 phút, vùng ngoài ca tô khác màu | `be/modules/booking-engine/appointments.service.ts` (`dayTimeline`) | `fe/pages/reception/DayTimelinePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-02** Là Lễ tân, tôi muốn xác nhận hoặc từ chối các lịch khách đặt online, để tiệm chủ động kiểm soát những lịch đặt sát giờ hoặc trùng đợt cao điểm.. Nguồn: 4. Product Backlog!A31. Bằng chứng: **S3-02** | 3 | Xác nhận / từ chối lịch online, lý do bắt buộc, đánh dấu quá hạn 12 giờ | `appointments.service.ts` (`confirm`, `reject`) | `fe/pages/reception/PendingPage.tsx`, `AppointmentDrawer.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-03** Là Lễ tân, tôi muốn check-in khách khi họ bước vào tiệm và giao cho thợ phụ trách, để thợ biết khách của mình đã tới mà không cần gọi với qua phòng.. Nguồn: 4. Product Backlog!A32. Bằng chứng: **S3-03** | 3 | Check-in trong cửa sổ ±60 phút, đánh dấu muộn > 15 phút, báo thợ | `appointments.service.ts` (`checkIn`) | `AppointmentDrawer.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-04** Là Lễ tân, tôi muốn đổi thợ hoặc dời giờ một lịch hẹn ngay trên màn hình lịch ngày, để xử lý tại chỗ khi khách đến trễ hoặc thợ đang làm quá giờ.. Nguồn: 4. Product Backlog!A33. Bằng chứng: **S3-04** | 5 | Đổi thợ / dời giờ, kiểm tra kỹ năng và khoảng trống, ghi lịch sử, gửi email | `appointments.service.ts` (`reschedule`) | `AppointmentDrawer.tsx` → `RescheduleModal`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-05** Là Khách hàng, tôi muốn tự huỷ lịch bằng mã tra cứu khi có việc đột xuất, để tiệm kịp nhận khách khác vào khung giờ đó.. Nguồn: 4. Product Backlog!A34. Bằng chứng: **S3-05** | 2 | Khách tự huỷ khi còn ≥ 120 phút, giải phóng khung giờ ngay | `booking.service.ts` (`cancelByCode`) | `fe/pages/public/LookupPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-06** Là Lễ tân, tôi muốn đánh dấu khách không đến sau khi đã chờ đủ lâu, để tiệm có số liệu thật về tỉ lệ bỏ hẹn thay vì cảm giác là dạo này nhiều.. Nguồn: 4. Product Backlog!A35. Bằng chứng: **S3-06** | 3 | Đánh dấu không đến sau 30 phút, cộng dồn vào hồ sơ, hoàn tác trong 15 phút | `appointments.service.ts` (`markNoShow`, `undoNoShow`) | `AppointmentDrawer.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-07** Là Lễ tân, tôi muốn nhập lịch cho khách vãng lai gọi điện hoặc đi ngang qua tiệm, để mọi lượt khách đều nằm trong hệ thống chứ không rẽ nhánh ra sổ tay.. Nguồn: 4. Product Backlog!A36. Bằng chứng: **S3-07** | 5 | Khách vãng lai tại quầy, tự điền theo SĐT, bỏ qua ràng buộc 60 phút | `appointments.controller.ts` (`walkIn`), `customers.service.ts` (`findOrCreateByPhone`) | `fe/pages/reception/WalkInPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-08** Là Thợ, tôi muốn mở lịch của riêng mình theo ngày và bấm bắt đầu, hoàn tất cho từng lượt khách, để lễ tân biết lúc nào tôi rảnh nhận khách tiếp theo.. Nguồn: 4. Product Backlog!A37. Bằng chứng: **S3-08** | 5 | Thợ xem lịch riêng, bắt đầu / hoàn tất, SĐT che, cảnh báo vượt 20 phút | `appointments.service.ts` (`myDay`, `start`, `complete`), `common/utils/phone.util.ts` | `fe/pages/stylist/MySchedulePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-09** Là Lễ tân, tôi muốn chuyển hàng loạt lịch của một thợ báo nghỉ đột xuất sang thợ khác, để không phải mở từng lịch hẹn rồi gọi lần lượt từng khách.. Nguồn: 4. Product Backlog!A38. Bằng chứng: **S3-09** | 5 | Chuyển hàng loạt khi thợ nghỉ, gợi ý thợ thay thế / dời giờ, lỗi một lịch không hỏng lô | `appointments.service.ts` (`bulkReassignSuggestions`, `bulkReassign`) | `fe/pages/reception/BulkReassignPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S3-10** Là Lễ tân, tôi muốn hệ thống gộp các lần đến của cùng một số điện thoại thành một hồ sơ khách, để nhận ra khách quen ngay khi họ gọi đặt lịch.. Nguồn: 4. Product Backlog!A39. Bằng chứng: **S3-10** | 3 | Gộp hồ sơ theo SĐT, cảnh báo tên khác, tìm kiếm nhanh | `be/modules/customers/customers.service.ts` | `fe/pages/reception/CustomersPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-01** Là Lễ tân, tôi muốn lập phiếu tính tiền khi khách làm xong rồi đóng lịch hẹn, để số tiền thu được gắn thẳng vào lượt dịch vụ và thợ đã làm.. Nguồn: 4. Product Backlog!A42. Bằng chứng: **S4-01** | 8 | Phiếu tính tiền, dịch vụ phát sinh, tiền mặt/chuyển khoản, đóng phiếu, phiếu điều chỉnh | `be/modules/invoices/invoices.service.ts` | `fe/pages/reception/InvoicePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-02** Là Chủ tiệm, tôi muốn áp một mã giảm giá đơn giản lên phiếu tính tiền, để chạy được các đợt ưu đãi ngày thường mà vẫn ghi nhận đúng doanh thu thực thu.. Nguồn: 4. Product Backlog!A43. Bằng chứng: **S4-02** | 2 | Mã giảm giá phần trăm hoặc số tiền, một mã/phiếu, lưu đủ ba con số | `invoices.service.ts` (`resolveVoucher`) | `fe/pages/admin/VouchersPage.tsx`, `InvoicePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-03** Là Thợ, tôi muốn xem lịch sử dịch vụ của khách đang ngồi trên ghế, để biết lần trước khách nhuộm màu gì và ai đã làm mà không phải hỏi lại từ đầu.. Nguồn: 4. Product Backlog!A44. Bằng chứng: **S4-03** | 5 | Lịch sử 10 lượt gần nhất + ghi chú kỹ thuật 500 ký tự, chỉ nội bộ xem | `customers.service.ts` (`visitHistory`, `upsertServiceNote`) | `fe/pages/stylist/MySchedulePage.tsx`, `CustomersPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-04** Là Khách hàng, tôi muốn chấm điểm và góp ý sau khi làm xong, để tiệm biết thợ nào làm khách hài lòng thay vì chỉ nghe phản hồi lúc khách bực.. Nguồn: 4. Product Backlog!A45. Bằng chứng: **S4-04** | 5 | Đánh giá 1–5 sao qua liên kết dùng một lần trong 7 ngày, điểm TB cần ≥ 5 lượt | `be/modules/reviews/reviews.service.ts` | `fe/pages/public/ReviewPage.tsx`, `fe/pages/owner/RevenuePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-05** Là Khách hàng, tôi muốn nhận email xác nhận khi đặt xong và email nhắc trước giờ hẹn, để không quên mất buổi hẹn đã đặt từ tuần trước.. Nguồn: 4. Product Backlog!A46. Bằng chứng: **S4-05** | 5 | Email xác nhận ≤ 2 phút, nhắc trước 24 giờ, thử lại 3 lần cách 10 phút | `be/modules/notifications/mail.service.ts`, `email-queue.service.ts`, `booking.service.ts` (`scheduleReminder`) | — (xem ở Maildev). Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-06** Là Thợ, tôi muốn nhận thông báo trong ứng dụng khi lịch của mình thay đổi, để không bị bất ngờ vì một khách bị chuyển sang cho mình lúc đang làm dở.. Nguồn: 4. Product Backlog!A47. Bằng chứng: **S4-06** | 3 | Thông báo trong ứng dụng, chuông đếm chưa đọc, dọn sau 30 ngày | `be/modules/notifications/notifications.service.ts` | `fe/components/NotificationBell.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-07** Là Chủ tiệm, tôi muốn xem doanh thu theo thợ và theo dịch vụ trong một khoảng ngày tự chọn, để cuối tháng không phải ngồi cộng tay tập hoá đơn giấy.. Nguồn: 4. Product Backlog!A48. Bằng chứng: **S4-07** | 5 | Doanh thu theo thợ và theo dịch vụ, tối đa 365 ngày, xuất CSV UTF-8 | `be/modules/analytics/analytics.service.ts` | `fe/pages/owner/RevenuePage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-08** Là Chủ tiệm, tôi muốn mở một trang tổng quan của ngày hôm nay, để buổi sáng liếc một lần là biết hôm nay tiệm bận tới mức nào.. Nguồn: 4. Product Backlog!A49. Bằng chứng: **S4-08** | 3 | Tổng quan hôm nay, tự làm mới 60 giây, bấm trạng thái mở danh sách | `analytics.service.ts` (`todayDashboard`) | `fe/pages/owner/DashboardPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-09** Là Chủ tiệm, tôi muốn xem tỉ lệ khách không đến và phân bố lượt hẹn theo khung giờ, để quyết định xếp thêm thợ vào cuối tuần dựa trên số liệu.. Nguồn: 4. Product Backlog!A50. Bằng chứng: **S4-09** | 2 | Tỉ lệ không đến / huỷ một chữ số thập phân, phân bố khung giờ ngày thường vs cuối tuần | `analytics.service.ts` (`noShowStats`, `slotDensity`) | `fe/pages/owner/SlotDensityPage.tsx`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.
- **S4-10** Là Quản trị hệ thống, tôi muốn rà soát lại toàn bộ phân quyền và dựng bản staging ổn định trước buổi nghiệm thu, để buổi demo không dừng giữa chừng vì một lỗi 403 hay dữ liệu rỗng.. Nguồn: 4. Product Backlog!A51. Bằng chứng: **S4-10** | 3 | Rà soát phân quyền bằng kiểm thử tự động + kịch bản demo | `backend/test/auth-rbac.e2e-spec.ts` | `docs/DEMO-SCRIPT.md`. Trạng thái: Đã ánh xạ; kiểm tra AC theo workbook và kịch bản nghiệm thu.

## Nguồn nghiên cứu

- [Docker Compose cho production](https://docs.docker.com/compose/how-tos/production/): Tách cấu hình production, giữ mã trong image, cấu hình restart và cổng theo môi trường.
- [Docker Compose và readiness](https://docs.docker.com/compose/how-tos/startup-order/): Phân biệt container đã chạy với dịch vụ sẵn sàng; dùng healthcheck và dependency đúng trạng thái.
- [PostgreSQL sao lưu và phục hồi](https://www.postgresql.org/docs/16/backup-dump.html): Dùng archive pg_dump và pg_restore; nghiệm thu bằng phục hồi vào database thử, lưu riêng cấu hình vai trò nếu cần.
- [PostgreSQL xác minh TLS](https://www.postgresql.org/docs/16/libpq-ssl.html): Giữ chính sách xác minh chứng chỉ và hostname khi dùng database qua mạng.
- [OWASP ASVS](https://owasp.org/projects/asvs): Chọn yêu cầu xác thực, phân quyền, bí mật và log phù hợp để kiểm tra. Chưa tuyên bố chứng nhận ASVS.
- [SLSA provenance](https://slsa.dev/spec/v1.2/provenance): Hướng phát hành tiếp theo lưu nguồn build và digest image. Checksum tài liệu hiện tại chưa phải đạt cấp SLSA.
- [Diataxis](https://diataxis.fr/): Phân loại tài liệu thành hướng dẫn bắt đầu, cách thao tác, tham chiếu và giải thích. Đây là quy ước đề xuất, không phải tiêu chuẩn bắt buộc về tên thư mục.
- [Semantic Versioning](https://semver.org/): Gắn phiên bản theo hợp đồng API, ghi thay đổi và giữ bất biến nội dung bản đã phát hành.
- [GitHub Actions OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers): Khi có đích triển khai, dùng xác thực ngắn hạn và giới hạn môi trường thay vì lưu khóa máy chủ dài hạn.

## Quản lý phiên bản tài liệu

`release.json` là dữ liệu gốc của hồ sơ phát hành này. `STATUS.md` và slide phát hành được tạo từ dữ liệu đó. Tài liệu học phần cũ là bằng chứng lịch sử, không phải xác nhận vận hành bản hiện tại.

Chạy `python scripts/release_evidence.py` sau khi sửa mã hoặc tài liệu. Khi checksum thay đổi, chạy lại kiểm thử liên quan, cập nhật dữ liệu và tạo lại cả báo cáo lẫn slide. Không cập nhật checksum đơn thuần để hợp thức hóa kết quả cũ.
