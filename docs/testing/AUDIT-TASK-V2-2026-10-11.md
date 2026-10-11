# Kiểm định TASK v2.0 — 11/10/2026

Đối chiếu mã nguồn với `docs/requirements/3. Hệ thống đặt lịch Salon Spa.xlsx` (39 story / 6 epic / 165 point), xử lý phản hồi
QA `loi_11_10_2026` (Sprint 3, 10 mục) và ba phần mở rộng: bàn giao chủ tiệm, tải x10, Trợ lý AI.
Ký hiệu: `be/` = `backend/src/`, `fe/` = `frontend/src/`. Bảng ánh xạ story → tệp giữ nguyên ở `docs/BACKLOG-MAPPING.md`.

## 1. Bất biến nghiệp vụ

| Bất biến | Kết quả rà soát | Trạng thái |
|---|---|---|
| Thợ chỉ nhận dịch vụ mình có kỹ năng | Đặt online, tại quầy, giữ chỗ, dời lịch, chuyển hàng loạt đều kiểm tra kỹ năng (`STYLIST_MISSING_SKILL`). **Lỗ hổng:** sửa hồ sơ thợ, bỏ một kỹ năng thì các lịch sắp tới cần kỹ năng đó vẫn giữ nguyên thợ. **Lỗ hổng cùng nhóm:** ngưng hoạt động thợ còn lịch sắp tới làm lịch đó mất thợ. | **Đã sửa:** 409 `SKILL_IN_USE` / `STYLIST_HAS_FUTURE_APPOINTMENTS`, trả về mã lịch cần chuyển (`be/modules/stylists/stylists.service.ts`) |
| Không đặt trùng, lưới 15 phút | `SERIALIZABLE` + `FOR UPDATE` + `EXCLUDE appointments_no_overlap`, có test 20 yêu cầu đồng thời. Lưới 15 phút bắt buộc với luồng của khách (đặt online, giữ chỗ: `booking.service.ts:198`, `slot-hold.service.ts:89`). Lễ tân tạo lịch tại quầy "bắt đầu ngay" được làm tròn 5 phút. Đây là thiết kế có chủ đích (S3-07), không phải lỗi. | Đạt |
| Giới hạn với khách vãng lai / khách không tài khoản | 5 lượt đặt / IP / giờ (429), tối đa 3 lịch chưa hoàn tất / SĐT, áp cho **cả** online lẫn tại quầy. Quầy bỏ qua giới hạn IP vì là nhân sự. Khách tự huỷ khi còn ≥ 120 phút, có giới hạn tần suất. Tra cứu sai 10 lần thì khoá 30 phút. | Đạt |
| Không xoá cứng dữ liệu đã được tham chiếu | Dịch vụ, nhóm, ca đã có lịch đều bị chặn xoá. Xoá hồ sơ khách (mới) chỉ xoá hẳn khi khách chưa có lịch hoặc phiếu. Khách đã có lịch thì hệ thống **ẩn danh**. | Đạt |

## 2. Pass / Fail theo Epic

| Epic | Story | Kết quả | Ghi chú lần này |
|---|---|---|---|
| EP-01 Tài khoản & phân quyền | S1-01..04, S1-09, S1-10, S4-10 | **PASS** | RBAC của API mới đã có e2e: `/assistant/*` chặn Thợ (403); `DELETE /customers/:id` chỉ Chủ tiệm |
| EP-02 Dịch vụ, thợ, lịch làm | S1-05..08, S2-01, S2-02 | **PASS (sau sửa)** | Thêm bất biến kỹ năng / ngưng hoạt động. Bảng ca thu gọn. Thông báo yêu cầu ca / nghỉ nêu rõ loại và ngày |
| EP-03 Đặt lịch công khai | S2-03..09 | **PASS** | Tuỳ chọn bắt buộc email (`BOOKING_REQUIRE_EMAIL`). Tính khung giờ theo lô, không còn N+1 |
| EP-04 Vận hành hằng ngày | S3-01..09 | **PASS (sau sửa)** | Giữ vị trí cuộn khi đổi ngày. Lịch sử thay đổi hiển thị tiếng Việt. Cảnh báo vượt giờ **ngay khi đang làm** (trước đây chỉ báo lúc bấm Hoàn tất) |
| EP-05 Thanh toán & hồ sơ khách | S3-10, S4-01..04 | **PASS (sau sửa)** | Tìm theo tên trước đây trả về toàn bộ khách. Thêm cảnh báo khi tên nhập khác tên trong hồ sơ, sửa / xoá dữ liệu khách, trạng thái nút thanh toán |
| EP-06 Nhắc lịch, thông báo, báo cáo | S4-05..09 | **PASS (sau sửa)** | Email dời / huỷ gửi ngay. Lỗi xếp hàng email không còn làm API trả 500 |

Yêu cầu phi chức năng "ghi nhật ký mọi lần **xem** hồ sơ khách" và "xoá dữ liệu khách theo yêu cầu" trước đây **thiếu**.
Đã bổ sung: `@Audit(VIEW)` cho `GET /customers/:id`, `/:id/history`, `/by-phone/:phone`, và `DELETE /customers/:id`
xoá hẳn hoặc ẩn danh tuỳ hồ sơ đã có lịch hay chưa. Riêng nhật ký kiểm toán là chỉ đọc (trigger), nên tên khách đã ghi
trong nhật ký cũ không bị xoá. Đây là giới hạn đã biết.

## 3. Phản hồi QA 11/10 (Sprint 3)

| # | Phản hồi | Xử lý |
|---|---|---|
| 1 | Thông báo yêu cầu ca / nghỉ không nói rõ, xin nghỉ bị ghi là "đăng ký ca" | `describeShiftRequests`: tiêu đề theo loại ("đăng ký N ca làm", "xin nghỉ N ngày", hoặc gộp cả hai). Nội dung ghi ngày, khung giờ, lý do (tối đa 3 mục) |
| 2 | Lỗi hiển thị, email không thống nhất | `fe/components/EmailText.tsx` (`font-mono text-xs text-slate-600`, biểu tượng thư, nút sao chép) dùng ở trang Thợ, Tài khoản, Hồ sơ khách, Quầy, chi tiết lịch hẹn |
| 3 | Tìm khách theo tên không chính xác | Từ khoá không có chữ số sinh ra `phone LIKE '%%'`, khớp mọi khách. Nay chỉ so SĐT khi từ khoá có ≥ 3 chữ số. Thêm chỉ mục trigram cho SĐT |
| 4 | Tạo lịch tại quầy với tên khác hồ sơ: không cảnh báo, tên không đổi | Hiện cảnh báo với hai lựa chọn: "Dùng tên hồ sơ" hoặc tick "Cập nhật hồ sơ thành …" |
| 5 | Đề xuất sửa / xoá thông tin khách | Hồ sơ khách sửa được họ tên và email. Chủ tiệm có nút "Xoá dữ liệu khách": xoá hẳn nếu chưa có lịch, ẩn danh nếu đã có |
| 6 | Cảnh báo lễ tân khi lịch vượt chuẩn 20 phút | Cron mỗi phút `watchOverruns`: báo khi lịch **đang làm** vượt ngưỡng, nêu lịch kế tiếp của thợ có nguy cơ trễ. Mỗi lịch chỉ báo một lần, Hoàn tất không báo lặp |
| 7 | Lịch sử thay đổi khó đọc, trộn ngôn ngữ | `describeAppointmentChange`: "Trạng thái: Chờ xác nhận → Đã xác nhận". Nhật ký kiểm toán hiển thị trạng thái và thời điểm bằng tiếng Việt |
| 8 | Đổi ngày mất khung giờ đang xem | Đổi ngày giữ nguyên lưới cũ (làm mờ) cho tới khi dữ liệu mới về, nên vị trí cuộn không đổi. Bỏ phản hồi cũ khi bấm qua nhiều ngày liên tiếp |
| 9 | Email cho khách | Đặt / dời / huỷ (nhân viên **và** khách tự huỷ) đều xếp thư và gửi ngay khi khách có email (e2e kiểm cả ba). Thêm tuỳ chọn bắt buộc email, hoặc nhắc rõ lợi ích ở bước 4 |
| 10 | Tối ưu bảng ca | Một hàng điều khiển. Dòng thợ thấp hơn. Mỗi ca là một viên một dòng, nghỉ giữa ca là biểu tượng ☕. Tiêu đề và dòng tổng cố định khi cuộn. Hộp độ phủ thu thành một dòng chip % theo ngày. Chọn giờ dùng `TimeSelect24` (24 giờ, bước 15 phút) |

Theo TASK v2.0 còn có: sắp xếp ở màn **Chờ xác nhận** (giờ hẹn cũ nhất / mới nhất, tên A–Z; lịch quá 12 giờ luôn ở đầu).
Ở **Phiếu tính tiền**, khi đã thanh toán thì nút chuyển thành **Đã thanh toán** (bị khoá) và "Đóng phiếu & kết thúc lịch hẹn" trở thành nút chính.

## 4. Tải x10 (Part 4)

`npm run seed:scale --prefix backend` nạp 100 dịch vụ, 50 thợ, 10.000 khách và ~54.900 lịch hẹn trong khoảng 8 giây. Dữ liệu
sinh theo tập hợp, chạy lại được, có `--reset`, và đã kiểm 0 vi phạm kỹ năng / lưới / ca. Migration `ScaleIndexes1791504000000`
chỉ thêm chỉ mục: `appointments(start_at, stylist_id, status)`, chỉ mục một phần cho lịch đang giữ chỗ,
`(start_at DESC, id DESC)` cho phân trang keyset, trigram `customers(phone)`. `customers(phone)` đã có UNIQUE từ trước.

`npm run bench:scale --prefix backend` (PostgreSQL 16, trung vị 5 lần, 40 thợ đủ kỹ năng):

| Truy vấn | Trước | Sau |
|---|---|---|
| Khung giờ trống 1 ngày | 245 truy vấn · 271 ms | 6 · 37 ms |
| Ngày còn chỗ gần nhất, quét 30 ngày | 482 · 467 ms | 9 · 251 ms (mặc định 2 ngày: 5 · 70 ms) |
| Gợi ý khung giờ 7 ngày | 1.696 · 1.414 ms | 5 · 100 ms |
| Chọn thợ tự động | 242 · 223 ms | 5 · 19 ms |
| Danh sách lịch hẹn trang 1 / trang 1000 | 71 / 122 ms | 25 / 46 ms; con trỏ 23 ms |
| Tìm khách theo SĐT | 22 ms | 2 ms |

Cách làm: `loadStylistDays` gom ca, nghỉ riêng, lịch hẹn và giữ chỗ của N thợ × M ngày vào **một** truy vấn `UNION ALL`
(trạng thái viết hằng để dùng chỉ mục một phần). Giờ mở cửa và ngày lễ: 2 truy vấn cho cả khoảng ngày.
Danh sách lịch hẹn bỏ truy vấn con `DISTINCT` của `skip/take`, chỉ JOIN khách khi có tìm kiếm, và có thêm `cursor` / `nextCursor`
(base64url `start_at|id`). Phân trang số trang vẫn dùng được như cũ.

## 5. Trợ lý AI (Part 5)

Excel xếp "gợi ý bằng học máy" vào **ngoài phạm vi**, nên trợ lý được làm như một phần mở rộng an toàn: lõi là số liệu SQL,
mô hình ngôn ngữ chỉ là tuỳ chọn.

- `be/modules/assistant`: `GET /assistant/insights` (giờ vàng / giờ vắng 90 ngày, combo dịch vụ hay đặt cùng),
  `GET /assistant/shift-suggestions` (khung thiếu thợ + thợ nên xếp), `POST /assistant/chat` (30 câu / 10 phút / người).
  Chỉ Chủ tiệm và Lễ tân dùng được.
- Mô hình: `AI_PROVIDER=ollama` (Qwen 2.5 3B/7B chạy cục bộ) hoặc `openai` (mọi API tương thích). Để trống thì trả lời theo luật.
  Quá `AI_TIMEOUT_MS` hoặc lỗi thì lùi về luật, không trả 500. Mô hình chỉ nhận số liệu tổng hợp, không nhận tên / SĐT / email khách.
- `fe/components/SmartAiAssistant.tsx`: nút nổi góc phải dưới. Tự kiểm tra 7 ngày tới và hiện số đỏ khi có khung thiếu thợ.
  Có 4 tab: Hỏi nhanh, Ca thiếu (Chủ tiệm bấm "Xếp …" là tạo ca), Ngày lễ (sinh ngày lễ dương + âm lịch, thêm tất cả bằng một chạm),
  Giờ vàng & combo.

## 6. Kiểm chứng

| Cổng | Kết quả |
|---|---|
| Backend typecheck + `npm run lint` | Đạt |
| Backend unit | 186/186 (thêm 9: luật trợ lý, LLM client với máy chủ giả, thông báo ca) |
| Backend e2e (PostgreSQL 16, CSDL `*_test` cô lập) | 114/114 trong 15 bộ, gồm bộ mới `qa-1110-ops.e2e-spec.ts` (9 ca) |
| Frontend typecheck + lint + `node --test` + `vite build` | Đạt, 6/6 |
| Scripts `node --test scripts/lib/test/` | `env-check.test.mjs` 3/3 |
