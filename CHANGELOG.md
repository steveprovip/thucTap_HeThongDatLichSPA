# Nhật ký cập nhật

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).
Launcher (biểu tượng Hương Sen Salon / `HoYoSalon.bat`) đọc tệp này cho mục **Có gì mới** và **Nhật ký cập nhật**.

## [3.2.0] - 2026-10-18

### Xử lý 17 lỗi QA Sprints 2–4, Chân trang Luxury Emerald, Cảnh báo trễ ca 20m & Độc lập Cloudflare Pages 24/7
- **Độc lập Cloudflare Pages 24/7 (`_redirects`):** Tạo cấu hình proxy rewrite mã 200 chuyển toàn bộ request `/api/*` sang Render backend 24/7. Trang công khai `https://huongsen-salon.pages.dev` hoạt động độc lập không còn phụ thuộc chạy `HoYoSalon.bat` trước.
- **Chân trang phong cách Luxury Emerald ($10.000):** Chuyển SiteFooter sang dải xanh ngọc hoàng gia Imperial Emerald (`#061E1A`) kết hợp viền vàng champagne, hiển thị cố định số Zalo (0909 686 868), địa chỉ tiệm và khối chứng chỉ y tế/chuyên môn.
- **Cảnh báo trễ ca 20 phút cho Lễ tân:** Thêm banner nhấp nháy đỏ nổi bật trên đầu trang Lịch ngày khi thợ đang làm vượt thời lượng chuẩn quá 20 phút, cảnh báo các lịch hẹn sau có nguy cơ trễ hẹn.
- **Khoá chức năng Cải tiến AI cho riêng Quản trị viên (Admin):** Ẩn trên menu và chặn nghiêm ngặt ở cả backend API (`Role.ADMIN` trên `/assistant/improvement` và `/assistant/learning`, chặn 403 Forbidden với owner/receptionist/stylist).
- **Khắc phục lỗi thông báo nhảy khi bấm Tạo phiếu:** Chặn lỗi trùng lặp do React StrictMode chạy effect 2 lần, thêm cơ chế in-flight request deduplication và fallback 409 nhẹ nhàng.
- **Chuẩn hoá hàng đợi Email:** Khoá hàng đợi bằng `FOR UPDATE SKIP LOCKED` + hợp đồng thuê 5 phút (ngăn 2 tiến trình API cùng gửi 1 mail), sửa link trong email trỏ về đúng domain công khai thay vì `localhost:5173`.
- **Đồng bộ ghi chú Thợ - Lễ tân - Chủ tiệm:** Ngăn kéo lễ tân tự động điền sẵn ghi chú hiện có và hiển thị inline, không còn tình trạng mở ô trống ghi đè mất ghi chú của thợ.
- **Cải tiến kéo thả Kanban kiểu Jira:** Cho phép nắm kéo cả thẻ (rê > 6px mới kích hoạt kéo, bấm mở chi tiết), cột đích viền đứt phóng nhẹ, khoá cột "Không đến" nếu chưa đủ 30 phút.
- **Trợ lý AI trả lời 7 câu hỏi nghiệp vụ:** Bổ sung 6 ý định (intents) truy vấn dữ liệu thực tế (top khách hàng, lịch gần nhất, ngày nghỉ tiệm, số dịch vụ, doanh thu theo kỳ, tải việc thợ).
- **Chỉ số nhân sự trên Dashboard & Nhận diện vai trò:** Dải thống kê real-time thợ đang làm / đang rảnh / theo ca và huy hiệu màu hiển thị vai trò trên header.
- **HoYoSalon Launcher ổn định Windows 11:** Tự động fallback chạy bằng Node.js khi VBScript bị chặn, sửa mở trình duyệt mặc định bằng `cmd.exe /c start`.

## [3.1.0] - 2026-10-16

### Giao diện sáng Lotus Ivory & Champagne Luxe $10.000, Triển khai Cloudflare tự động & Đồng bộ toàn diện
- **Giao diện sáng Lotus Ivory & Champagne Luxe ($10.000):** Toàn bộ luồng khách công khai chuyển sang tone sáng ngà ngọc (`#FAF7F2` / `#F6F3ED`), thẻ trắng ngọc trai, viền vàng champagne (`#C5A059`), nút bấm ngọc bích Sen (`#135D47`), đạt chuẩn tương phản WCAG AA/AAA.
- **Thước đo khung giờ (Slot Radar):** Trực quan hóa tỷ lệ lấp đầy khung giờ với 4 màu: Xanh (còn chỗ), Hổ phách (sắp kín), Đỏ (đã kín), Xám (đã qua), luôn kèm nhãn chữ trợ năng.
- **Dock nổi giữ chỗ & Trợ lý AI:** Kính sữa 90% blur 20px, vòng đếm ngược 10 phút, biểu tượng sen ngọc bích nổi bật.
- **Tìm nhanh Command Palette (Ctrl + K):** Tra cứu tức thì lịch hẹn, khách hàng, chuyên viên và điều hướng nhanh mọi trang quản trị.
- **Đồng bộ SWR Cache & Bảo mật phiên:** Xóa sạch bộ đệm khi đăng xuất/đăng nhập, chống tranh chấp dữ liệu khi tải lại danh sách.
- **Triển khai tự động Cloudflare Pages 24/7:** Hỗ trợ `CLOUDFLARE_API_TOKEN` và `CLOUDFLARE_ACCOUNT_ID` triển khai headless không cần mở trình duyệt; cấu hình `public/_headers` cache 1 năm cho assets.
- **Đồng bộ tài liệu kiểm định:** Báo cáo Word và Slide PowerPoint cập nhật đầy đủ 385 Unit tests (331 BE + 54 FE), 155 E2E tests trong 13 bộ PostgreSQL.

## [2.2.1] - 2026-10-13

### Triển khai đám mây miễn phí 24/7 & Khắc phục hoàn toàn kiểm thử chập chờn
- **Link cố định 24/7 miễn phí:** `npm run deploy:cloud` triển khai Cloudflare Pages + Render + Supabase/Neon + Brevo (chỉ việc tạo tài khoản là làm tay); Worker giữ API thức; `/health/live` không đụng CSDL; tiệm vắng thì tác vụ nền thưa lại để CSDL miễn phí được ngủ; email qua API Brevo (Render Free chặn SMTP); ảnh tải lên có bản sao trong CSDL (đĩa tạm của Render).
- **Kiểm thử E2E độc lập:** Cô lập ngày kiểm thử cho `qa-round5-0510`, loại bỏ hoàn toàn lỗi phụ thuộc thứ tự chạy giữa các bộ test (153/153 pass).

## [2.2.0] - 2026-10-13

### Ghi chú test thực tế 13/10 — Kéo thả kiểu Jira, Chia sẻ link 1 chạm & Độ phủ 41 tình huống backlog
- **Chờ xác nhận:** nút "Xử lý" đổi thành "Chi tiết".
- **Lịch ngày kiểu Jira:** thêm chế độ **Bảng Kanban** — mỗi trạng thái một cột, kéo thẻ để xác nhận / check-in / bắt đầu / hoàn tất / không đến / huỷ (huỷ & từ chối hỏi lý do; bước sai luồng bị chặn kèm lời giải thích); trên **dòng thời gian** kéo khối lịch sang thợ khác / giờ khác (bắt bước 15 phút, hỏi xác nhận, máy chủ kiểm tra kỹ năng & giờ trống, khách nhận email). Dùng được chuột, cảm ứng, bàn phím.
- **Bảng ca làm kiểu Jira:** kéo viên ca sang ô khác để chuyển (đổi người / đổi ngày), giữ Ctrl để sao chép; chặn chồng ca, ngoài giờ mở cửa, ca còn lịch hẹn.
- **Khách vãng lai:** tạo xong chỉ hiện thông báo (khách, giờ, thợ), không hiện mã lịch.
- **Email không tới:** hệ thống đang gửi vào hộp thư thử nghiệm MailDev trên máy — trang Tổng quan nay cảnh báo rõ, hướng dẫn thiết lập Gmail (mật khẩu ứng dụng) và có nút **Gửi email thử**.
- **Dữ liệu mẫu đủ 39 user story:** `npm run seed:check` (41 tình huống); dữ liệu tự "lão hoá" theo thời gian như ngày làm việc thật; bổ sung dịch vụ ngưng bán, dịch vụ chưa có thợ, yêu cầu ca chờ duyệt, thợ ốm ngày mai còn lịch, phiếu điều chỉnh…
- **Ảnh phong cách Việt Nam:** ảnh dịch vụ / thợ chọn lại (áo dài cô dâu, kỷ yếu, khăn vấn, gội đầu dưỡng sinh, tiệm tóc Việt).
- **Chia sẻ link 1 chạm:** HoYoSalon tạo link HTTPS công khai + mã QR, mở trên mọi thiết bị (Cloudflare Quick Tunnel).

## [2.1.1] - 2026-10-13

### AI local 1 chạm trên mọi máy (sửa lỗi laptop không chạy được AI)
- HoYoSalon tự tải model Spark-X2.5-4B + bộ chạy llama.cpp ở nền (ẩn, tải tiếp được, kiểm tra ổ đĩa trống) trên máy mới clone, tải xong tự bật AI; máy đã có model thì tự bật AI ngay khi khởi động. Launcher hiện tiến độ "AI local: đang tải model x%" / "sẵn sàng".
- Sửa lỗi không bật được AI trên máy bật `NoDefaultCurrentDirectoryInExePath` (cmd không tìm `chay_ai_local.cmd` theo đường dẫn tương đối) — dùng đường dẫn tuyệt đối cả ở Launcher lẫn backend.
- Bộ chạy GPU dừng ngay khi khởi động (driver cũ, card không hợp, thiếu VRAM) → tự chạy lại bằng CPU; khoá chống bật AI hai lần cùng lúc (tránh tràn VRAM card 4 GB).

## [2.1.0] - 2026-10-12

### Trợ lý AI — trả lời đúng, không gợi ý linh tinh
- Câu số liệu / chính sách (bao nhiêu dịch vụ, rẻ nhất, đắt nhất, nhanh / lâu nhất, theo nhóm, dịch vụ hot, giá một dịch vụ, bảng giá, giờ mở cửa, cọc, huỷ lịch, thanh toán, khuyến mãi) trả lời thẳng từ dữ liệu thật — mô hình 4B không còn đếm sai ("60 dịch vụ") hay làm mất thứ hạng.
- "Combo có gì hot?" xếp hạng TRONG nhóm combo; "combo khác gì đặt lẻ", "uốn lạnh với uốn nóng khác gì" được giải thích bình thường, chỉ dựa trên mô tả dịch vụ của tiệm.
- Thẻ dịch vụ chỉ hiện khi khách đang chọn dịch vụ (tối đa 3, gọn một dòng); khung chat cuộn tới đầu câu trả lời mới.
- Làm sạch câu trả lời của mô hình (bỏ `**[Đặt lịch]**`, markdown, token rác); không còn chèn "bấm nút Đặt lịch" vào mọi câu.
- AI local tự bật khi backend khởi động, tự thử lại khi mất kết nối; widget hiện trạng thái (Đang chạy / Đang kết nối / Mất kết nối) và nút "Khởi động lại AI" chỉ khi cần.

### Trợ lý AI — kiểm thử nhập vai khách (2 bộ, 75 câu hỏi nhiều lượt trên AI local thật)
- **Tra giờ trống thật** ngay trong khung chat ("massage chân hôm nay còn giờ nào", "mai 9h còn chỗ không", "chủ nhật 10h được không", "15/10…"): dùng đúng bộ tính khung giờ của trang đặt lịch; bấm "Đặt" mở phiếu đặt lịch đúng dịch vụ và ngày.
- **Hiểu ngữ cảnh hội thoại**: "cái đó giá bao nhiêu", "làm mất bao lâu", "cái nào rẻ hơn", "trọn gói gồm những gì" hiểu theo dịch vụ / nhóm vừa nói tới.
- Thêm: nhiều dịch vụ trong một câu + tổng thời lượng, so sánh "A hay B", hỏi theo ngân sách ("dưới 200k", "tầm 300 nghìn"), giờ mở cửa theo ngày, đi nhóm, hỏi về thợ, dịch vụ tiệm không có ("nối tóc", "xăm chân mày" → nói thật là chưa có), tiếng Anh cơ bản.
- Sửa lỗi bỏ dấu tiếng Việt: "cô dâu" ≠ "ở đâu", "giá cắt" ≠ "giá cả", "mất" ≠ "mặt", "thứ" ≠ "thư", "tháng" ≠ "thẳng", "gói" ≠ "gội", "đau" ≠ "đầu", "tiệm" ≠ "tiêm", "tôi" ≠ "tối".
- "Combo có gì hot" xếp theo lượt đặt thật 90 ngày của mọi dịch vụ; mô hình chỉ viết một câu dẫn ngắn, danh sách / giá luôn lấy từ dữ liệu; không còn tự nhận "không phải bot".

### Trợ lý AI — nhớ đang hỏi gì, không bịa số liệu (nhập vai khách lần 3)
- **Trạng thái hội thoại**: "sáng mai có giờ nào trống?" → "cắt tóc nữ ?" → "thế giờ trống là ?" giữ đúng ngày mai buổi sáng + dịch vụ vừa chọn; "thế chiều thì sao", "vậy tối được không", "còn thứ 7 thì sao" đổi buổi / ngày mà giữ dịch vụ; hỏi giá giữa chừng thì thoát nhiệm vụ tra giờ.
- "Bây giờ còn mở cửa không?" trả lời theo giờ thật (chưa mở / đang mở, còn bao lâu / đã đóng, mai mở lúc mấy giờ / hôm nay nghỉ lễ) thay vì in cả bảng giờ 7 ngày; "mấy giờ đóng cửa" chỉ nêu hôm nay và ngày mai.
- Ngữ cảnh có từ 2 dịch vụ trở lên ("massage cổ vai gáy giá bao nhiêu" → "mai còn giờ không") thì hỏi lại khách chọn dịch vụ nào, không tự chọn bừa.
- **Kiểm tra bám dữ liệu**: câu trả lời tự do của mô hình mà khẳng định giờ trống hoặc một mức giá không có trong danh mục bị loại, trả bằng dữ liệu thật (thử thật: mô hình 4B từng bịa "còn 12 khung giờ trống").
- Chưa hiểu 2 lần liên tiếp → chuyển sang hotline / Zalo của tiệm thay vì hỏi lại mãi.
- Ghi "lỗ hổng kiến thức" (câu chưa trả lời được, đã che SĐT / email) — chủ tiệm / lễ tân xem qua `GET /api/assistant/knowledge-gaps`.
- Bộ chấm điểm nhiều lượt kiểu τ-bench `npm run eval:ai` (12 kịch bản, 33 lượt, k = 3): AI local đạt pass^3 = 100%.

### Trợ lý AI — tự cải tiến có người duyệt (nhập vai khách lần 4–7 trên AI local thật)
- Log 12/10 lần 4: "ngày kia có dịch vụ mát xoa nào trống lịch" tra giờ trống **cả nhóm massage** (dịch vụ nào còn mấy giờ, sớm nhất mấy giờ, dịch vụ nào kín); "có những thợ gì có thể làm" nêu **tên thợ** làm được dịch vụ đang nói và ai còn giờ trống ngày đó; mã giảm giá đọc **ưu đãi đang chạy thật** (không lộ mã); không bao giờ lặp nguyên văn câu vừa trả lời.
- Hiểu lỗi gõ / tiếng lóng: "mát xoa", "bn", "k", "đc", "j", "z", "mấy h", "bao nhiu", "dịch dụ", "thư dãn", "tỉa lại", "sdt"; sửa va chạm khi bỏ dấu ("mún" = muốn ≠ "mụn", "thứ năm" ≠ "tóc nam"); "làm đẹp da mặt" ra nhóm Chăm sóc da (không còn "Cạo mặt & tỉa râu"); combo / dịch vụ trẻ em chỉ gợi ý khi khách nhắc tới.
- **Viết lại câu khó hiểu** bằng AI local rồi trả lời bằng dữ liệu thật ("Mình hiểu là: …"), có **kiểm tra trung thực** (không được thêm dịch vụ khách không nhắc — thử thật mô hình 4B từng viết "mát xoa giá" thành "Chăm sóc da Vitamin C giá").
- Trang **Cải tiến Trợ lý AI**: đề xuất học chờ duyệt (từ AI viết lại / khách tự hỏi lại), dạy cụm từ / cả câu / **câu trả lời soạn sẵn** cho câu hỏi ngoài dữ liệu ("chỗ để xe"), câu chưa trả lời tốt, phản hồi 👍 / 👎 của khách, số câu AI bịa số liệu bị chặn.
- Câu dẫn tư vấn soạn sẵn theo nhu cầu (AI 4B viết câu dẫn sai nghĩa 3/6 lượt); bật lại câu dẫn của AI bằng `AI_LLM_LEAD=1`.
- Bộ chấm điểm `npm run eval:ai:full`: 45 kịch bản / 135 lượt gồm biến thể không dấu + viết tắt (kiểm thử bất biến kiểu CheckList), AI local đạt pass^3 = 100%.

### Hiệu năng & chịu tải
- 1000 khách hỏi trợ lý cùng lúc: 100% được trả lời; khi có mô hình 1 luồng, p95 giảm từ 81 giây xuống 1,4 giây (cổng chặn đồng thời, gộp câu trùng, bộ nhớ đệm câu trả lời).
- Danh mục công khai: truy vấn song song + bộ nhớ đệm 30 giây tự xoá khi chủ tiệm sửa (447 → 2.176 yêu cầu/giây).
- Kiểm thử tự động cho các yêu cầu phi chức năng của tài liệu (20.000 lịch hẹn, 5.000 hồ sơ, 8 thợ × 120 lịch) và dịch vụ `ai` trong Docker production.

### Quy trình cập nhật an toàn hơn
- Khoá chống hai lần cập nhật chạy chồng nhau; preflight chặn migration phá huỷ (không thể tự quay về bản cũ an toàn); smoke test chức năng sau khi bật bản mới; kiểm tra chữ ký gói npm; nhật ký `logs/update-history.jsonl`.

## [2.0.0] - 2026-10-11

### Trí tuệ nhân tạo (AI Local & Trợ lý đàm thoại)
- **Tích hợp mô hình AI Local Spark-X2.5-4B** (Q4_K_M ~2,6 GB) chạy trực tiếp trên GPU máy tính tiệm (hỗ trợ NVIDIA CUDA, Vulkan và CPU) đạt tốc độ ~98 tok/s.
- Kịch bản tải và cài đặt 1-chạm `tai_model_local.cmd` và `chay_ai_local.cmd`, tự động phát hiện GPU và khôi phục khi mất mạng.
- Trợ lý AI đàm thoại tự nhiên cho cả khách đặt lịch và quản trị viên tiệm, hỗ trợ gợi ý dịch vụ theo nhu cầu và điền thẳng vào form đặt lịch.
- Cơ chế 2 tầng: tự nhận diện máy chủ AI local; nếu chưa bật tự chuyển về Smart Rule Assistant mà không bao giờ báo lỗi.

### Dữ liệu thực tế & Giao diện người dùng (UX/UI)
- Bộ dữ liệu thực tế: 43 dịch vụ spa & tóc với ảnh Unsplash bản quyền độ nét cao, 14 thợ chuyên nghiệp, 900 khách hàng và hơn 7.900 lịch hẹn mẫu.
- **Phân trang toàn diện (Universal Pagination)**: Hook `useClientPage` đồng bộ giao diện phân trang 10/20/50 dòng cho toàn bộ các bảng (Doanh thu, Dịch vụ, Hồ sơ thợ, Lịch ca, Nhân sự, Mã giảm giá, Phiếu tính tiền).
- Trang Doanh thu: Biểu đồ cột tự động chọn Top 8 dịch vụ doanh thu cao nhất (kèm nút xem Tất cả), loại bỏ hoàn toàn lỗi đè chữ trên nhãn.
- Trang Dịch vụ: Tự động reset về trang 1 khi chuyển nhóm dịch vụ hoặc tìm kiếm.
- Trang Hồ sơ thợ: Hỗ trợ chuyển đổi linh hoạt dạng Thẻ (8 thợ/trang) và Bảng (10 thợ/trang), lọc trạng thái và nhóm kỹ năng.

### Thương mại hóa & Vận hành doanh nghiệp (B2B SaaS)
- **In hoá đơn nhiệt K80 (80mm)**: Nút in hoá đơn nhanh tại quầy thu ngân chuẩn máy in bill POS, mã VietQR động theo mã hoá đơn.
- **Cọc chống bùng lịch**: Đơn dịch vụ trên 500.000 đ tự động kích hoạt chính sách cọc 30% kèm hướng dẫn chuyển khoản VietQR cú pháp `COC <SĐT> <MÃ LỊCH>`.
- **Webhook Event Dispatcher**: Hệ thống phát sự kiện đặt/xác nhận lịch ký HMAC-SHA256 sẵn sàng kết nối Zalo ZNS và SMS Brandname.
- **Triển khai Production 1-Chạm**: `deploy_production.cmd` và `docker-compose.prod.yml` đóng gói Nginx (Brotli + Gzip), NestJS, PostgreSQL 15 an toàn.
- Cẩm nang bàn giao 3 vai trò (Chủ tiệm, Lễ tân, Kỹ thuật viên) tại `docs/COMMERCIAL_HANDOVER.md`.

## [1.6.0] - 2026-10-09

### Sao lưu an toàn & Bảo vệ CSDL
- Nâng cấp cơ chế sao lưu CSDL `pg_dump -Fc` tự động lúc 02:00, lưu trữ 14 bản gần nhất.
- Bảo vệ giao dịch và rollback an toàn khi chạy migrations.
- Đóng gói Docker production cơ bản.

## [1.5.2] - 2026-10-07

### Kiểm tra bản mới: báo đúng nguyên nhân
- Máy có mạng nhưng Launcher báo "Không kết nối được kho mã" và hiện commit / nhánh là "—": nay phân loại đúng nguyên nhân — thư mục không phải git clone (chép thư mục / giải nén .zip), chưa cài Git, kho riêng tư chưa đăng nhập GitHub, mạng chặn, Git từ chối thư mục khác chủ sở hữu (*dubious ownership*, nay tự xử lý) — kèm cách sửa và chi tiết lỗi git.
- Nút **Sửa kết nối cập nhật** (nối thư mục chép / .zip với kho mã, giữ nguyên .env, dữ liệu, sao lưu; thay đổi tay lưu thành `logs/adopt-*.patch`) và **Đăng nhập GitHub** (kho riêng tư).
- Không còn báo "Đang là bản mới nhất" khi chưa kiểm tra được; cảnh báo hiện ngay trên màn hình chính.
- Giao diện hỏi trạng thái mỗi 1,5 giây từng chạy 8+ tiến trình git mỗi lần: nay nhớ kết quả 5 giây (nhẹ máy yếu).

### Khởi động lần đầu nhanh hơn
- Không còn tự tải **PgAdmin** (~0,5 GB); chỉ dựng PostgreSQL (+ Maildev khi cần). Cần PgAdmin: `npm run db:up`.
- Docker + PostgreSQL, cài gói npm và build chạy **song song**; backend và giao diện cài / build đồng thời; `npm ci` cho lần cài sạch; bỏ cài gói thư mục gốc (chỉ dành cho kiểm thử AI).
- Build giao diện bằng `vite build` (bỏ `tsc` lặp lại), migration / tài khoản quản trị / kiểm tra bảo mật chạy bằng bản đã biên dịch thay vì ts-node (11,8 s → 1,3 s đo thực tế).
- Mỗi bước được đo giờ (`⏱`) và lưu `logs/startup-timing.json`, có trong `system_logs.zip`: máy chậm gửi tệp này là biết chậm ở bước nào.
- Đo thật khởi động lạnh chế độ máy chủ (không Docker): 52 s → 29 s.

## [1.5.1] - 2026-10-07

### macOS
- Thêm **`HoYoSalon.command`** (nhấp đúp) và ứng dụng **Hương Sen Salon.app** tự tạo trong `~/Applications`: mở Launcher không cần Terminal.
- Sửa lỗi `Permission denied` khi chạy `./scripts/unix/start_server.sh`, `start_tunnel.sh`, `update_project.sh` (thiếu quyền chạy trong git).
- Ứng dụng mở từ Finder/Dock không có PATH của Terminal: Launcher tự bổ sung thư mục của Docker Desktop, Homebrew và Node.js để thấy `docker`, `npm`, `git` (hết lỗi `docker-credential-desktop` / "chưa cài Docker").
- Cửa sổ Launcher mở dạng ứng dụng (không thanh địa chỉ) bằng Chrome / Edge / Brave nếu có, như trên Windows.
- Hướng dẫn riêng: `docs/guides/CHAY-TREN-MACOS.md`.
- Tự giải phóng cổng 3000/5173 khi mở Launcher giờ chỉ dọn tiến trình đang **lắng nghe** cổng VÀ thuộc thư mục dự án (trước đây `lsof -ti :cổng` còn bắn nhầm trình duyệt đang kết nối và mọi chương trình khác giữ cổng); dọn bằng SIGTERM thay vì kill -9.

## [1.5.0] - 2026-10-06

### Launcher: 1 chạm như game
- Không còn cửa sổ đen: biểu tượng **Hương Sen Salon** trên màn hình mở Launcher chạy ẩn (HoYoSalon.vbs); lỗi hiện bằng hộp thoại.
- Hệ thống sẵn sàng (`/health` = 200) thì tự mở ứng dụng và Launcher tự thu gọn sau 3 giây.
- Tự kiểm tra bản mới khi mở và mỗi 30 phút; nút **CẬP NHẬT (vX.Y.Z)** kèm nhãn **MỚI**, kể cả khi hệ thống đang chạy.
- Cập nhật 1 chạm: sao lưu CSDL → git pull → cài gói → build → migration → chạy lại → mở ứng dụng; lỗi tự quay về bản cũ.
- **Thiết lập cửa hàng**: nhập tên tiệm, hotline, ngân hàng nhận VietQR, Gmail gửi thư, tài khoản quản trị đầu tiên — không sửa tệp .env.
- **Sao lưu dữ liệu ngay**, **Mở thư mục sao lưu**, **Tự bật hệ thống khi mở máy**; máy tiệm (nhánh main) mặc định chế độ Máy chủ cửa hàng.

### Vận hành tiệm
- Mã VietQR và thông tin tiệm đọc lúc chạy từ máy chủ: đổi tài khoản ngân hàng / tên tiệm không cần build lại.
- Chủ tiệm lập **phiếu điều chỉnh** cho phiếu đã đóng (sửa dòng, ghi lý do; phiếu cũ giữ để đối chiếu).
- Tự sao lưu CSDL lúc 02:00 mỗi ngày, sao lưu bù khi máy bật lại sau đêm tắt máy.

### Rà soát 5 bất biến theo tệp yêu cầu
- Giữ chỗ không còn dùng được để đặt dịch vụ thợ không làm được; giữ chỗ phải đúng lưới 15 phút.
- Dời lịch / chuyển hàng loạt ghi trong giao dịch có khoá; đổi trạng thái đồng thời không làm lịch đã huỷ "sống lại".
- Thua cuộc tranh khung giờ không bị trừ hạn mức 5 lượt đặt / giờ.
- Ngày nghỉ theo giờ cắt ngang lịch hẹn được cảnh báo; giờ nghỉ giữa ca không đè lên lịch đã đặt.
- Phiếu đã đóng bất biến ở tầng CSDL (trigger); hai lượt điều chỉnh cùng lúc chỉ một lượt thành công.

## [1.4.0] - 2026-10-06

### Launcher HoYoSalon
- Một điểm vào duy nhất `HoYoSalon.bat`: cửa sổ Launcher nền tối kính mờ, nút lớn **BẮT ĐẦU** chạy toàn bộ hệ thống và tự mở ứng dụng khi sẵn sàng.
- Tự kiểm tra phiên bản mới trên GitHub; có bản mới thì nút đổi thành **CẬP NHẬT vX.Y.Z**, thanh tiến trình theo từng bước (tải mã → cài gói → build → sao lưu + migration → chạy lại).
- Bảng **Thông tin & Chẩn đoán**: phiên bản và trạng thái kết nối, nhật ký cập nhật, xem log Client / Server / CSDL / Cập nhật trực tiếp, xuất gói `system_logs.zip` (đã ẩn mật khẩu, khoá), sao chép thông tin thiết bị.

### Góp ý Mentor Sprint 2 (06/10/2026)
- Bảng ca làm việc gọn, dễ đọc: mỗi thợ một dòng, ca tô màu theo buổi, ngày tiệm nghỉ gạch chéo, đếm số thợ trực mỗi ngày.
- Bộ chọn giờ 24 giờ (00:00 → 23:45, bước 15 phút) cho ca làm, nghỉ giữa ca, nghỉ phép và giờ mở cửa.
- Trợ lý AI xếp lịch ngay trong màn hình tạo lịch: gợi ý khung giờ tốt nhất (sớm · vừa khít · cân bằng thợ) kèm lý do.
- AI sinh toàn bộ ngày lễ Việt Nam cả năm 1 cú nhấp (âm lịch thiên văn), không chèn lên ngày khách đã đặt.
- Thợ tự đăng ký ca làm / xin nghỉ cả tuần, quản lý duyệt (có thể chỉnh giờ) hoặc từ chối kèm lý do.
- Chân trang nền tối nổi bật: địa chỉ + chỉ đường, hotline, email, Facebook, Zalo, giờ mở cửa, đội ngũ chuyên viên.
- Trang chủ hiển thị dày hơn: lưới 4 cột liền mạch, 2 hàng + "Xem thêm", hết khoảng trống hai bên.
- Cảnh báo khung giờ mở cửa chưa có thợ trực, gợi ý thợ rảnh ít giờ làm nhất để xếp nhanh.
- Email xác nhận đặt lịch đầy đủ hơn, gửi ngay; khách chưa nhập email vẫn gửi được từ màn hình đặt lịch thành công.
- Tạm giữ chỗ 10 phút khi khách đang điền thông tin đặt lịch, có đồng hồ đếm ngược và nút giữ thêm.
- Quy trình nhánh Git chuẩn: main (Production) · develop (Staging) · feature/* · fix/* · docs/*.

### Cấu trúc dự án
- Sắp xếp lại thư mục chuẩn monorepo: `deploy/docker`, `backend/database`, `docs/{reports,presentations,requirements,feedback,testing,guides}`, `scripts/{windows,unix,ai,hoyo,lib}`.
- Thêm `scripts/update.mjs`, `scripts/backup.mjs`; bỏ mọi đường dẫn tuyệt đối ổ F:\ trong kịch bản.

## [1.3.6] - 2026-10-05
### Sửa lỗi
- Thống nhất số liệu khách (tổng lịch, lượt hoàn tất, lượt không đến) ở mọi màn hình.
- Chặn tạo / dời lịch vào ngày tiệm nghỉ lễ với thông báo nêu rõ lý do.

## [1.3.5] - 2026-10-04
### Cải tiến
- Cảnh báo tách lịch cố định ở thanh đặt lịch; khoá tra cứu 30 phút có đồng hồ đếm ngược.

## [1.3.4] - 2026-10-04
### Sửa lỗi
- QA vòng 3: làm sạch bản nháp đặt lịch, kiểm tra lịch tại quầy, mã tra cứu 8 ký tự, sửa ngày ISO.

## [1.3.3] - 2026-10-04
### Launcher
- Launcher 1-click vững chắc, tự tạo .env, mặc định chạy API thật (không rơi vào chế độ Demo).

## [1.3.2] - 2026-10-04
### Thêm mới
- Giới tính thợ cho ảnh đại diện; đồng bộ luật chế độ Demo (QA-01..08); runbook QA Sprint 2.

## [1.3.1] - 2026-10-03
### Bảo mật
- Gia cố kiểm tra DTO, giới hạn tần suất huỷ lịch, lint nghiêm ngặt.

## [1.3.0] - 2026-10-02
### Thêm mới
- Sửa 23 lỗi QA, lá chắn chống đặt trùng, thanh toán VietQR động, bộ kiểm thử hồi quy.

## [1.2.5] - 2026-09-28
### Launcher
- Tiến trình giám sát API/WEB, tự khởi động lại khi sập (0xC0000409), dừng sạch cả cây tiến trình.

## [1.2.0] - 2026-09-27
### Sửa lỗi
- Sửa 8 lỗi kiểm định Sprint 1, ảnh dự phòng ngoại tuyến, mật khẩu tạm và nút quay lại.

## [1.1.0] - 2026-09-25
### Giao diện
- Giao diện phong cách Fresha sáng sang trọng, chuyển động và ảnh riêng cho từng dịch vụ.
