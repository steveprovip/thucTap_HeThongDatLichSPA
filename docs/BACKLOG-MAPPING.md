# Đối chiếu 39 user story với mã nguồn

Bảng này dùng cho buổi nghiệm thu: mỗi story chỉ rõ tệp cài đặt chính ở backend và màn hình
tương ứng ở frontend, để người review mở thẳng đúng chỗ.

Ký hiệu đường dẫn: `be/` = `backend/src/`, `fe/` = `frontend/src/`.

## EP-01 — Tài khoản và phân quyền (27 point · 7 story)

| Story | Point | Nội dung | Backend | Frontend |
|---|---|---|---|---|
| **S1-01** | 5 | Đăng nhập, khoá 15 phút sau 5 lần sai, JWT 30m/7d | `be/modules/auth/auth.service.ts` (`login`, `issueTokens`, `refresh`) | `fe/pages/auth/LoginPage.tsx`, `fe/api/client.ts` (tự làm mới token) |
| **S1-02** | 5 | Tạo / sửa / ngưng hoạt động tài khoản, mật khẩu tạm qua email, chặn ngưng admin cuối cùng | `be/modules/users/users.service.ts` | `fe/pages/admin/UsersPage.tsx` |
| **S1-03** | 5 | 4 vai trò nhân sự và khách công khai, menu theo quyền, API trả 403 | `be/common/guards/roles.guard.ts`, `be/common/constants/roles.constant.ts` | `fe/layouts/AdminLayout.tsx`, `fe/pages/admin/PermissionMatrixPage.tsx` |
| **S1-04** | 3 | Đổi mật khẩu, quên mật khẩu, liên kết 30 phút dùng một lần, giới hạn 3 lần/giờ | `be/modules/auth/auth.service.ts` (`changePassword`, `forgotPassword`, `resetPassword`) | `fe/pages/auth/ChangePasswordPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` |
| **S1-09** | 3 | Nhật ký hoạt động chỉ đọc, lọc theo ngày và tài khoản, 50 dòng/trang | `be/modules/audit/*`, `be/common/interceptors/audit-log.interceptor.ts`, trigger `audit_logs_readonly` trong `schema.sql` | `fe/pages/admin/AuditLogsPage.tsx` |
| **S1-10** | 3 | Môi trường staging một lệnh + dữ liệu mẫu chạy lại không nhân đôi | `run_project.bat`, `docker-compose.yml`, `database/seed.sql`, `be/database/run-seed.ts` | — (tài liệu `docs/STAGING.md`) |
| **S4-10** | 3 | Rà soát phân quyền bằng kiểm thử tự động + kịch bản demo | `backend/test/auth-rbac.e2e-spec.ts` | `docs/DEMO-SCRIPT.md` |

## EP-02 — Dịch vụ, thợ và lịch làm việc (27 point · 6 story)

| Story | Point | Nội dung | Backend | Frontend |
|---|---|---|---|---|
| **S1-05** | 5 | Dịch vụ: thời lượng bội số 15 (15–240), giá ≤ 20.000.000 đ, không xoá khi đã có lịch hẹn | `be/modules/services/services.service.ts`, CHECK constraint trong `schema.sql` | `fe/pages/admin/ServicesPage.tsx` |
| **S1-06** | 3 | Nhóm dịch vụ, thứ tự hiển thị, chặn xoá nhóm còn dịch vụ | `be/modules/services/services.service.ts` (`removeCategory`) | `fe/pages/admin/ServicesPage.tsx` (hộp thoại nhóm) |
| **S1-07** | 5 | Hồ sơ thợ, ảnh ≤ 2MB JPG/PNG, kỹ năng nhiều-nhiều, cảnh báo dịch vụ chưa có thợ | `be/modules/stylists/stylists.service.ts`, `stylists.controller.ts` (`uploadAvatar`) | `fe/pages/admin/StylistsPage.tsx` |
| **S1-08** | 3 | Giờ mở cửa theo thứ, chênh tối thiểu 60 phút, múi giờ Asia/Ho_Chi_Minh | `be/modules/working-hours/working-hours.service.ts`, CHECK `swh_min_60m` | `fe/pages/admin/WorkingHoursPage.tsx` |
| **S2-01** | 8 | Ca theo tuần, nhiều ca/ngày, nghỉ giữa ca, chống chồng lấn, sao chép tuần, chặn xoá ca có lịch | `be/modules/stylists/stylists.service.ts` (`createShifts`, `copyWeek`, `removeShift`), EXCLUDE `stylist_shifts_no_overlap` | `fe/pages/admin/ShiftsPage.tsx` |
| **S2-02** | 3 | Ngày nghỉ tiệm theo khoảng ngày và nghỉ riêng của thợ, cảnh báo lịch bị ảnh hưởng | `be/modules/working-hours/working-hours.service.ts` (`createHoliday`), `be/modules/stylists/stylists.service.ts` (`createTimeOff`) | `fe/pages/admin/WorkingHoursPage.tsx`, `ShiftsPage.tsx` |

## EP-03 — Đặt lịch công khai và tính khung giờ trống (31 point · 7 story)

| Story | Point | Nội dung | Backend | Frontend |
|---|---|---|---|---|
| **S2-03** | 5 | Danh mục công khai theo nhóm, chỉ hiện dịch vụ có thợ, tìm kiếm không dấu, 360px | `be/modules/booking-engine/availability.service.ts` (`publicCatalog`) | `fe/pages/public/HomePage.tsx` |
| **S2-04** | 3 | Chọn tối đa 5 dịch vụ, cộng dồn thời lượng và tiền tạm tính, cảnh báo vượt ca dài nhất | `public-booking.controller.ts` (`quote`), `slot-calculator.ts` (`sumDuration`, `longestShiftLength`) | `fe/contexts/BookingContext.tsx`, `steps/Step1Services.tsx` |
| **S2-05** | 8 | Bộ tính khung giờ trống 15 phút, gợi ý 2 ngày gần nhất còn chỗ, chặn quá khứ và dưới 60 phút | `be/modules/booking-engine/slot-calculator.ts` + `availability.service.ts` | `fe/pages/public/steps/Step2Slot.tsx` |
| **S2-06** | 3 | Chọn đích danh thợ hoặc thợ bất kỳ, ưu tiên thợ ít lịch nhất | `availability.service.ts` (`pickAutoStylist`, `capableStylists`) | `fe/pages/public/steps/Step3Stylist.tsx` |
| **S2-07** | 5 | Chốt lịch không cần tài khoản, mã 8 ký tự, tối đa 3 lịch/SĐT, 5 lượt/IP/giờ | `be/modules/booking-engine/booking.service.ts` (`createBooking`), `be/modules/rate-limit/*` | `fe/pages/public/steps/Step4Confirm.tsx`, `BookingSuccess.tsx` |
| **S2-08** | 5 | Chống đặt trùng: SERIALIZABLE + FOR UPDATE + EXCLUDE, test 20 request đồng thời | `booking.service.ts` (`persistBooking`), `schema.sql` (`appointments_no_overlap`) | Thông báo và nạp lại khung giờ trong `BookingWizard.tsx` |
| **S2-09** | 2 | Tra cứu bằng mã hoặc SĐT, chặn 30 phút sau 10 lần sai/IP/giờ | `booking.service.ts` (`lookup`), `rate-limit.service.ts` | `fe/pages/public/LookupPage.tsx` |

## EP-04 — Vận hành lịch hẹn hằng ngày (39 point · 9 story)

| Story | Point | Nội dung | Backend | Frontend |
|---|---|---|---|---|
| **S3-01** | 8 | Lịch ngày dạng cột theo thợ, trục 15 phút, vùng ngoài ca tô khác màu | `be/modules/booking-engine/appointments.service.ts` (`dayTimeline`) | `fe/pages/reception/DayTimelinePage.tsx` |
| **S3-02** | 3 | Xác nhận / từ chối lịch online, lý do bắt buộc, đánh dấu quá hạn 12 giờ | `appointments.service.ts` (`confirm`, `reject`) | `fe/pages/reception/PendingPage.tsx`, `AppointmentDrawer.tsx` |
| **S3-03** | 3 | Check-in trong cửa sổ ±60 phút, đánh dấu muộn > 15 phút, báo thợ | `appointments.service.ts` (`checkIn`) | `AppointmentDrawer.tsx` |
| **S3-04** | 5 | Đổi thợ / dời giờ, kiểm tra kỹ năng và khoảng trống, ghi lịch sử, gửi email | `appointments.service.ts` (`reschedule`) | `AppointmentDrawer.tsx` → `RescheduleModal` |
| **S3-05** | 2 | Khách tự huỷ khi còn ≥ 120 phút, giải phóng khung giờ ngay | `booking.service.ts` (`cancelByCode`) | `fe/pages/public/LookupPage.tsx` |
| **S3-06** | 3 | Đánh dấu không đến sau 30 phút, cộng dồn vào hồ sơ, hoàn tác trong 15 phút | `appointments.service.ts` (`markNoShow`, `undoNoShow`) | `AppointmentDrawer.tsx` |
| **S3-07** | 5 | Khách vãng lai tại quầy, tự điền theo SĐT, bỏ qua ràng buộc 60 phút | `appointments.controller.ts` (`walkIn`), `customers.service.ts` (`findOrCreateByPhone`) | `fe/pages/reception/WalkInPage.tsx` |
| **S3-08** | 5 | Thợ xem lịch riêng, bắt đầu / hoàn tất, SĐT che, cảnh báo vượt 20 phút | `appointments.service.ts` (`myDay`, `start`, `complete`), `common/utils/phone.util.ts` | `fe/pages/stylist/MySchedulePage.tsx` |
| **S3-09** | 5 | Chuyển hàng loạt khi thợ nghỉ, gợi ý thợ thay thế / dời giờ, lỗi một lịch không hỏng lô | `appointments.service.ts` (`bulkReassignSuggestions`, `bulkReassign`) | `fe/pages/reception/BulkReassignPage.tsx` |

## EP-05 — Thanh toán và hồ sơ khách hàng (23 point · 5 story)

| Story | Point | Nội dung | Backend | Frontend |
|---|---|---|---|---|
| **S3-10** | 3 | Gộp hồ sơ theo SĐT, cảnh báo tên khác, tìm kiếm nhanh | `be/modules/customers/customers.service.ts` | `fe/pages/reception/CustomersPage.tsx` |
| **S4-01** | 8 | Phiếu tính tiền, dịch vụ phát sinh, tiền mặt/chuyển khoản, đóng phiếu, phiếu điều chỉnh | `be/modules/invoices/invoices.service.ts` | `fe/pages/reception/InvoicePage.tsx` |
| **S4-02** | 2 | Mã giảm giá phần trăm hoặc số tiền, một mã/phiếu, lưu đủ ba con số | `invoices.service.ts` (`resolveVoucher`) | `fe/pages/admin/VouchersPage.tsx`, `InvoicePage.tsx` |
| **S4-03** | 5 | Lịch sử 10 lượt gần nhất + ghi chú kỹ thuật 500 ký tự, chỉ nội bộ xem | `customers.service.ts` (`visitHistory`, `upsertServiceNote`) | `fe/pages/stylist/MySchedulePage.tsx`, `CustomersPage.tsx` |
| **S4-04** | 5 | Đánh giá 1–5 sao qua liên kết dùng một lần trong 7 ngày, điểm TB cần ≥ 5 lượt | `be/modules/reviews/reviews.service.ts` | `fe/pages/public/ReviewPage.tsx`, `fe/pages/owner/RevenuePage.tsx` |

## EP-06 — Nhắc lịch, thông báo và báo cáo (18 point · 5 story)

| Story | Point | Nội dung | Backend | Frontend |
|---|---|---|---|---|
| **S4-05** | 5 | Email xác nhận ≤ 2 phút, nhắc trước 24 giờ, thử lại 3 lần cách 10 phút | `be/modules/notifications/mail.service.ts`, `email-queue.service.ts`, `booking.service.ts` (`scheduleReminder`) | — (xem ở Maildev) |
| **S4-06** | 3 | Thông báo trong ứng dụng, chuông đếm chưa đọc, dọn sau 30 ngày | `be/modules/notifications/notifications.service.ts` | `fe/components/NotificationBell.tsx` |
| **S4-07** | 5 | Doanh thu theo thợ và theo dịch vụ, tối đa 365 ngày, xuất CSV UTF-8 | `be/modules/analytics/analytics.service.ts` | `fe/pages/owner/RevenuePage.tsx` |
| **S4-08** | 3 | Tổng quan hôm nay, tự làm mới 60 giây, bấm trạng thái mở danh sách | `analytics.service.ts` (`todayDashboard`) | `fe/pages/owner/DashboardPage.tsx` |
| **S4-09** | 2 | Tỉ lệ không đến / huỷ một chữ số thập phân, phân bố khung giờ ngày thường vs cuối tuần | `analytics.service.ts` (`noShowStats`, `slotDensity`) | `fe/pages/owner/SlotDensityPage.tsx` |

---

## Đối chiếu AC và kiểm định 06/10/2026

Nguồn điểm: `de_tai/3. Hệ thống đặt lịch Salon Spa.xlsx`, sheet **4. Product Backlog** và **5. Sprint Plan**. Đã đối chiếu đủ 39 mã story, điểm từng story và tổng theo Epic / Sprint. AC trong bảng là bản tóm tắt; dùng workbook gốc và `DEMO-SCRIPT.md` để nghiệm thu đầy đủ.

| Sprint | Story | Point |
|---|---|---|
| 1 | 10 | 40 |
| 2 | 9 | 42 |
| 3 | 10 | 42 |
| 4 | 10 | 41 |
| Tổng | 39 | 165 |

| Nhóm AC / hồi quy | Bằng chứng tự động |
|---|---|
| S1-01..04, S4-10: xác thực, JWT, RBAC 4 vai trò nhân sự | `auth-rbac.e2e-spec.ts`, `qa-input-hardening.e2e-spec.ts` |
| S1-09, S2-02: cảnh báo ngày nghỉ chưa lưu không ghi audit; xác nhận mới lưu và ghi đúng một audit | `holiday-creation.spec.ts`, `qa-round5-0510.e2e-spec.ts`, `frontend/test/holidays.test.mjs` |
| S2-01..08: ca làm, khung giờ 15 phút, giới hạn đặt, chống đặt trùng | `slot-calculator.spec.ts`, `qa-round2-rules.e2e-spec.ts`, `qa-regression.e2e-spec.ts`, `booking-concurrency.e2e-spec.ts` |
| S2-09, S3-05: khoá tra cứu, huỷ và giới hạn tần suất | `qa-lookup-rate-limit.e2e-spec.ts`, `qa-cancel-rate-limit.e2e-spec.ts` |
| S3-04, S3-07, S3-10: chặn ngày nghỉ ở quầy / dời / online, thống nhất số liệu khách | `availability-closed-day.spec.ts`, `qa-round5-0510.e2e-spec.ts` |
| SSE, TypeORM Migration, cập nhật một chạm, cô lập CSDL test | `realtime-deploy.e2e-spec.ts`, `migration-safety.e2e-spec.ts`, `test-isolation.e2e-spec.ts` |

Kết quả: 139/139 unit; 83/83 E2E trong 12 bộ trên PostgreSQL; 4/4 Demo; lint hai ứng dụng 0 lỗi / 0 cảnh báo; build Vite và typecheck backend đạt. Chạy lại bằng `docs/tools/test_qa.ps1`.

**Phạm vi bằng chứng:** bảng ánh xạ 39 story không có nghĩa mọi dòng AC đã có assertion tự động. Đã sửa `lifecycle.e2e-spec.ts` để dùng dịch vụ seed / ca khả dụng và cố định đồng hồ tạo Date trong cửa sổ check-in; JWT và timer mạng vẫn chạy thật. Ca này chạy trọn đến thanh toán, đóng phiếu, đánh giá và đối chiếu doanh thu, không trả về sớm ngoài giờ. AC email theo thời hạn, bố cục 360 px và thao tác UI cần ghi Pass/Fail khi tester chạy `DEMO-SCRIPT.md` / runbook. Không coi kết quả tự động là biên bản PO ký nghiệm thu.

## Tổng kết

| Epic | Story | Point | Trạng thái |
|---|---|---|---|
| EP-01 Tài khoản và phân quyền | 7 | 27 | Hoàn thành |
| EP-02 Dịch vụ, thợ và lịch làm việc | 6 | 27 | Hoàn thành |
| EP-03 Đặt lịch công khai và tính khung giờ | 7 | 31 | Hoàn thành |
| EP-04 Vận hành lịch hẹn hằng ngày | 9 | 39 | Hoàn thành |
| EP-05 Thanh toán và hồ sơ khách hàng | 5 | 23 | Hoàn thành |
| EP-06 Nhắc lịch, thông báo và báo cáo | 5 | 18 | Hoàn thành |
| **Tổng** | **39** | **165** | |
