# Runbook test lại lỗi QA Sprint 2 (04/10/2027)

Dành cho tester **Trương Khánh**. Làm lần lượt từng bước, không bỏ bước. Bản **v1.3.3** (nhánh `fix/qa-round3-0410`) bổ sung 7 lỗi mới ở mục 7b.

## 0. Vì sao lần trước thấy "lỗi"

`frontend/.env` bị gitignore nên máy mới clone **không có tệp này**. Trước đây `npm run dev` khi đó rơi vào **chế độ Demo**: toàn bộ dữ liệu giả nằm trong trình duyệt (`localStorage`), **không gọi NestJS/PostgreSQL**. Bản Demo cũ không có các luật QA-01 → QA-08, nên 8 lỗi lặp lại dù backend thật đã xử lý đúng (đã khoá bằng test tự động chạy trên PostgreSQL 16).

Bản này sửa tận gốc: giao diện **mặc định gọi API thật** (Demo chỉ bật khi `VITE_DEMO_MODE=true`), `run_project.bat` / `run_project.sh` tự tạo `.env` và luôn ép `VITE_DEMO_MODE=false`; backend thêm **giới tính thợ**; bản Demo được đưa về **đúng 8 luật như backend** (khoá dữ liệu nâng lên `salon.demo.v6`). **Cách nhanh nhất: bật Docker Desktop rồi chạy mục 6 (một lệnh), bỏ qua mục 4 và 5.** Mục 4 và 5 là cách làm từng bước bằng tay. Mục 9 là cách chạy Demo.

## 1. Yêu cầu máy

- Node.js ≥ 20 (`node -v`), Git, Docker Desktop **đang chạy**.
- Cổng trống: 3000, 5173, 5432, 1080, 5050. Máy có PostgreSQL riêng chiếm 5432: đặt `POSTGRES_PORT=5433` trong `.env` gốc và `DB_PORT=5433` trong `backend/.env`.

## 2. Lấy code mới

```bash
git fetch origin
git checkout fix/qa-round3-0410
git pull origin fix/qa-round3-0410
git log --oneline -3
```

Nếu nhánh đã được merge vào `develop` thì: `git checkout develop && git pull origin develop`.

## 3. Dọn dữ liệu cũ

Trong trình duyệt đang dùng để test: mở `http://localhost:5173`, nhấn **F12 → Application → Local Storage → http://localhost:5173**, xoá các khoá `salon.demo.v5`, `salon.demo.v6`, `salon.demoUserId`, `salon.bookingDraft` (hoặc bấm *Clear All*).

Dọn cơ sở dữ liệu cũ (xoá volume Postgres):

```bash
docker compose down -v
```

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
docker compose ps
```

Đợi cột `STATUS` của `salon_postgres` ghi `healthy` (tối đa ~2 phút lần đầu), rồi nạp lược đồ + dữ liệu mẫu. Bước này thêm cột `gender` cho thợ và đặt giới tính 5 thợ mẫu:

```bash
npm run db:seed
```

Kết quả đúng: lệnh in ra danh sách tài khoản mẫu và kết thúc không lỗi.

## 6. Chạy hệ thống

**Một lệnh (khuyên dùng):** bật Docker Desktop rồi nhấp đúp `run_project.bat` (Windows) / chạy `./run_project.sh` (macOS, Linux). Script tự tạo `.env`, dựng PostgreSQL và Maildev bằng Docker, đợi PostgreSQL sẵn sàng, cài gói còn thiếu, nạp lược đồ + dữ liệu mẫu, đợi `GET /health` = 200 rồi mở `http://localhost:5173`. Nhấn Ctrl+C trong cửa sổ đó để dừng toàn bộ.

Làm bằng tay (sau khi đã xong mục 4 và 5):

```bash
npm run start:all
```

Kiểm tra:

```bash
curl http://localhost:3000/health
```

Mở `http://localhost:5173`. **Dấu hiệu đang ở API thật:** góc dưới bên phải **không** có ô *"Chế độ demo · Xem vai trò"*. Có ô đó là đang ở Demo: dừng hệ thống, chạy lại bằng `run_project.bat` / `run_project.sh`.

Tài khoản đăng nhập (mật khẩu theo README): `owner@salon.vn / Owner@123`, `reception@salon.vn / Reception@123`, `admin@salon.vn / Admin@123`, `stylist1@salon.vn … stylist5@salon.vn / Stylist@123`. Email xác nhận xem ở Maildev: `http://localhost:1080`.

## 7. Kiểm thử thủ công 9 lỗi

Dữ liệu mẫu thật: thứ 2–6 mở cửa **08:30 – 20:00**, thứ 7 và Chủ nhật **08:00 – 21:00**. Mỗi thợ nghỉ cố định một ngày trong tuần: Thu Hà nghỉ **thứ 2**, Minh Tuấn thứ 3, Bích Ngọc thứ 4, Quốc Bảo thứ 5, Kim Chi **Chủ nhật**. Ca chuẩn ngày thường 09:00–18:00 (nghỉ giữa ca 1 giờ) nên ca dài nhất khoảng **8 giờ**. Tiệm nghỉ lễ từ hôm nay + 21 đến + 23 ngày.

| # | Lỗi | Cách thử (đăng nhập `owner@salon.vn` cho các bước quản lý) | Kết quả đúng |
|---|---|---|---|
| 1 | Giới tính thợ / ảnh | Hồ sơ thợ → **Thêm thợ**. Nhập tên, chọn dịch vụ, **để trống giới tính** rồi bấm Tạo. Sau đó chọn **Nam**, không tải ảnh, tạo. Mở lại thợ đó, đổi sang **Nữ**, lưu | Bước đầu báo đỏ **"Vui lòng chọn giới tính Nam hoặc Nữ"**. Thợ Nam nhận ảnh nam, đổi sang Nữ thì ảnh đổi sang nữ. Ảnh tự gán không bao giờ sai giới. Trang đặt lịch và Lịch ngày hiển thị cùng ảnh |
| 2 | QA-01 ca ngoài giờ mở cửa | Ca làm → thêm ca cho một thợ vào **thứ 2–6** từ **08:00 đến 12:00**. Thử thêm 09:00–21:00 | Bị từ chối: **"Ca làm phải nằm trong giờ mở cửa của tiệm hôm đó (08:30 - 20:00)"**. Sửa một ca có sẵn sang 07:00 cũng bị chặn |
| 3 | QA-02 xoá ca đang có lịch | Lễ tân → Lịch ngày, tìm ngày có lịch hẹn của một thợ. Owner → Ca làm → xoá đúng ca của thợ đó ngày đó | Không xoá được. Hiện cửa sổ **liệt kê các lịch liên quan** (mã, giờ, tên khách) kèm hướng xử lý. Ca vẫn còn |
| 4 | QA-03 danh mục khách | Owner → Dịch vụ → tạo dịch vụ mới, **không gán thợ**. Mở `http://localhost:5173` (không đăng nhập) | Dịch vụ **không hiện** ở trang khách. Gán một thợ đang hoạt động thì hiện. Cho thợ duy nhất nghỉ việc thì lại ẩn |
| 5 | QA-04 tách 2 lần đặt | Dữ liệu mẫu không đủ để vượt 8 giờ (tối đa 5 dịch vụ, mỗi dịch vụ ≤ 120 phút), nên dựng tình huống: (a) Owner → Dịch vụ → thêm **"Liệu trình thử nghiệm"** 240 phút, giá 500000, chưa gán thợ. (b) Hồ sơ thợ → thêm thợ **"Thợ Thử Ca Ngắn"**, chọn giới tính, tick **chỉ** dịch vụ vừa tạo. (c) Ca làm → thêm cho thợ đó **một ca 3 giờ** (09:00–12:00) vào một ngày thường trong 7 ngày tới. (d) Trang khách → chọn "Liệu trình thử nghiệm" | Ngay bước chọn dịch vụ hiện **cảnh báo nên tách thành 2 lần hẹn**: dịch vụ 4 giờ vượt ca dài nhất 3 giờ. Bỏ ca đó (hoặc kéo dài ca lên 4 giờ trở lên) thì cảnh báo biến mất |
| 6 | QA-05 tối đa 3 lịch / SĐT | Đặt lịch với **cùng một SĐT** (ví dụ `0987654321`) ba lần ở ba khung giờ khác nhau, rồi đặt lần thứ tư | Lần 4 bị từ chối: **"Số điện thoại này đang có 3 lịch hẹn chưa hoàn tất, vui lòng hoàn tất hoặc huỷ bớt trước khi đặt thêm"** |
| 7 | QA-06 5 lượt đặt / IP / giờ | **Xoá bộ đếm** (mục 8), rồi đặt 6 lịch trong vòng 1 giờ bằng **6 SĐT khác nhau**. Mở F12 → Network để xem phản hồi | 5 lượt đầu thành công. Lượt 6 trả **HTTP 429**, header **`Retry-After: 3600`**, thông báo **"Bạn đã đặt quá nhiều lịch trong một giờ, vui lòng thử lại sau"** |
| 8 | QA-07 khoá tra cứu | **Xoá bộ đếm** (mục 8). Trang *Tra cứu lịch hẹn* → nhập mã sai (ví dụ `AAAAAAAA`) **11 lần** | 10 lần đầu: "Không tìm thấy lịch hẹn với mã tra cứu này". Lần 11 trả **429**: **"Bạn đã tra cứu sai quá nhiều lần, vui lòng thử lại sau 30 phút"**. Trong 30 phút nhập mã đúng và bấm huỷ lịch cũng bị chặn |
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

## 8. Đặt lại bộ đếm giới hạn (QA-06, QA-07)

Giới hạn tính theo IP; test trên cùng một máy nên dùng chung một IP. Muốn thử lại ngay không chờ hết giờ:

```bash
docker compose exec -T postgres psql -U salon -d salon_booking -c "DELETE FROM rate_limits;"
```

Cần đặt lại giữa các lần thử ở mục 7 và 7b, và sau khi thử xong để không ảnh hưởng người khác.

## 9. Chạy Demo (không cần máy chủ)

```bash
npm --prefix frontend run dev:demo
```

Xoá `salon.demo.v5`, `salon.demo.v6`, `salon.demoUserId` trong Local Storage trước khi mở. Bản Demo có ô *"Chế độ demo · Xem vai trò"* ở góc dưới bên phải và áp dụng cùng 8 luật như API thật (giờ mở cửa mẫu là 08:00 – 21:00, ca mẫu chỉ có từ 7 ngày trước đến 13 ngày sau, giới hạn 5 lượt đặt và 10 lượt tra sai tính theo trình duyệt này). Muốn về dữ liệu ban đầu: xoá khoá `salon.demo.v6` rồi tải lại trang. Riêng QA-04 ở Demo: chọn bốn dịch vụ "Uốn sóng lơi", "Một ngày thư giãn", "Nhuộm màu thời trang", "Liệu trình phục hồi tóc" (510 phút, vượt ca mẫu dài nhất 480 phút).

## 10. Kiểm tra tự động (tuỳ chọn, cần CSDL đang chạy và đã seed)

```bash
npm test
npm run test:e2e
npm run lint
npm --prefix frontend run build
```

Kết quả mong đợi: `npm test` 100/100, `npm run test:e2e` 55/55 (8 bộ), lint không lỗi và không cảnh báo, build thành công. Các test e2e tự xoá bộ đếm giới hạn trước và sau khi chạy.

## 11. Nếu gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Vẫn thấy ô *"Chế độ demo"* | Bạn đang chạy Demo (`dev:demo`) hoặc `frontend/.env` đặt `VITE_DEMO_MODE=true`. Dừng hẳn rồi chạy lại bằng `run_project.bat` / `run_project.sh` (luôn ép API thật); Vite chỉ đọc `.env` lúc khởi động |
| Cửa sổ báo *"Máy chưa cài Docker"* hoặc *"Docker không phản hồi"* | Cài / bật Docker Desktop, đợi biểu tượng cá voi ở trạng thái *Engine running* rồi chạy lại. Không dùng được Docker thì tự cài PostgreSQL và chạy với `SALON_SKIP_DOCKER=1` (cmd: `set SALON_SKIP_DOCKER=1&& run_project.bat`) |
| `npm run db:seed` báo `ECONNREFUSED` | Postgres chưa healthy: `docker compose ps`, đợi rồi chạy lại. Chạy lại seed bao nhiêu lần cũng an toàn |
| Cổng 5432 / 3000 / 5173 đã bị chiếm | Tắt tiến trình đang chiếm, hoặc đổi cổng như mục 1 |
| Thêm thợ báo thiếu giới tính dù đã chọn | Bạn đang chạy backend cũ: dừng hẳn `npm run start:all`, `git pull`, chạy lại và nhớ `npm run db:seed` |
| Tra cứu báo "Mã tra cứu gồm 8 ký tự chữ hoặc số" | Mã tra cứu mới gồm đúng 8 ký tự (vd. `K7M2QP4X`), không có tiền tố `SL-`. Lấy mã ở trang xác nhận hoặc email trong Maildev |
| Bước 1 vẫn hiện số dịch vụ lạ | Xoá khoá `salon.bookingDraft` trong Local Storage rồi tải lại trang. Bản mới tự dọn bản nháp cũ khi tải danh mục dịch vụ |
| Bị 429 sớm hơn lượt thứ 6 | Mọi lượt thử đặt trong cùng một giờ (kể cả lượt bị từ chối vì trùng giờ, sai SĐT) đều tính vào hạn mức. Xoá bộ đếm theo mục 8 rồi thử lại |
| Mãi không bị 429 / khoá | Kiểm tra `backend/.env`: `BOOKING_IP_LIMIT_PER_HOUR=5`, `LOOKUP_IP_LIMIT_PER_HOUR=10`, `LOOKUP_BLOCK_MINUTES=30`, `MAX_ACTIVE_BOOKINGS_PER_PHONE=3` (giá trị trong `.env.example`), rồi chạy lại backend |

Báo lỗi mới kèm: nhánh + mã commit (`git log -1 --oneline`), chế độ đang chạy (API thật hay Demo), các bước, ảnh chụp F12 → Network của yêu cầu lỗi.
