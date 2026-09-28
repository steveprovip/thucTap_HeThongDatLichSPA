# Hệ thống đặt lịch Salon - Spa

Ứng dụng web quản lý lịch hẹn và vận hành ca làm cho một salon quy mô vừa (6–8 thợ).
Khách tự đặt lịch trên trang công khai theo đúng khung giờ thợ còn rảnh; tiệm theo dõi trọn
vòng đời lịch hẹn từ lúc đặt đến lúc thu tiền và nhận đánh giá.

Toàn bộ 39 user story / 6 epic / 165 point trong Product Backlog đều đã được cài đặt —
xem bảng đối chiếu tại [`docs/BACKLOG-MAPPING.md`](docs/BACKLOG-MAPPING.md).

---

## Chạy dự án bằng MỘT lệnh

**Windows**

```bat
run_project.bat
```

**macOS / Linux**

```bash
./run_project.sh
```

Chỉ cần **bật Docker Desktop** rồi nhấp đúp `run_project.bat` (hoặc chạy `./run_project.sh`). Script sẽ:

1. Kiểm tra Node.js ≥ 20 và chờ Docker sẵn sàng (tối đa 2 phút; Windows/macOS tự thử mở Docker Desktop).
2. `docker compose up -d` — PostgreSQL 15 (healthcheck qua TCP) + PgAdmin + Maildev.
3. Tạo các tệp `.env` còn thiếu; **tự cài lại gói khi `package.json`/`package-lock.json` đổi** (vd. sau `git pull`).
4. Kiểm tra cổng 3000/5173 còn trống; nếu hệ thống đang chạy ở cửa sổ khác thì chỉ mở trình duyệt.
5. Nạp lược đồ + dữ liệu mẫu (tự chờ PostgreSQL tới 120 giây, chạy lại bao nhiêu lần cũng an toàn).
6. Chạy song song API + giao diện; **trình duyệt chỉ mở khi `GET /health` trả 200** (API biên dịch xong
   và truy vấn được CSDL) và Vite đã phản hồi.

Biến tuỳ chọn: `SALON_SKIP_DOCKER=1` (dùng PostgreSQL riêng theo `backend/.env`), `SALON_NO_BROWSER=1`.
Máy đã cài sẵn PostgreSQL chiếm cổng 5432? Đặt `POSTGRES_PORT=5433` trong `.env` và `DB_PORT=5433` trong `backend/.env`.

| Thành phần | Địa chỉ |
|---|---|
| Giao diện | http://localhost:5173 |
| API | http://localhost:3000/api |
| Tài liệu API (Swagger) | http://localhost:3000/api/docs |
| Hộp thư ảo (Maildev) | http://localhost:1080 |
| PgAdmin | http://localhost:5050 |

### Tài khoản mẫu

Dùng **giống hệt nhau** ở cả hai chế độ: Full-Stack (NestJS + PostgreSQL, `database/seed.sql`) và
Demo không cần máy chủ (`npm run dev:demo`, dữ liệu trong trình duyệt — `frontend/src/api/mockBackend.ts`).

| Vai trò | Họ tên | Email | Mật khẩu |
|---|---|---|---|
| Quản trị hệ thống | Quản trị hệ thống | `admin@salon.vn` | `Admin@123` |
| Chủ tiệm | Nguyễn Hoàng Anh | `owner@salon.vn` | `Owner@123` |
| Lễ tân | Đỗ Thanh Mai | `reception@salon.vn` | `Reception@123` |
| Thợ 1 | Nguyễn Thu Hà | `stylist1@salon.vn` | `Stylist@123` |
| Thợ 2 | Trần Minh Tuấn | `stylist2@salon.vn` | `Stylist@123` |
| Thợ 3 | Lê Thị Bích Ngọc | `stylist3@salon.vn` | `Stylist@123` |
| Thợ 4 | Phạm Quốc Bảo | `stylist4@salon.vn` | `Stylist@123` |
| Thợ 5 | Võ Kim Chi | `stylist5@salon.vn` | `Stylist@123` |

- Mỗi lần chạy launcher / `npm run db:seed`, 8 tài khoản trên được **đưa về đúng mật khẩu ở bảng**, mở khoá và
  bỏ cờ bắt đổi mật khẩu — thử "đổi mật khẩu" hay nhập sai 5 lần xong, chạy lại là đăng nhập 1 chạm được ngay.
- Trang **Đăng nhập** có khối *Đăng nhập nhanh* (hiện ở bản demo và khi chạy `npm run dev`): bấm một vai trò là
  điền đúng email + mật khẩu ở bảng trên và đăng nhập ngay.
- **Nhân sự mới** do Quản trị tạo (mục *Tài khoản nhân sự*) hoặc Chủ tiệm tạo kèm email (mục *Hồ sơ thợ*) nhận
  **mật khẩu tạm ngẫu nhiên** (10 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt). Mật khẩu hiển thị ngay trong hộp
  thoại *“Nhân sự mới đã được tạo thành công!”* kèm nút **Sao chép mật khẩu**, đồng thời được gửi qua email
  (xem ở Maildev http://localhost:1080). Lần đăng nhập đầu tiên bắt buộc đổi mật khẩu. Nút 🔑 *Cấp lại mật khẩu tạm*
  hoạt động tương tự.
- Bản demo lưu dữ liệu trong `localStorage` (khoá `salon.demo.v5`). Muốn về dữ liệu mẫu ban đầu: xoá khoá đó
  trong DevTools → Application → Local Storage rồi tải lại trang.

Khách hàng **không cần tài khoản** — đặt lịch và tra cứu bằng số điện thoại / mã 8 ký tự.

---

## Kiến trúc

```
du_an/
├── docker-compose.yml          PostgreSQL 15 · PgAdmin · Maildev (SMTP thử nghiệm)
├── run_project.bat / .sh       Khởi chạy một lệnh
├── database/
│   ├── schema.sql              DDL đầy đủ: ràng buộc EXCLUDE, CHECK, index, view, trigger
│   └── seed.sql                5 thợ · 12 dịch vụ · 4 vai trò nội bộ · ~400 lịch hẹn mẫu
├── backend/                    NestJS 10 + TypeORM + PostgreSQL
│   └── src/
│       ├── common/             Guard (JWT, RBAC), decorator, filter, interceptor ghi nhật ký, tiện ích
│       ├── config/             Cấu hình ứng dụng, CSDL, JWT, SMTP
│       ├── database/entities/  24 entity ánh xạ đúng lược đồ SQL
│       └── modules/
│           ├── auth/           Đăng nhập, JWT 30m/7d, khoá 15 phút sau 5 lần sai, quên mật khẩu
│           ├── users/          Quản trị tài khoản nhân sự, 5 vai trò
│           ├── services/       Nhóm dịch vụ, dịch vụ (15–240 phút, ≤ 20.000.000 đ)
│           ├── stylists/       Hồ sơ thợ, kỹ năng, ca làm theo tuần, ngày nghỉ riêng
│           ├── working-hours/  Giờ mở cửa theo thứ, ngày nghỉ của tiệm
│           ├── booking-engine/ Bộ tính khung giờ trống + lá chắn chống đặt trùng
│           ├── customers/      Hồ sơ khách gộp theo SĐT, lịch sử dịch vụ
│           ├── invoices/       Phiếu tính tiền, mã giảm giá, phiếu điều chỉnh
│           ├── reviews/        Đánh giá 1–5 sao bằng liên kết dùng một lần
│           ├── notifications/  Hàng đợi email (3 lần thử) + thông báo trong ứng dụng
│           ├── analytics/      Doanh thu theo thợ/dịch vụ, mật độ khung giờ, xuất CSV
│           └── audit/          Nhật ký hoạt động chỉ đọc
└── frontend/                   React 18 + TypeScript + Vite + TailwindCSS + Lucide + Recharts
    └── src/
        ├── api/                Axios client tự làm mới access token
        ├── components/         Modal, Toast, Badge, StarRating, DateNav, chuông thông báo…
        ├── contexts/           AuthContext, ToastContext, BookingContext
        ├── layouts/            PublicLayout (mobile-first), AdminLayout (sidebar theo quyền)
        └── pages/
            ├── public/         Trang dịch vụ, Booking Wizard 4 bước, tra cứu, đánh giá
            ├── auth/           Đăng nhập, quên / đặt lại / đổi mật khẩu
            ├── reception/      Lịch ngày dạng cột, chờ xác nhận, khách vãng lai, phiếu tính tiền
            ├── stylist/        Lịch cá nhân, bắt đầu/hoàn tất, ghi chú kỹ thuật
            ├── owner/          Tổng quan hôm nay, doanh thu, mật độ khung giờ
            └── admin/          Tài khoản, nhật ký, dịch vụ, thợ, ca làm, giờ mở cửa, mã giảm giá
```

---

## Ba điểm kỹ thuật đáng chú ý

### 1. Bộ tính khung giờ trống là hàm thuần

`backend/src/modules/booking-engine/slot-calculator.ts` không phụ thuộc cơ sở dữ liệu hay
múi giờ — chỉ làm việc với số phút kể từ 00:00. Nhờ vậy 35 ca kiểm thử đơn vị
(`slot-calculator.spec.ts`) chạy trong vài giây và phủ được ca gãy, nghỉ giữa ca,
ngày nghỉ, gói nhiều dịch vụ cộng dồn 30/60/120/150 phút.

### 2. Lá chắn chống đặt trùng có ba lớp

| Lớp | Vị trí | Vai trò |
|---|---|---|
| Giao dịch `SERIALIZABLE` | `booking.service.ts` | Cô lập hoàn toàn hai luồng đặt lịch |
| `SELECT … FOR UPDATE` trên bản ghi thợ | `booking.service.ts` | Hai yêu cầu cùng một thợ buộc xếp hàng |
| `EXCLUDE USING gist (stylist_id WITH =, tstzrange(start_at, end_at) WITH &&)` | `schema.sql` | Chốt chặn cuối ở tầng CSDL, đúng cả khi ghi thẳng vào bảng |

Bộ kiểm thử `test/booking-concurrency.e2e-spec.ts` bắn 20 yêu cầu đồng thời vào một khung
giờ và khẳng định **đúng 1 thành công, 19 nhận 409** kèm thông điệp tiếng Việt.

### 3. Quy ước thời gian và tiền tệ

Mọi mốc tuyệt đối lưu `TIMESTAMPTZ`, quy đổi sang `Asia/Ho_Chi_Minh` ở tầng hiển thị.
Tiền hiển thị dạng `250.000 đ`, giờ dạng `14:30`. Chi tiết: [`docs/TIMEZONE.md`](docs/TIMEZONE.md).

---

## Lệnh thường dùng

```bash
npm run install:all      # cài gói cho backend + frontend
npm run db:up            # chỉ dựng docker (postgres, pgadmin, maildev)
npm run db:reset         # xoá volume và dựng lại từ đầu
npm run db:seed          # nạp lại dữ liệu mẫu (chạy lại nhiều lần vẫn an toàn)
npm run start:all        # chạy song song API + giao diện
npm run start:launch     # như trên + tự mở trình duyệt khi /health = 200 (launcher dùng lệnh này)
npm run build            # build backend và frontend cho môi trường thật
npm test                 # 35 kiểm thử đơn vị bộ tính khung giờ
npm run test:e2e         # 25 kiểm thử end-to-end (cần CSDL đang chạy)
npm run lint             # ESLint cho cả hai phía
```

---

## Kiểm thử

| Bộ | Lệnh | Nội dung |
|---|---|---|
| Đơn vị | `npm test` | 35 ca cho bộ tính khung giờ trống |
| Phân quyền | `npm run test:e2e` | Đối chiếu 17 endpoint × 4 vai trò, khoá 15 phút sau 5 lần sai |
| Chống đặt trùng | `npm run test:e2e` | 20 yêu cầu đồng thời → đúng 1 thành công |
| End-to-end | `npm run test:e2e` | Đặt → xác nhận → check-in → hoàn tất → tính tiền → đánh giá → báo cáo |

---

## Nhật ký sửa lỗi — Sprint 1 · Lỗi 2 (27/09/2026)

| # | Lỗi được báo | Cách khắc phục |
|---|---|---|
| 1 | Ảnh dịch vụ lỗi / trống trên giao diện khách | `SmartImage` (`components/Media.tsx`) tự chuyển sang nền gradient theo chủ đề (kéo — Tóc, giọt nước — Gội, lấp lánh — Da, bàn tay — Massage, viên ngọc — Combo) khi ảnh lỗi, mất mạng hoặc tải quá 8 giây. Không còn khung ảnh vỡ. |
| 2 | Đăng nhập đúng email + mật khẩu nhưng bị từ chối | Dữ liệu demo dùng `@lumi.vn` / `demo1234` → đổi sang đúng bộ tài khoản ở bảng trên; khoá dữ liệu demo nâng lên `salon.demo.v5` để trình duyệt tự nạp lại dữ liệu mới. |
| 3 | Email trong README và trên web không khớp | Một nguồn duy nhất `DEMO_ACCOUNTS` / `DEMO_PASSWORDS` (`frontend/src/utils/constants.ts`) dùng chung cho mockBackend và nút đăng nhập nhanh, khớp `database/seed.sql` và README. |
| 4 | Tạo nhân sự mới không biết mật khẩu | API `POST /users`, `POST /users/:id/reset-password`, `POST /stylists` trả thêm `tempPassword`; giao diện hiện hộp thoại có nút *Sao chép mật khẩu*. |
| 5 | Khách vãng lai mới tạo đã “đi 3 lần” | Bỏ số liệu gán cứng; lượt đến / không đến tính từ lịch sử thật theo **đúng số điện thoại**. SĐT mới luôn 0 lượt, lịch sử rỗng. |
| 6 | Lịch vãng lai vừa tạo không hiện trong danh mục | Trang *Khách vãng lai* hiển thị cả lịch hẹn ngày khác (tab *Sắp tới*); mọi thao tác ghi phát sự kiện đồng bộ nên *Lịch ngày*, *Danh sách lịch hẹn*, *Chờ xác nhận*… tự làm mới ngay (kể cả tab khác). *Lịch ngày* có nút tạo khách vãng lai. |
| 7 | Dịch vụ đã có lịch hẹn vẫn xoá được, lịch hẹn mất thông tin dịch vụ | Lịch tạo tại quầy giữ đúng dịch vụ do tiệm tự thêm. Dịch vụ có lịch hẹn: nút xoá bị khoá kèm chú thích *“Dịch vụ đã có lịch hẹn, chỉ có thể ngừng kinh doanh”*, bấm vào sẽ đề nghị chuyển sang **Ngừng kinh doanh**. API trả `appointmentCount` cho từng dịch vụ và vẫn chặn xoá (409). |
| 8 | Thiếu nút quay lại | Thành phần `<BackButton />` (← Quay lại) trên mọi trang con khu quản lý, trang tra cứu / đánh giá, từng bước đặt lịch và ngăn kéo chi tiết lịch hẹn. |

### Rà soát toàn hệ thống với máy chủ thật (28/09/2026)

Chạy NestJS + PostgreSQL với `seed.sql`, đăng nhập từng vai trò và mở mọi trang bằng trình duyệt tự động:

| Lỗi | Nguyên nhân | Khắc phục |
|---|---|---|
| *Tổng quan hôm nay* trống, báo “Hệ thống gặp sự cố” | `GET /appointments` lỗi 500: TypeORM dùng `orderBy('a.start_at')` cùng `skip/take` + JOIN | Đổi sang tên thuộc tính (`a.startAt`) ở mọi truy vấn phân trang (lịch hẹn, tra cứu, khách, phiếu, tài khoản) |
| *Hồ sơ thợ* “Không tìm thấy thợ nào”, báo `limit must not be greater than 200` | Trang gửi `limit=1000` trong khi API tối đa 200 | `appointmentsApi.listAll()` tự lật trang 200 dòng; số liệu công suất lỗi không còn làm trống danh sách thợ |
| Ảnh “Trị mụn chuyên sâu” trống | Ảnh Unsplash cũ đã bị gỡ | Thay ảnh (đã kiểm tra tải được), thêm ảnh cho Trang điểm / Móng / Đá nóng; ảnh lỗi tự thử 2 ảnh dự phòng cùng chủ đề |
| Tạo lịch vãng lai ở chế độ máy chủ thật không check-in / không hiện | API trả `{ appointmentId }` chứ không phải lịch hẹn đầy đủ | `appointmentsApi.walkIn()` chuẩn hoá, luôn trả lịch hẹn đầy đủ |
| Báo lỗi hiện 2 lần | StrictMode gọi API 2 lần | Toast tự bỏ thông báo trùng trong 2,5 giây |
| Doanh thu / Khung giờ lệch 1 ngày trước 7h sáng | Ngày lấy theo UTC | Lấy theo giờ tiệm (Asia/Ho_Chi_Minh) |

### Gia cố launcher chạy trên nhiều máy (28/09/2026)

| Lỗi | Nguyên nhân | Khắc phục |
|---|---|---|
| `./run_project.sh` in chữ rồi thoát, không chạy gì | Heredoc `cat <<'INFO'` thiếu dòng kết thúc `INFO` → phần mở trình duyệt và `npm run start:all` bị in ra như văn bản | Viết lại script, dùng `scripts/launcher.mjs` chung cho cả hai hệ điều hành |
| Lần đầu dựng volume: nạp dữ liệu báo `ECONNREFUSED` | `pg_isready` qua Unix socket báo sẵn sàng khi entrypoint còn chạy init script trên máy chủ tạm (chưa mở TCP) | Healthcheck qua TCP `-h 127.0.0.1`; `run-seed.ts` tự thử lại kết nối tới 120 giây |
| Launcher hỏng từ ngày thứ hai trở đi | `seed.sql` sinh lịch hẹn mẫu cho ngày mới có thể trùng giờ lịch thật → vi phạm `appointments_no_overlap` | Bỏ qua khung giờ đã có lịch; `ON CONFLICT DO NOTHING` cho mọi khoá duy nhất; ngày nghỉ mẫu không chèn khi trùng kỳ nghỉ khác |
| Tài khoản mẫu không đăng nhập được sau khi đổi mật khẩu / bị khoá | Seed chỉ `DO NOTHING` | Seed đưa 8 tài khoản mẫu về đúng mật khẩu, mở khoá |
| `/health` trả 200 dù CSDL chết → trình duyệt mở quá sớm | Luôn trả 200 kèm `degraded` | Trả **503** khi CSDL chưa truy vấn được |
| Proxy Vite trả 500 rỗng khi API đang biên dịch | Không có trình xử lý lỗi proxy; đích `localhost` phụ thuộc IPv4/IPv6 | Proxy trỏ `127.0.0.1`, lỗi trả **503 + thông điệp tiếng Việt**; API lắng nghe dual-stack; `strictPort` cho 5173 |
| `.bat` nhảy nhãn sai / `.sh` báo `$'\r'` trên máy khác | Nhãn `:WAITDB` nằm trong khối `( )`; không cố định kiểu xuống dòng | Không còn nhãn trong khối; thêm `.gitattributes` (`*.bat` CRLF, `*.sh` LF) |
| `node_modules` cũ sau `git pull` gây lỗi build | Chỉ cài gói khi chưa có thư mục `node_modules` | Cài lại khi hash `package.json` + `package-lock.json` đổi |
| Vòng lặp liên kết `node_modules/salon-spa-booking → ..` | Phụ thuộc thừa `"salon-spa-booking": "file:.."` trong backend/frontend | Gỡ bỏ |

---

## Tài liệu kèm theo

- [`docs/STAGING.md`](docs/STAGING.md) — môi trường staging và tài khoản mẫu (một trang)
- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — kịch bản demo nghiệm thu theo từng bước
- [`docs/TIMEZONE.md`](docs/TIMEZONE.md) — quy ước múi giờ và định dạng
- [`docs/BACKLOG-MAPPING.md`](docs/BACKLOG-MAPPING.md) — 39 user story ↔ mã nguồn
- [`docs/API.md`](docs/API.md) — danh mục endpoint theo module
