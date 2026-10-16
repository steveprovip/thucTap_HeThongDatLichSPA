# RFC-2026-SPA-V3 — Lotus Noir, Command Center, grounding AI, SSE theo kênh

Nhánh `claude/peaceful-pasteur-27lppm`. Tài liệu này ghi lại **cái gì đã đổi, vì sao, và cách tự kiểm chứng lại**.

## 1. Lỗi thật đã sửa (có test tái hiện, đỏ trên code cũ)

| # | Lỗi | Nơi sửa | Test khoá lại |
|---|-----|---------|---------------|
| 1 | "em đã đặt lịch rồi" / "dạ em muốn làm móng": hư từ *đã / dạ* bỏ dấu thành "da" (làn da) → trợ lý gợi ý **dịch vụ chăm sóc da** | `customer-assistant-rules.ts` · `stripParticles` | `customer-particles.spec.ts` (7/8 đỏ trên code cũ) |
| 2 | Ngày khách hỏi đã kín: trợ lý chỉ nói "thử ngày khác", không có giờ cụ thể | `assistant.service.ts` · `nearestVerifiedSlot`, `nearestGroupSlot` | `assistant-grounding.spec.ts` |
| 3 | `useRealtimeSync({ domains })` bỏ qua tham số `domains` → đổi bảng giá cũng làm danh sách lịch hẹn tải lại | `realtimeScopes.ts`, `useRealtimeSync.ts` | `realtime-scopes.test.mjs` |
| 4 | Mỗi lần nối lại SSE (20 phút / đổi tab) đều làm mới toàn bộ dù không lỡ sự kiện | `realtime.ts` · so `bootId + seq` | `realtime-scopes.test.mjs` |
| 5 | Chuyển trạng thái 1 chạm: lỗi một dòng **khôi phục ảnh chụp cả bảng** → mất thay đổi của dòng khác / dữ liệu đồng bộ ngầm | `AppointmentsListPage.tsx`, `DayTimelinePage.tsx` | Playwright: lỗi 409 giả lập chỉ hoàn tác đúng dòng |
| 6 | `<button>` lồng `<button>` trong khối Lịch ngày (React validateDOMNesting) | `DayTimelinePage.tsx` · `TimelineBlock` | Không còn cảnh báo console |
| 7 | `/dat-lich` desktop CLS 0.295: thanh cuộn xuất hiện sau khi wizard tải → đẩy ngang cả trang | `index.css` (`scrollbar-gutter`), `PublicLayout.tsx` | Lighthouse CLS 0 |
| 8 | Production nạp `mockBackend.ts` (≈ 100 KB) và **chạy `seed()` CSDL giả** ở mọi lần tải trang của khách thật | `api/demoMode.ts`, nạp động khi demo | `grep salon.demo.v6 dist/` = 0 |
| 9 | `main.tsx` chặn vẽ tới 800 ms chờ API salon-info | `main.tsx` | FCP thực đo 300–500 → ~180 ms |

### Vòng review đối kháng trước khi merge (15 lỗi được xác nhận lại bằng chạy thật, đã sửa)

| Vùng | Lỗi | Sửa |
|------|-----|-----|
| Trợ lý AI | Bỏ hư từ quá tay xoá luôn "da" (làn da): "chăm sóc da bao nhiêu tiền", "da em hơi khô", "da nổi mẩn", "da em mun nhieu qua" → "chưa rõ ý" | Câu có dấu chỉ bỏ "đã/dạ" có dấu; luật không dấu bỏ các từ nhập nhằng (hơi/hỏi, nổi/nói, bao/báo); TYPOS "mun→muon" không chạy sau "da" |
| Trợ lý AI | "gáy" / "gầy" bị coi là tóc gãy → gợi ý Phục hồi thay vì Cắt tóc | Chỉ tính cụm chắc chắn: "bị/dễ/hay gãy", "gãy ngọn", "tóc (em) gãy nhiều" |
| Trợ lý AI | Cả nhóm kín đúng giờ hỏi → gợi ý ngày xa trong khi dịch vụ khác trong nhóm còn giờ cùng ngày | `nearestGroupSlot` xét cùng ngày trước |
| Lễ tân | Tải lại sau khi ghi dùng chung GET đã chạy TRƯỚC lần ghi → dòng quay về trạng thái cũ | `swrStore.fetch(force)` + vé "request mới nhất mới được ghi đệm" |
| Bảo mật | Đăng xuất / đổi tài khoản không xoá đệm → người sau thấy lịch + SĐT chưa che của người trước | `swrStore.clear()` khi đăng nhập / đăng xuất / hết phiên |
| Đồng bộ | Luồng SSE rớt đúng lúc đang tải lại → nối lại không làm mới (mốc đã tiến) | Cờ `dropped`: rớt ngoài dự kiến thì nối lại luôn làm mới |
| Ctrl+K | Kết quả máy chủ của truy vấn cũ vẫn chọn được bằng Enter | Gắn kết quả với truy vấn đã sinh ra nó |
| Khách hàng | Chọn khách trong Ctrl+K khi đang ở trang Khách hàng không đổi danh sách | Theo `?q=` mỗi lần điều hướng |
| Lịch ngày | Hoàn tác ghi đè trạng thái mới hơn vừa đồng bộ (vd. quầy khác vừa huỷ) | Chỉ hoàn tác khi thẻ còn trạng thái lạc quan, rồi tải lại ngầm |
| Đặt lịch | Trợ lý đổi giỏ + điền giờ ở bước 2 → giờ bị bỏ chọn theo dữ liệu của giỏ cũ | Dữ liệu giờ trống gắn với giỏ + lượt tải |
| Slot Radar | Hôm nay: buổi đã qua bị ghi "Đã kín", buổi trống bị ghi "Sắp kín" | API trả thêm `earliestStartMinutes` (chỉ thêm trường, tương thích ngược); buổi đã qua ghi "Đã qua" |
| Giao diện sáng | Nút Trợ lý AI, bóng `.lift`, độ đậm bôi chọn chữ, thanh cuộn `.thin-scroll` lệch bản cũ | Trả đúng giá trị cũ, chỉ đổi dưới Noir |

## 2. Kiến trúc mới (tóm tắt)

- **Design tokens**: mọi màu Tailwind là biến CSS `R G B`; `:root` = đúng màu Tailwind (giao diện sáng không đổi). `html[data-theme='noir']`
  đảo thang theo vai trò, "teal" → Champagne Gold; chỉ trên màn hình (`@media screen`) nên phiếu in vẫn trắng. Test `design-tokens.test.mjs`
  bắt buộc mọi biến có ở cả hai chế độ. Tương phản WCAG AA: chữ chính 15–17:1, chữ phụ 7.1:1, biểu tượng 5.2:1, chữ trên nút vàng 10–13:1.
- **Chuyển động**: lò xo thật (m=1, k=320, c=26 → ζ≈0.73, vượt 3.6 %) dưới dạng `linear()` CSS; chỉ `transform`/`opacity`; WAAPI/rAF cho số chạy, ánh sáng theo con trỏ.
- **SSE**: sự kiện mang `scope` + `kind` (`booking.created`) + `id: seq`, không chứa dữ liệu cá nhân (e2e kiểm tra).
- **SWR**: `SwrStore` (gộp request trùng, LRU 80 khoá, cập nhật lạc quan mọi trang đệm) + `useSwr` (request mới nhất thắng, giữ dữ liệu cũ khi đổi bộ lọc).
- **Font tự host** (`public/fonts`, OFL): bản variable, subset latin + vietnamese; latin-ext **bớt dải trùng tiếng Việt** (trước đó chữ "ư" kéo thêm 3 tệp ≈ 148 KB).

## 3. Kiểm chứng

```bash
# Cổng chất lượng
npm --prefix backend run typecheck && npm --prefix backend run lint && npm --prefix backend run test      # 331 test
npm --prefix frontend run typecheck && npm --prefix frontend run lint && npm --prefix frontend run test   # 54 test
npm --prefix frontend run build

# E2E trên PostgreSQL thật (tạo/xoá CSDL salon_booking_test)
npm --prefix backend run test:e2e
```

Kết quả tại thời điểm giao (PostgreSQL 16.15, Node 22): unit BE 331/331, FE 54/54, E2E 155/155 (sau khi gộp `develop` có bản sửa
bộ đếm giới hạn tần suất `public_assistant_ip` giữa các suite). Chống đặt trùng: 20 request đồng thời → đúng 1 thành công, 19 nhận 409;
ràng buộc `appointments_no_overlap` chặn cả ghi thẳng vào bảng.

### Lighthouse 12 (cùng máy, cùng máy chủ tĩnh nén Brotli như Cloudflare Pages, API thật)

| Trang | Bản gốc `280d21a` | Bản này |
|---|---|---|
| `/` mobile | 76 | **88** |
| `/` desktop | 98 | **99** |
| `/dat-lich` mobile | 75 | **83** |
| `/dat-lich` desktop | 85 (CLS 0.295) | **99** (CLS 0) |
| Accessibility | 95–96 | **99–100** |
| Tổng dung lượng tải `/` | 420 KB | **300 KB** |
| Gói JS chính | 216 KB (gz 69) | **184 KB (gz 61)** |

Đo thật bằng Playwright (không giả lập, khung nhìn 412 px): FCP ≈ 180 ms, LCP ≈ 550 ms (bản gốc FCP 300–500 ms, LCP 580–840 ms).
Mobile chưa đạt 95: phần còn lại là CSS chặn render (23 KB gz) + vẽ phía client của SPA; bước tiếp theo hợp lý là **prerender
khung trang khách** (HTML tĩnh cho `/`, `/dat-lich`) và CSS quan trọng nội tuyến.

## 4. Không làm / giới hạn

- **Apple Wallet**: thẻ `.pkpass` phải được ký bằng chứng chỉ Pass Type ID của Apple ở máy chủ — chưa có, nên dùng tệp `.ics`
  (iPhone mở thẳng "Thêm vào Lịch") + liên kết Google Calendar.
- **Điểm đánh giá theo dịch vụ**: dữ liệu chỉ có điểm theo chuyên viên → trang chủ chỉ hiển thị điểm chuyên viên (số thật), không bịa điểm dịch vụ.
- **Khu nhân viên** mặc định vẫn giao diện sáng (đèn quầy, in phiếu); bật Lotus Noir bằng nút mặt trăng hoặc Ctrl/⌘ + K → "Chuyển giao diện".
- SSE vẫn là bus trong bộ nhớ của **một** tiến trình API (đúng với Render 1 instance); chạy nhiều bản sao cần Postgres LISTEN/NOTIFY.
