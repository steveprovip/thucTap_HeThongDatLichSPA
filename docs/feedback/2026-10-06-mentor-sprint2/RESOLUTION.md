# Xử lý góp ý Mentor — Sprint 2 (06/10/2026)

Nguồn: `TEXT NOTE SPRINT 2.docx` (cùng thư mục). Phát hành trong **v1.4.0**. Mỗi mục được làm trên một nhánh riêng
và hợp nhất `--no-ff` vào `develop` (xem `git log --merges`).

| # | Góp ý của Mentor | Cách xử lý | Nhánh | Kiểm thử |
|---|---|---|---|---|
| 1 | Phân chia lại các nhánh trong GitHub cho hợp lý | Mô hình `main` (Production) · `develop` (Staging) · `feature/*` · `fix/*` · `docs/*`; nhánh cũ được lưu thành thẻ `archive/<nhánh>` rồi xoá (khôi phục được); CI chạy cho mọi Pull Request vào `main`/`develop` | `docs/git-branching-model` | `node scripts/git/branch-cleanup.mjs` (xem trước) |
| 2 | Bảng ca làm việc nhân viên hơi rối mắt | Lưới mỗi thợ một dòng (ảnh, tổng giờ tuần), mỗi ngày một cột, hôm nay tô nổi; ca là “viên” màu theo buổi, nghỉ giữa ca là dòng phụ; ngày tiệm nghỉ gạch chéo; nút sửa/xoá chỉ hiện khi rê chuột; dòng cuối đếm số thợ trực; tìm thợ, lọc “chỉ thợ có ca” | `feature/shift-board-24h-picker` | Kiểm tra giao diện (ảnh chụp trong báo cáo) |
| 3 | Đổi cách chọn giờ “Thêm ca làm” thành 24 giờ | Bộ chọn `TimeSelect24` 00:00 → 23:45, bước 15 phút, nhóm theo buổi, không phụ thuộc SA/CH của Windows; dùng cho ca, nghỉ giữa ca, nghỉ phép, giờ mở cửa; mẫu ca nhanh và xem trước số giờ làm | `feature/shift-board-24h-picker` | typecheck + lint |
| 4 | AI phân tích khoảng thời gian có thể đặt lịch, tránh phải thoát ra kiểm tra lịch | “Trợ lý AI xếp lịch” ngay trong màn hình tạo lịch: duyệt mọi khung hợp lệ của mọi thợ trong 1/3/7 ngày (dựa trên bộ tính khung giờ — ca, nghỉ, ngày lễ, lịch hẹn, giữ chỗ), chấm điểm theo **sớm**, **vừa khít** (không để khoảng lẻ < 30′) và **cân bằng thợ**, giải thích lý do; bấm là điền sẵn ngày/giờ/thợ; xem khoảng rảnh từng thợ | `feature/ai-slot-assistant` | `smart-slots.spec.ts` (4) + e2e |
| 5 | Dùng AI sinh toàn bộ ngày lễ trong năm, tránh ngày nghỉ chèn lên lịch khách | Trợ lý tính ngày lễ theo Bộ luật Lao động 2019 + Ngày Văn hoá Việt Nam 24/11 (từ 2026); Tết và Giỗ Tổ đổi từ âm lịch bằng thuật toán thiên văn múi giờ +7 (chạy ngoại tuyến); đối chiếu từng ngày với ngày nghỉ đã có và **lịch hẹn của khách** — ngày trùng lịch khách được bỏ chọn sẵn, chỉ tạo khi chủ tiệm xác nhận | `feature/ai-holiday-generator` | `vn-holidays.spec.ts` (Tết 1985–2028, Giỗ Tổ, tháng nhuận) + e2e |
| 6 | Không để quản lý/lễ tân xếp việc; nhân viên tự đăng ký lịch, quản lý sắp xếp | Trang “Đăng ký lịch làm” cho thợ (đăng ký cả tuần: ca làm giờ 24h hoặc xin nghỉ, ghi chú); hộp “Yêu cầu chờ duyệt” trên Bảng ca: Duyệt / Sửa giờ rồi duyệt / Từ chối kèm lý do / Duyệt tất cả; yêu cầu hiện dạng viên viền đứt trên bảng ca; thông báo hai chiều; duyệt đi qua đúng luật bảng ca cũ | `feature/shift-registration-approval` | e2e: đăng ký, trùng, chỉnh giờ, duyệt hai lần, từ chối, chồng ca, giới hạn ngày, phân quyền |
| 7 | Footer màu khác, thêm Facebook, Zalo, trang của tiệm, thông tin chuyên viên, địa chỉ | Chân trang nền tối: địa chỉ + chỉ đường Google Maps, hotline bấm gọi, email, Facebook, Zalo, trang của tiệm, giờ mở cửa gộp theo nhóm ngày, đội ngũ chuyên viên lấy từ hồ sơ thợ thật (ảnh, chuyên môn, điểm đánh giá); cấu hình bằng `SALON_*` | `feature/public-footer-density` | e2e `/public/salon-info` |
| 8 | Hiển thị thêm 4 bản ghi, bỏ trống hai bên, chỉ 2 hàng, một màn hình nhiều thông tin | Trang chủ rộng 7xl, hero thấp hơn, lưới **4 cột liền mạch** (trước: 3 cột tách theo nhóm, nhóm ít dịch vụ để trống cột), thẻ gọn, **2 hàng** (8 thẻ; điện thoại 4 thẻ) + “Xem thêm N dịch vụ” | `feature/public-footer-density` | Ảnh chụp 1440px & 390px |
| 9 | Sắp xếp thợ đủ các khung giờ, khung giờ nào cũng có thợ | Hộp “Độ phủ ca”: thanh thời gian từng ngày, đoạn đỏ = giờ mở cửa không có thợ (vàng = thiếu so với mức tối thiểu chọn được 1–3 thợ); mỗi khoảng trống gợi ý thợ rảnh ít giờ làm nhất tuần, bấm “Xếp …” là tạo ca; biểu đồ phân bổ giờ làm; tiêu đề cột ngày “Thiếu thợ” | `feature/shift-coverage-balance` | `coverage.spec.ts` (5) + e2e |
| 10 | Gửi thông tin đặt lịch thành công về email | Email xác nhận thêm trạng thái, lưu ý đến sớm, thời hạn tự huỷ, chỉ đường, hotline, “Thêm vào Google Calendar”; gửi ngay sau khi đặt (không chờ lượt quét 1 phút); khách chưa nhập email gửi bổ sung ngay ở màn hình thành công (xác thực mã + SĐT) | `feature/booking-confirmation-email` | e2e nội dung email, sai SĐT, che địa chỉ |
| 11 | Tạm giữ chỗ khi khách đang đặt 10–15 phút | Vào bước Xác nhận là giữ khung giờ (mặc định 10 phút, `SLOT_HOLD_MINUTES` 5–15) trong giao dịch có khoá dòng thợ; khung đang giữ biến mất với khách khác và bị chặn ở mọi luồng đặt/tạo tại quầy/dời lịch; đồng hồ đếm ngược, “Giữ thêm”, tự trả chỗ khi quay lại/rời trang; hết hạn tự giải phóng | `feature/booking-slot-hold` | e2e: ẩn với khách khác, chặn trùng, chủ giữ chỗ đặt được, hết hạn, trả chỗ, **10 khách tranh 1 khung → đúng 1** |

## Lưu ý minh bạch về “AI”

Hai tính năng mục 4 và 5 là **trợ lý thông minh dựa trên thuật toán** (chấm điểm theo luật vận hành của tiệm, lịch âm
thiên văn), không gọi mô hình ngôn ngữ bên ngoài: kết quả **tất định, giải thích được**, chạy ngoại tuyến, không tốn phí
API và không gửi dữ liệu khách ra ngoài. Có thể nối thêm LLM để diễn giải bằng lời ở phiên bản sau.

## Cấu hình mới (`backend/.env`)

```
SLOT_HOLD_MINUTES=10            # 5–15
SLOT_HOLD_IP_LIMIT_PER_HOUR=30
SALON_EMAIL=lienhe@huongsen.vn
SALON_FACEBOOK_URL=https://www.facebook.com/<trang-cua-tiem>
SALON_ZALO=0909686868           # số điện thoại hoặc liên kết zalo.me
SALON_WEBSITE_URL=
SALON_MAP_URL=                  # bỏ trống = tự tạo liên kết Google Maps từ địa chỉ
SALON_SLOGAN=...
```

## Migration mới (chỉ thêm, không đổi dữ liệu cũ)

- `ShiftRequests1791331200000` — bảng `shift_requests`, hai giá trị `notification_type`.
- `SlotHolds1791331300000` — bảng `slot_holds`.
