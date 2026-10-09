# Runbook kiểm thử QA — cập nhật 06/10/2026

Dành cho tester **Trương Khánh**. Làm lần lượt từng bước, không bỏ bước. Bản rà soát **06/10/2026** (`fix/ac-audit-0610`, hợp nhất vào `develop` / `main`) bổ sung 7 lỗi vòng 3 ở mục 7b, 2 lỗi vòng 4 ở mục 7c và 2 lỗi vòng 5 ở mục 7d.

## 0. Vì sao lần trước thấy "lỗi"

`frontend/.env` bị gitignore nên máy mới clone **không có tệp này**. Trước đây `npm run dev` khi đó rơi vào **chế độ Demo**: toàn bộ dữ liệu giả nằm trong trình duyệt (`localStorage`), **không gọi NestJS/PostgreSQL**. Bản Demo cũ không có các luật QA-01 → QA-08, nên 8 lỗi lặp lại dù backend thật đã xử lý đúng (đã khoá bằng test tự động chạy trên PostgreSQL 16).

Bản này sửa tận gốc: giao diện **mặc định gọi API thật** (Demo chỉ bật khi `VITE_DEMO_MODE=true`), `scripts\windows\run_project.bat` / `scripts/unix/run_project.sh` tự tạo `.env` và luôn ép `VITE_DEMO_MODE=false`; backend thêm **giới tính thợ**; bản Demo được đưa về **đúng 8 luật như backend** (khoá dữ liệu nâng lên `salon.demo.v6`). **Cách nhanh nhất: bật Docker Desktop rồi chạy mục 6 (một lệnh), bỏ qua mục 4 và 5.** Mục 4 và 5 là cách làm từng bước bằng tay. Mục 9 là cách chạy Demo.

## 1. Yêu cầu máy

- Node.js ≥ 20 (`node -v`), Git, Docker Desktop **đang chạy**.
- Cổng trống: 3000, 5173, 5432, 1080, 5050. Máy có PostgreSQL riêng chiếm 5432: đặt `POSTGRES_PORT=5433` trong `.env` gốc và `DB_PORT=5433` trong `backend/.env`.

## 2. Lấy code mới

```bash
git fetch origin
git checkout develop
git pull --ff-only origin develop
git log --oneline -3
```

Kiểm tra không có thay đổi cục bộ trước khi cập nhật. Máy đang vận hành dùng **`scripts\windows\update_project.bat`**: lấy mã fast-forward, build, sao lưu trước migration và kiểm tra `/health`; lỗi sẽ bật lại bản build cũ. Không chạy seed mẫu trên máy vận hành.

## 3. Dọn dữ liệu cũ

Trong trình duyệt đang dùng để test: mở `http://localhost:5173`, nhấn **F12 → Application → Local Storage → http://localhost:5173**, xoá các khoá `salon.demo.v5`, `salon.demo.v6`, `salon.demoUserId`, `salon.bookingDraft`, `salon.lookupLockedUntil`.

Giữ CSDL hiện có và chạy migration; **không xoá volume PostgreSQL** khi kiểm thử lại. E2E tự tạo / xoá CSDL riêng có hậu tố `_test`, không dùng CSDL vận hành. Dữ liệu mẫu chỉ nạp trên máy phát triển / QA.

## 4. Cấu hình môi trường (chỉ khi không dùng `run_project`)

**Windows (cmd hoặc PowerShell):**

```bat
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env
```

**macOS / Linux:**

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Mở `frontend/.env`, kiểm tra đúng dòng `VITE_DEMO_MODE=false`.

## 5. Cài gói và dựng cơ sở dữ liệu

```bash
npm run install:all
npm run db:up
docker compose --project-directory . -f deploy/docker/docker-compose.yml ps
```

Đợi cột `STATUS` của `salon_postgres` ghi `healthy` (tối đa ~2 phút lần đầu), rồi áp dụng migration có phiên bản + dữ liệu mẫu trên máy QA. Bước này thêm cột `gender` cho thợ, cột `total_appointments` cho khách và tính lại số liệu của mọi khách từ bảng lịch hẹn:

```bash
npm run db:seed
```

Kết quả đúng: lệnh in ra danh sách tài khoản mẫu và kết thúc không lỗi.

## 6. Chạy hệ thống

**Một lệnh (khuyên dùng):** bật Docker Desktop rồi nhấp đúp `scripts\windows\run_project.bat` (Windows) / chạy `./scripts/unix/run_project.sh` (macOS, Linux). Script tự tạo `.env`, dựng PostgreSQL và Maildev bằng Docker, đợi PostgreSQL sẵn sàng, cài gói còn thiếu, nạp lược đồ + dữ liệu mẫu, đợi `GET /health` = 200 rồi mở `http://localhost:5173`. Nhấn Ctrl+C trong cửa sổ đó để dừng toàn bộ.

Làm bằng tay (sau khi đã xong mục 4 và 5):

```bash
npm run start:all
```

Kiểm tra:

```bash
curl http://localhost:3000/health
```

Mở `http://localhost:5173`. **Dấu hiệu đang ở API thật:** góc dưới bên phải **không** có ô *"Chế độ demo · Xem vai trò"*. Có ô đó là đang ở Demo: dừng hệ thống, chạy lại bằng `scripts\windows\run_project.bat` / `scripts/unix/run_project.sh`.

Tài khoản đăng nhập (mật khẩu theo README): `owner@salon.vn / Owner@123`, `reception@salon.vn / Reception@123`, `admin@salon.vn / Admin@123`, `stylist1@salon.vn … stylist5@salon.vn / Stylist@123`. Email xác nhận xem ở Maildev: `http://localhost:1080`.

## 7. Kiểm thử thủ công 9 lỗi

Dữ liệu mẫu thật: thứ 2–6 mở cửa **08:30 – 20:00**, thứ 7 và Chủ nhật **08:00 – 21:00**. Mỗi thợ nghỉ cố định một ngày trong tuần: Thu Hà nghỉ **thứ 2**, Minh Tuấn thứ 3, Bích Ngọc thứ 4, Quốc Bảo thứ 5, Kim Chi **Chủ nhật**. Ca chuẩn ngày thường 09:00–18:00 (nghỉ giữa ca 1 giờ) nên ca dài nhất khoảng **8 giờ**. Tiệm nghỉ lễ từ hôm nay + 21 đến + 23 ngày.

| # | Lỗi | Cách thử (đăng nhập `owner@salon.vn` cho các bước quản lý) | Kết quả đúng |
|---|---|---|---|
| 1 | Giới tính thợ / ảnh | Hồ sơ thợ → **Thêm thợ**. Nhập tên, chọn dịch vụ, **để trống giới tính** rồi bấm Tạo. Sau đó chọn **Nam**, không tải ảnh, tạo. Mở lại thợ đó, đổi sang **Nữ**, lưu | Bước đầu báo đỏ **"Vui lòng chọn giới tính Nam hoặc Nữ"**. Thợ Nam nhận ảnh nam, đổi sang Nữ thì ảnh đổi sang nữ. Ảnh tự gán không bao giờ sai giới. Trang đặt lịch và Lịch ngày hiển thị cùng ảnh |
| 2 | QA-01 ca ngoài giờ mở cửa | Ca làm → thêm ca cho một thợ vào **thứ 2–6** từ **08:00 đến 12:00**. Thử thêm 09:00–21:00 | Bị từ chối: **"Ca làm phải nằm trong giờ mở cửa của tiệm hôm đó (08:30 - 20:00)"**. Sửa một ca có sẵn sang 07:00 cũng bị chặn |
| 3 | QA-02 xoá ca đang có lịch | Lễ tân → Lịch ngày, tìm ngày có lịch hẹn của một thợ. Owner → Ca làm → xoá đúng ca của thợ đó ngày đó | Không xoá được. Hiện cửa sổ **liệt kê các lịch liên quan** (mã, giờ, tên khách) kèm hướng xử lý. Ca vẫn còn |
| 4 | QA-03 danh mục khách | Owner → Dịch vụ → tạo dịch vụ mới, **không gán thợ**. Mở `http://localhost:5173` (không đăng nhập) | Dịch vụ **không hiện** ở trang khách. Gán một thợ đang hoạt động thì hiện. Cho thợ duy nhất nghỉ việc thì lại ẩn |
| 5 | QA-04 tách 2 lần đặt | Dữ liệu mẫu không đủ để vượt 8 giờ (tối đa 5 dịch vụ, mỗi dịch vụ ≤ 120 phút), nên dựng tình huống: (a) Owner → Dịch vụ → thêm **"Liệu trình thử nghiệm"** 240 phút, giá 500000, chưa gán thợ. (b) Hồ sơ thợ → thêm thợ **"Thợ Thử Ca Ngắn"**, chọn giới tính, tick **chỉ** dịch vụ vừa tạo. (c) Ca làm → thêm cho thợ đó **một ca 09:00–13:00**, giữ nguyên giờ nghỉ mặc định 12:00–13:00 (làm việc thực tế **3 giờ**), vào một ngày thường trong 7 ngày tới. (d) Trang khách → chọn "Liệu trình thử nghiệm" | Trong thanh dính đáy, ngay trên nút *Tiếp tục*, hiện khung vàng **khuyên tách thành 2 hoặc nhiều lần hẹn** (xem mục 7c): dịch vụ 4 giờ vượt ca dài nhất 3 giờ. Bỏ ca đó (hoặc kéo dài ca để làm việc thực tế từ 4 giờ trở lên) thì cảnh báo biến mất |
| 6 | QA-05 tối đa 3 lịch / SĐT | Đặt lịch với **cùng một SĐT** (ví dụ `0987654321`) ba lần ở ba khung giờ khác nhau, rồi đặt lần thứ tư | Lần 4 bị từ chối: **"Số điện thoại này đang có 3 lịch hẹn chưa hoàn tất, vui lòng hoàn tất hoặc huỷ bớt trước khi đặt thêm"** |
| 7 | QA-06 5 lượt đặt / IP / giờ | **Xoá bộ đếm** (mục 8), rồi đặt 6 lịch trong vòng 1 giờ bằng **6 SĐT khác nhau**. Mở F12 → Network để xem phản hồi | 5 lượt đầu thành công. Lượt 6 trả **HTTP 429**, header **`Retry-After: 3600`**, thông báo **"Bạn đã đặt quá nhiều lịch trong một giờ, vui lòng thử lại sau"** |
| 8 | QA-07 khoá tra cứu | **Xoá bộ đếm** (mục 8). Trang *Tra cứu lịch hẹn* → nhập mã sai (ví dụ `AAAAAAAA`) **11 lần** | 10 lần đầu: "Không tìm thấy lịch hẹn với mã tra cứu này". Lần 11 trả **429**: **"Bạn đã tra cứu sai quá nhiều lần, vui lòng thử lại sau 30 phút"**. Trong 30 phút nhập mã đúng và bấm huỷ lịch cũng bị chặn. Giao diện khoá luôn nút Tra cứu (xem mục 7c) |
| 9 | QA-08 thợ không có ca | Trang khách → chọn dịch vụ → chọn một **ngày thứ 2** → chọn đích danh **Nguyễn Thu Hà**. Thử thêm một ngày xa hơn 30 ngày tới (chưa có ca) | Thu Hà **không có khung giờ nào**, không hiện là rảnh. Chọn "Thợ bất kỳ" thì không bao giờ được gán cho Thu Hà. Ngày chưa có ca nào thì không có khung giờ cho mọi thợ. Gửi thẳng API đặt lịch cũng bị từ chối |

## 7b. Kiểm thử 7 lỗi vòng 3 (bản v1.3.3)

Đăng nhập `reception@salon.vn` cho lỗi 2, các lỗi còn lại thử ở trang khách (không cần đăng nhập). Mã tra cứu giờ gồm **đúng 8 ký tự chữ hoặc số** (ví dụ `K7M2QP4X`), không còn tiền tố `SL-`.

| # | Lỗi | Cách thử | Kết quả đúng |
|---|---|---|---|
| A | Chọn 2 dịch vụ nhưng hiện "đã chọn 5/5" | Giả lập bản nháp cũ: F12 → Console, dán `localStorage.setItem('salon.bookingDraft', JSON.stringify({selected:[1,2,3,4,5].map(i=>({id:'cu-'+i,name:'Cũ '+i,durationMinutes:30,price:100000,priceText:'100.000đ'}))}))` rồi nhấn F5. Sau đó tick 2 dịch vụ bất kỳ và tải lại trang (F5) | Sau F5 đầu tiên **không dịch vụ nào bị tick** và không có dòng "đã chọn tối đa 5 dịch vụ". Tick 2 dịch vụ: chỉ đúng 2 dịch vụ được tô đậm, các dịch vụ còn lại **không bị mờ**, sang bước 2 tổng thời lượng bằng đúng 2 dịch vụ đó; tải lại trang vẫn giữ đúng 2 |
| B | Không xử lý được lịch / không thêm được khách vãng lai | Lễ tân → **Khách vãng lai** → nhập tên, SĐT, chọn dịch vụ, chọn thợ **đang có ca** và giờ trong ca (từ giờ hiện tại trở đi) → tạo. Vào Lịch ngày mở lịch vừa tạo, xem **lịch sử khách**, rồi bấm **Check-in → Bắt đầu → Hoàn tất**. Thử thêm: chọn giờ ngoài ca của thợ, và tạo trùng giờ với một lịch đã có | Lịch tạo thành công, vào thẳng **Đã xác nhận**, mở chi tiết và lịch sử khách không bị trắng trang. Check-in chỉ nhận trong khoảng 60 phút trước đến 60 phút sau giờ hẹn. Ngoài ca: **"Khung giờ không hợp lệ hoặc không còn trống"**. Trùng giờ: **"Khung giờ vừa có người đặt, vui lòng chọn khung giờ khác"** |
| C | Cảnh báo tách 2 lần đặt sai lúc | Dựng tình huống như dòng 5 ở mục 7 (dịch vụ 240 phút + thợ ca 3 giờ). Thử thêm một giỏ có tổng thời lượng **bằng đúng** ca dài nhất | Chỉ cảnh báo khi tổng thời lượng **lớn hơn** ca dài nhất trong 7 ngày tới của các thợ làm được dịch vụ đó. Bằng hoặc ngắn hơn thì không cảnh báo |
| D | Tối đa 3 lịch chưa hoàn tất / SĐT | Đặt 3 lịch cùng một SĐT (kể cả 1 lịch do lễ tân tạo ở quầy), rồi đặt lịch thứ 4. Huỷ 1 lịch rồi đặt lại | Lịch thứ 4 bị từ chối: **"Số điện thoại này đang có 3 lịch hẹn chưa hoàn tất, vui lòng hoàn tất hoặc huỷ bớt trước khi đặt thêm"**. Huỷ hoặc hoàn tất bớt 1 lịch thì đặt thêm được |
| E | 5 lượt đặt / IP / giờ | **Xoá bộ đếm** (mục 8), đặt 6 lịch trong 1 giờ bằng 6 SĐT khác nhau | Lượt 6 trả **HTTP 429**, mã **`RATE_LIMITED`**, header **`Retry-After: 3600`**. Lịch lễ tân tạo ở quầy không bị giới hạn này |
| F | Khoá tra cứu 30 phút | **Xoá bộ đếm** (mục 8), nhập mã sai 8 ký tự (ví dụ `AAAAAAAA`) **11 lần**. Thử thêm mã dài hơn 8 ký tự (ví dụ `SL-000911`) | 10 lần đầu "Không tìm thấy lịch hẹn…". Lần 11 trả **429**, mã **`LOOKUP_LOCKED`**, **`Retry-After` ≈ 1800 giây**, thông báo **"Bạn đã tra cứu sai quá nhiều lần, vui lòng thử lại sau 30 phút"**. Trong lúc khoá, mã đúng cũng không tra được; đủ 30 phút thì mở lại. Mã dài quá 8 ký tự báo **"Mã tra cứu gồm 8 ký tự chữ hoặc số"** và **không** tính là một lần sai |
| G | Thợ không có ca vẫn hiện rảnh / bị tự gán ở bước 3 | Giống dòng 9 ở mục 7. Thêm: chọn xong giờ rồi quay lại bước 2 đổi sang ngày thợ đó không có ca, sang bước 3. Với lễ tân: tạo khách vãng lai chọn thợ không có ca hôm đó | Bước 3 không liệt kê thợ không có ca là rảnh; thợ đã chọn từ trước mà không còn rảnh thì tự bỏ chọn về **"Thợ bất kỳ"**. "Thợ bất kỳ" không bao giờ gán thợ không có ca. Quầy cũng bị từ chối như dòng B |

## 7c. Kiểm thử 2 lỗi vòng 4 (bản v1.3.4)

| # | Lỗi | Cách thử | Kết quả đúng |
|---|---|---|---|
| H | Thiếu khuyên tách 2 hoặc nhiều lần hẹn khi dịch vụ vượt ca dài nhất | Dựng tình huống như dòng 5 ở mục 7 (dịch vụ 240 phút + thợ chỉ có ca làm thực tế 3 giờ), vào trang khách và chọn dịch vụ đó. Ở Demo: chọn "Uốn sóng lơi", "Một ngày thư giãn", "Nhuộm màu thời trang", "Liệu trình phục hồi tóc". Bấm **Tiếp tục** sang các bước sau, rồi bỏ bớt dịch vụ | Khung **vàng đậm** nằm trong thanh dính đáy, **ngay trên số dịch vụ, tổng tiền và nút Tiếp tục**, với đúng câu: *"⚠️ Tổng thời lượng dịch vụ (4 giờ) vượt quá ca làm việc dài nhất trong tuần (3 giờ). Quý khách nên tách thành 2 hoặc nhiều lần hẹn khác nhau để tiệm phục vụ trọn vẹn nhất!"* (Demo hiện 8 giờ 30 phút và 8 giờ). Khung vẫn hiện ở các bước 2, 3, 4 và biến mất khi tổng thời lượng không còn vượt ca |
| I | Nhập sai mã tra cứu quá 10 lần vẫn bấm Tra cứu được | **Xoá bộ đếm** (mục 8) và xoá khoá `salon.lookupLockedUntil` trong Local Storage. Trang *Tra cứu lịch hẹn* → nhập mã sai 8 ký tự (ví dụ `AAAAAAAA`, `AAAAAAAB`…) và bấm Tra cứu **11 lần**. Sau đó thử bấm nút, gõ vào ô nhập, đổi tab, rồi nhấn F5 | Lần 11 hiện khung vàng *"Bạn đã thử sai quá 10 lần. Chức năng tra cứu tạm khóa trong 30 phút để bảo mật thông tin."* kèm **đếm ngược mm:ss** (bắt đầu 30:00, giảm mỗi giây) và giờ mở lại. Nút đổi thành xám **"Tạm khoá · mm:ss"** và không bấm được; ô nhập và hai tab *Theo mã / Theo số điện thoại* bị khoá; không còn thẻ "Không tìm thấy lịch hẹn". Nhấn F5 vẫn khoá. Hết đếm ngược thì tự mở lại |

## 7d. Kiểm thử 2 lỗi vòng 5 (bản v1.3.5, QA 05/10/2026)

**Chạy `npm run db:migrate`** để cập nhật cấu trúc an toàn. Máy QA có thể dùng `scripts\windows\run_project.bat` (tự migration + seed mẫu); máy vận hành dùng `scripts\windows\update_project.bat` (không seed). Đăng nhập `reception@salon.vn / Reception@123`; riêng bước thêm ngày nghỉ dùng `owner@salon.vn / Owner@123`.

Ba số liệu của khách đều **đếm trực tiếp từ bảng lịch hẹn** và dùng đúng một bộ nhãn ở mọi màn hình: **Lượt hoàn tất** (lịch trạng thái Hoàn tất), **Lượt không đến** (lịch trạng thái Không đến), **Tổng lịch đã đặt** (mọi lịch từng đặt, kể cả đã huỷ và sắp tới).

| # | Lỗi | Cách thử | Kết quả đúng |
|---|---|---|---|
| J | Số liệu và lịch sử khách mỗi màn hình một kiểu | (1) Menu **Hồ sơ khách**: xem bảng, bấm **Xem** một khách (ví dụ Phan Thuỳ Linh, `0911000003`). (2) **Lịch ngày** → mở một lịch hẹn của khách đó → xem khối thông tin khách và mục **Lịch sử đặt lịch**. (3) **Khách vãng lai** → nhập SĐT `0911000003`, rồi thử một SĐT chưa từng có (ví dụ `0988000111`). (4) Tạo thêm 1 lịch cho khách đó, rồi tải lại trang Hồ sơ khách. Sau đó huỷ lịch vừa tạo | Bảng khách có 3 cột **Lượt hoàn tất · Lượt không đến · Tổng lịch đã đặt**; hộp hồ sơ, chi tiết lịch và thẻ *Khách quen* ở Khách vãng lai hiện **cùng ba con số** theo dạng *"Lượt hoàn tất: X · Lượt không đến: Y · Tổng lịch đã đặt: Z"*. Tiêu đề lịch sử nêu rõ *"Lịch sử đặt lịch (10 lịch gần nhất trong tổng Z lịch đã đặt)"*; lịch đang xem được gắn *"· lịch này"*. SĐT mới: 0 · 0 · 0. Tạo lịch mới: Tổng lịch đã đặt **tăng 1**, hai số còn lại giữ nguyên. Huỷ lịch: Tổng **giữ nguyên**. Hoàn tất một lịch: Lượt hoàn tất tăng 1 |
| K | Vẫn tạo / dời được lịch vào ngày nghỉ lễ | Owner → **Giờ mở cửa & ngày nghỉ**: dùng kỳ nghỉ mẫu *"Nghỉ bảo trì và đào tạo nội bộ"* (từ hôm nay + 21 đến + 23 ngày) hoặc thêm một ngày nghỉ mới, ví dụ **18/10/2026, lý do "Nghỉ Lễ"**. Lễ tân → **Khách vãng lai** → *Hẹn ngày/giờ khác* → chọn ngày nghỉ đó, nhập tên, SĐT, chọn dịch vụ. Sau đó mở một lịch đang *Chờ xác nhận / Đã xác nhận* → **Đổi thợ / Dời giờ** → đổi ngày sang ngày nghỉ. Cuối cùng đổi lại sang một ngày thường | Khách vãng lai: khung đỏ **"Tiệm nghỉ trong ngày này (Nghỉ Lễ). Không thể tạo lịch hẹn."** (đúng lý do đã nhập), nút **Tạo lịch** xám, không thợ nào ghi *Rảnh*, không có gợi ý giờ trống. Dời lịch: khung đỏ **"Tiệm nghỉ trong ngày này (Nghỉ Lễ). Không thể dời lịch hẹn vào ngày này."**, nút **Lưu thay đổi** xám, lịch gốc giữ nguyên. Chọn lại ngày thường: khung đỏ biến mất, đặt và dời bình thường. Gọi thẳng API (F12 → Network hoặc `curl`) `POST /api/appointments/walk-in` hay `PATCH /api/appointments/:id/reschedule` với ngày nghỉ: **HTTP 400**, mã **`SALON_CLOSED`**, cùng câu thông báo trên |

Kiểm tra chéo số liệu trong CSDL (cột bên trái phải bằng cột bên phải ở mọi hàng):

```bash
docker compose exec -T postgres psql -U salon -d salon_booking -c "SELECT c.phone, c.total_visits, c.no_show_count, c.total_appointments, COUNT(*) FILTER (WHERE a.status='completed') AS hoan_tat, COUNT(*) FILTER (WHERE a.status='no_show') AS khong_den, COUNT(a.id) AS tong FROM customers c LEFT JOIN appointments a ON a.customer_id=c.id GROUP BY c.id ORDER BY c.phone LIMIT 8;"
```

Chạy Demo: Demo **không** có sẵn ngày nghỉ, hãy đăng nhập vai Chủ tiệm và thêm một ngày nghỉ ở *Giờ mở cửa & ngày nghỉ* trước khi thử dòng K.

## 8. Đặt lại bộ đếm giới hạn (QA-06, QA-07)

Giới hạn tính theo IP; test trên cùng một máy nên dùng chung một IP. Muốn thử lại ngay không chờ hết giờ:

```bash
docker compose exec -T postgres psql -U salon -d salon_booking -c "DELETE FROM rate_limits;"
```

Giao diện tra cứu còn nhớ mốc khoá trong Local Storage (khoá `salon.lookupLockedUntil`): xoá khoá này nếu nút Tra cứu vẫn xám sau khi đã xoá bộ đếm. Cần đặt lại giữa các lần thử ở mục 7, 7b và 7c (mục 7d không bị giới hạn này), và sau khi thử xong để không ảnh hưởng người khác.

## 9. Chạy Demo (không cần máy chủ)

```bash
npm --prefix frontend run dev:demo
```

Xoá `salon.demo.v5`, `salon.demo.v6`, `salon.demoUserId` trong Local Storage trước khi mở. Bản Demo có ô *"Chế độ demo · Xem vai trò"* ở góc dưới bên phải và áp dụng cùng 8 luật như API thật (giờ mở cửa mẫu là 08:00 – 21:00, ca mẫu chỉ có từ 7 ngày trước đến 13 ngày sau, giới hạn 5 lượt đặt và 10 lượt tra sai tính theo trình duyệt này). Muốn về dữ liệu ban đầu: xoá khoá `salon.demo.v6` rồi tải lại trang. Riêng QA-04 ở Demo: chọn bốn dịch vụ "Uốn sóng lơi", "Một ngày thư giãn", "Nhuộm màu thời trang", "Liệu trình phục hồi tóc" (510 phút, vượt ca mẫu dài nhất 480 phút).

## 10. Cổng kiểm tra tự động — một lệnh, cần PostgreSQL đang chạy

Từ thư mục gốc, tester Trương Khánh chạy PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/tools/test_qa.ps1
```

Script dừng ngay khi một cổng lỗi. Các lệnh tương đương:

```powershell
npm run test --prefix backend
npm run test:e2e --prefix backend
node --test frontend/test/holidays.test.mjs
npm run lint --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
npm run typecheck --prefix backend
```

Kết quả kiểm định 06/10/2026: **139/139 unit**, **83/83 E2E trong 12 bộ**, **4/4 Demo**, lint hai ứng dụng 0 lỗi / 0 cảnh báo, Vite build và backend typecheck đạt. E2E tự tạo, seed và xoá CSDL `_test`; cần tài khoản PostgreSQL có quyền tạo CSDL. Không chạy `db:reset` trước test.

### Kiểm tra ngày nghỉ và nhật ký (S2-02, S1-09)

1. Owner tạo ngày nghỉ **18/10/2026**, lý do **Lễ**. Nếu ngày này có lịch hoạt động, phải thấy Dialog liệt kê tác động.
2. Trước xác nhận: không có bản ghi ngày nghỉ mới, không có nhật ký tạo ngày nghỉ. Bấm **Huỷ**, biểu mẫu giữ dữ liệu và vẫn chưa lưu.
3. Bấm tạo lại, chọn **Xác nhận tạo**. Network phải có lần gửi `force: true`; danh sách ngày nghỉ có bản ghi sau F5. Nhật ký có **đúng một** bản ghi tạo với ID ngày nghỉ thật.
4. Trang công khai không có khung giờ ngày nghỉ; tại quầy và dời lịch bị chặn. Gọi API trực tiếp trả **400 `SALON_CLOSED`**. Lịch cũ không bị huỷ tự động.
5. Ngày không có lịch bị ảnh hưởng: lưu ngay lần đầu, đúng một nhật ký. Lặp lại ở Demo; dữ liệu Demo tồn tại sau F5 trong cùng trình duyệt.


## 11. Nếu gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Vẫn thấy ô *"Chế độ demo"* | Bạn đang chạy Demo (`dev:demo`) hoặc `frontend/.env` đặt `VITE_DEMO_MODE=true`. Dừng hẳn rồi chạy lại bằng `scripts\windows\run_project.bat` / `scripts/unix/run_project.sh` (luôn ép API thật); Vite chỉ đọc `.env` lúc khởi động |
| Cửa sổ báo *"Máy chưa cài Docker"* hoặc *"Docker không phản hồi"* | Cài / bật Docker Desktop, đợi biểu tượng cá voi ở trạng thái *Engine running* rồi chạy lại. Không dùng được Docker thì tự cài PostgreSQL và chạy với `SALON_SKIP_DOCKER=1` (cmd: `set SALON_SKIP_DOCKER=1&& scripts\windows\run_project.bat`) |
| `npm run db:seed` báo `ECONNREFUSED` | Postgres chưa healthy: `docker compose --project-directory . -f deploy/docker/docker-compose.yml ps`, đợi rồi chạy lại. Chạy lại seed chỉ trên máy QA; seed đặt lại mật khẩu tài khoản mẫu |
| Cổng 5432 / 3000 / 5173 đã bị chiếm | Tắt tiến trình đang chiếm, hoặc đổi cổng như mục 1 |
| Thêm thợ báo thiếu giới tính dù đã chọn | Bạn đang chạy backend cũ: dừng hẳn `npm run start:all`, `git pull`, chạy lại và nhớ `npm run db:migrate` |
| Tra cứu báo "Mã tra cứu gồm 8 ký tự chữ hoặc số" | Mã tra cứu mới gồm đúng 8 ký tự (vd. `K7M2QP4X`), không có tiền tố `SL-`. Lấy mã ở trang xác nhận hoặc email trong Maildev |
| Bước 1 vẫn hiện số dịch vụ lạ | Xoá khoá `salon.bookingDraft` trong Local Storage rồi tải lại trang. Bản mới tự dọn bản nháp cũ khi tải danh mục dịch vụ |
| Nút Tra cứu vẫn xám, đếm ngược chưa hết | Giao diện nhớ mốc khoá. Xoá khoá `salon.lookupLockedUntil` trong Local Storage rồi tải lại trang (và xoá bộ đếm theo mục 8 nếu máy chủ cũng đang khoá) |
| Không thấy khung vàng tách lịch dù dịch vụ rất dài | Khung chỉ hiện khi tổng thời lượng **lớn hơn** ca dài nhất trong 7 ngày tới của các thợ làm được dịch vụ đó, và phải có ít nhất một ca được xếp. Kiểm tra lại ca làm của thợ (mục 7, dòng 5) |
| Bị 429 sớm hơn lượt thứ 6 | Mọi lượt thử đặt trong cùng một giờ (kể cả lượt bị từ chối vì trùng giờ, sai SĐT) đều tính vào hạn mức. Xoá bộ đếm theo mục 8 rồi thử lại |
| Hồ sơ khách không có cột *Tổng lịch đã đặt* hoặc số liệu bằng 0 | Backend / CSDL còn bản cũ: dừng hẳn hệ thống, `git pull`, chạy lại bằng `scripts\windows\run_project.bat` (hoặc `npm run db:migrate`) để thêm cột `total_appointments` và tính lại. Ở Demo: xoá khoá `salon.demo.v6` rồi tải lại trang |
| Không thấy khung đỏ "Tiệm nghỉ trong ngày này…" | Ngày đó chưa được khai báo nghỉ. Owner vào *Giờ mở cửa & ngày nghỉ* thêm ngày nghỉ (hoặc dùng kỳ nghỉ mẫu hôm nay + 21 đến + 23 ngày) rồi tải lại màn hình. Thợ đã có ca sẵn trong ngày nghỉ vẫn không nhận được lịch |
| Mãi không bị 429 / khoá | Kiểm tra `backend/.env`: `BOOKING_IP_LIMIT_PER_HOUR=5`, `LOOKUP_IP_LIMIT_PER_HOUR=10`, `LOOKUP_BLOCK_MINUTES=30`, `MAX_ACTIVE_BOOKINGS_PER_PHONE=3` (giá trị trong `.env.example`), rồi chạy lại backend |

Báo lỗi mới kèm: nhánh + mã commit (`git log -1 --oneline`), chế độ đang chạy (API thật hay Demo), các bước, ảnh chụp F12 → Network của yêu cầu lỗi.
