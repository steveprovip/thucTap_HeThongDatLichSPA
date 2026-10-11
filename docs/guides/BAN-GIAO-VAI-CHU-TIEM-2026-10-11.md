# Nhận bàn giao: góc nhìn chủ tiệm (Part 2)

Tôi là chủ một tiệm 7 thợ, máy quầy chạy Windows. Kỹ thuật viên giao lại phần mềm. Dưới đây là những gì tôi làm và chỗ
tôi bị vướng trong tuần đầu, kèm cách phần mềm đã sửa cho đỡ vướng.

## Ngày 1: thiết lập ban đầu

| Bước | Tôi làm | Vướng | Đã cải tiến |
|---|---|---|---|
| Tên tiệm, hotline, địa chỉ | Launcher › Thiết lập cửa hàng | Không biết mình còn sót mục nào | Đầu trang Thiết lập có danh sách **Việc cần làm trước khi mở bán** (✅ / ⚠️ / ⛔): tên còn là tên mẫu, hotline mẫu, chưa có VietQR, chưa có Gmail, khoá JWT mẫu |
| VietQR | Chọn ngân hàng, nhập số tài khoản | — | Tên chủ tài khoản tự chuyển thành chữ in hoa không dấu |
| Gmail gửi xác nhận | Mật khẩu ứng dụng 16 ký tự | Đa số khách không để email nên không nhận được mã | Thêm mục **Bắt buộc khách nhập email khi đặt online** (Có / Không). Chọn Không thì bước 4 nhắc rõ khách sẽ mất gì nếu bỏ trống |
| Giờ làm, ngày lễ | Giờ mở cửa | Gõ tay từng ngày lễ âm lịch rất mệt | Nút **Trợ lý AI › Ngày lễ** sinh đủ ngày lễ năm nay và năm sau, **Thêm N ngày lễ** bằng một chạm (bỏ qua ngày đã có hoặc đang có lịch khách) |
| Kiểm tra máy | — | Không biết máy đã đủ điều kiện chạy chưa | `npm run doctor` (hoặc `node scripts/launcher.mjs doctor`) in danh sách [OK] / [NÊN] / [LỖI]: Node, Git, PostgreSQL, cổng 3000, cấu hình tiệm |

## Hằng ngày: chỗ nhân viên vướng

| Ai | Vướng | Đã cải tiến |
|---|---|---|
| Lễ tân | Khách gọi hỏi "mấy giờ đẹp", phải nhẩm | Trợ lý › **Giờ vàng**: khung đông nhất (giữ cho khách chỉ rảnh giờ đó), khung vắng (mời khách linh hoạt), combo khách hay đặt cùng |
| Lễ tân | Bấm "Ghi nhận thanh toán" hai lần vì không chắc đã ghi chưa | Bấm xong thì nút thành **Đã thanh toán** và bị khoá; nút Đóng phiếu trở thành nút chính |
| Lễ tân | Danh sách chờ xác nhận dài, không sắp xếp được | Có ô sắp xếp: giờ hẹn cũ nhất / mới nhất, tên A–Z. Lịch quá 12 giờ luôn ở đầu |
| Lễ tân | Thợ làm lố giờ, khách sau ngồi chờ mới biết | Thông báo **ngay khi** lịch vượt chuẩn 20 phút, kèm mã lịch kế tiếp có nguy cơ trễ |
| Chủ tiệm | Bảng ca phải cuộn mới thấy hết tuần | Bảng ca thu gọn vừa một màn hình. Trợ lý hiện số đỏ khi tuần tới có giờ thiếu thợ, bấm **Xếp …** là tạo ca |
| Chủ tiệm | Khách đòi xoá thông tin cá nhân | Hồ sơ khách › **Xoá dữ liệu khách**: chưa có lịch thì xoá hẳn; đã có lịch thì ẩn danh, giữ doanh thu |

## Cập nhật một chạm mà không mất cấu hình

`backend/.env` (tên tiệm, VietQR, Gmail, khoá đăng nhập) không nằm trong Git nên **CẬP NHẬT** không ghi đè. Thêm hai lớp bảo vệ:

1. Trước khi tải bản mới, Launcher chụp `backend/.env` vào `backups/env/backend.env.<thời-điểm>` (giữ 10 bản).
2. Bản mới có tuỳ chọn mới (ví dụ `BOOKING_REQUIRE_EMAIL`, `AI_PROVIDER`) thì Launcher chép vào `.env` dưới dạng **dòng ghi chú**
   `#KHOÁ=giá-trị-mẫu`. Hành vi không đổi, không dòng nào của tiệm bị sửa. Chủ tiệm thấy tuỳ chọn mới và tự bật khi cần.

Mọi chức năng sẵn có của Launcher v1.6.0 được giữ nguyên: sao lưu pg_dump trước cập nhật, build ở thư mục tạm, quay về bản cũ khi lỗi,
kiểm tra phiên bản giao diện sau khi chạy lại.

## Bật Trợ lý AI có mô hình ngôn ngữ (tuỳ chọn)

```
ollama pull qwen2.5:3b          # máy quầy ≥ 8 GB RAM; 7b cần ≥ 16 GB
# backend/.env
AI_PROVIDER=ollama
AI_MODEL=qwen2.5:3b
AI_TIMEOUT_MS=15000
```

Không bật thì trợ lý vẫn trả lời bằng số liệu của tiệm. Mỗi câu trả lời ghi rõ nguồn: "AI · qwen2.5:3b" hoặc "Theo số liệu của tiệm".
