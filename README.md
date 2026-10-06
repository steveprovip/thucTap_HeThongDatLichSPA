# Hệ thống đặt lịch Salon - Spa

Ứng dụng web quản lý lịch hẹn và vận hành ca làm cho một salon quy mô vừa (6–8 thợ).
Khách tự đặt lịch trên trang công khai theo đúng khung giờ thợ còn rảnh; tiệm theo dõi trọn
vòng đời lịch hẹn từ lúc đặt đến lúc thu tiền và nhận đánh giá.

Toàn bộ 39 user story / 6 epic / 165 point trong Product Backlog đều đã được cài đặt —
xem bảng đối chiếu tại [`docs/BACKLOG-MAPPING.md`](docs/BACKLOG-MAPPING.md).

---

## Chạy dự án bằng MỘT cú nhấp — HoYoSalon Launcher

**Windows:** nhấp đúp **`HoYoSalon.bat`** ở thư mục gốc. **macOS / Linux:** `npm run launcher`.

Cửa sổ Launcher (nền tối kính mờ, phong cách game launcher) mở ra:

| Nút / mục | Việc làm |
|---|---|
| **BẮT ĐẦU** | Chạy toàn bộ: Docker → PostgreSQL → gói npm → migration (+ dữ liệu mẫu ở chế độ phát triển) → API + giao diện, thanh tiến trình theo từng bước, tự mở ứng dụng khi `/health` = 200 |
| **CẬP NHẬT vX.Y.Z** | Hiện khi GitHub có thẻ phiên bản mới (hoặc `main` có commit mới): tải mã → cài gói → build → **sao lưu CSDL** → migration → chạy lại; lỗi ở bước nào tự quay về bản cũ |
| **MỞ ỨNG DỤNG** | Hệ thống đang chạy: mở trang |
| ⚙ **Thông tin & Chẩn đoán** | Phiên bản + trạng thái kết nối kho mã, **Kiểm tra phiên bản mới nhất**, **Nhật ký cập nhật** (CHANGELOG), **Log Client / Server / CSDL** trực tiếp, **Xuất `system_logs.zip`** (đã ẩn mật khẩu), **Sao chép thông tin thiết bị** (OS, Node, Docker, cổng) |
| Cài đặt | Chế độ *Phát triển · dữ liệu mẫu* hoặc *Máy chủ cửa hàng* (production, một cổng 3000, không nạp dữ liệu mẫu) |

Launcher chỉ lắng nghe `127.0.0.1`, mọi API của nó cần mã phiên ngẫu nhiên; đóng cửa sổ Launcher **không** tắt hệ thống Salon.
Các lệnh cũ vẫn dùng được: `scripts\windows\run_project.bat` · `scripts/unix/run_project.sh` (chi tiết bên dưới).

### Lệnh dòng lệnh (không dùng Launcher)

Máy mới clone chỉ cần **bật Docker Desktop** rồi nhấp đúp `scripts\windows\run_project.bat` (hoặc chạy `./scripts/unix/run_project.sh`), không phải làm gì thêm. Hai tệp này chỉ kiểm tra Node.js ≥ 20 rồi giao cho `scripts/launcher.mjs start` (dùng chung mọi hệ điều hành), lần lượt:

1. Kiểm tra Node.js ≥ 20.
2. Tạo các tệp `.env` còn thiếu (gốc, `backend`, `frontend`), sinh khoá JWT ngẫu nhiên thay giá trị mẫu và **ghi `VITE_DEMO_MODE=false`**: launcher luôn chạy với **API thật**, không bao giờ rơi vào chế độ Demo.
3. Chờ Docker sẵn sàng (tối đa 2 phút; Windows/macOS tự thử mở Docker Desktop), `docker compose --project-directory . -f deploy/docker/docker-compose.yml up -d` — PostgreSQL (healthcheck qua TCP) + PgAdmin + Maildev — rồi chờ PostgreSQL báo `healthy`. Chưa cài Docker thì in hướng dẫn tiếng Việt: cài Docker Desktop, hoặc dùng PostgreSQL riêng với `SALON_SKIP_DOCKER=1`.
4. **Cài gói khi chưa có `node_modules` hoặc khi `package.json`/`package-lock.json` đổi** (vd. sau `git pull`). Kiểm tra cổng 3000/5173 còn trống: đang bận thì nêu rõ cổng nào và lệnh tìm chương trình đang chiếm; nếu hệ thống đang chạy ở cửa sổ khác thì chỉ mở trình duyệt.
5. Áp dụng migration (cấu trúc CSDL; `schema.sql` là migration gốc) rồi nạp dữ liệu mẫu `seed.sql` (chạy lại bao nhiêu lần cũng an toàn). **Chỉ máy phát triển làm bước nạp mẫu này.**
6. Chạy API + giao diện dưới **một tiến trình giám sát** (`node scripts/launcher.mjs run`, không qua
   concurrently/npm): **trình duyệt chỉ mở khi `GET /health` trả 200** (API biên dịch xong và truy vấn được
   CSDL) và Vite đã phản hồi; dịch vụ nào sập (vd. `exited with code 3221226505`) được **tự khởi động lại**
   (tối đa 5 lần / 10 phút, kèm giải thích mã lỗi); Ctrl+C dừng sạch cả cây tiến trình, giải phóng cổng 3000/5173.

Biến tuỳ chọn: `SALON_SKIP_DOCKER=1` (dùng PostgreSQL riêng theo `backend/.env`), `SALON_NO_BROWSER=1` (không tự mở trình duyệt),
`SALON_DB_TIMEOUT` (giây chờ PostgreSQL, mặc định 120), `SALON_OPEN_TIMEOUT` (giây chờ `/health`, mặc định 300).
Máy đã cài sẵn PostgreSQL chiếm cổng 5432? Đặt `POSTGRES_PORT=5433` trong `.env` và `DB_PORT=5433` trong `backend/.env`.

| Thành phần | Địa chỉ |
|---|---|
| Giao diện | http://localhost:5173 |
| API | http://localhost:3000/api |
| Tài liệu API (Swagger) | http://localhost:3000/api/docs |
| Hộp thư ảo (Maildev) | http://localhost:1080 |
| PgAdmin | http://localhost:5050 |

### Tài khoản mẫu

Dùng **giống hệt nhau** ở cả hai chế độ: Full-Stack (NestJS + PostgreSQL, `backend/database/seed.sql`) và
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
- Chế độ **Demo** (dữ liệu giả trong trình duyệt, không gọi backend) **chỉ bật khi `VITE_DEMO_MODE=true`**, tức
  `npm --prefix frontend run dev:demo`. Mặc định — kể cả máy mới clone chưa có `frontend/.env` (tệp bị gitignore) — giao diện
  gọi **API thật**, và `scripts\windows\run_project.bat` / `scripts/unix/run_project.sh` luôn ép `VITE_DEMO_MODE=false`. Bản Demo có ô
  *"Chế độ demo · Xem vai trò"* ở góc dưới bên phải.
  Quy trình test lại lỗi QA: [`docs/testing/RUNBOOK-TEST-LAI-QA-04102027.md`](docs/testing/RUNBOOK-TEST-LAI-QA-04102027.md).
- Bản demo lưu dữ liệu trong `localStorage` (khoá `salon.demo.v6`). Muốn về dữ liệu mẫu ban đầu: xoá khoá đó
  trong DevTools → Application → Local Storage rồi tải lại trang.

Khách hàng **không cần tài khoản** — đặt lịch và tra cứu bằng số điện thoại / mã 8 ký tự.

---

## Kiến trúc

```
du_an/
├── HoYoSalon.bat               ĐIỂM VÀO 1-CLICK DUY NHẤT: Launcher (BẮT ĐẦU / CẬP NHẬT / Chẩn đoán)
├── package.json                Lệnh gốc điều phối backend + frontend (db:*, build, test, lint, launcher…)
├── README.md · CHANGELOG.md · AGENTS.md
├── render.yaml                 Blueprint Render (Render chỉ đọc tệp này ở gốc kho mã)
├── backend/                    NestJS 10 + TypeORM + PostgreSQL
│   ├── database/
│   │   ├── schema.sql          Migration gốc: ràng buộc EXCLUDE, CHECK, index, view, trigger
│   │   └── seed.sql            5 thợ · 12 dịch vụ · 4 vai trò nội bộ · ~400 lịch hẹn mẫu
│   ├── src/
│   │   ├── common/             Guard (JWT, RBAC), decorator, filter, interceptor ghi nhật ký, tiện ích
│   │   ├── config/             Cấu hình ứng dụng, CSDL, JWT, SMTP
│   │   ├── database/           Entity, migration, sao lưu, nạp dữ liệu mẫu
│   │   └── modules/
│   │       ├── auth/           Đăng nhập, JWT 30m/7d, khoá 15 phút sau 5 lần sai, quên mật khẩu
│   │       ├── users/          Quản trị tài khoản nhân sự, 5 vai trò
│   │       ├── services/       Nhóm dịch vụ, dịch vụ (15–240 phút, ≤ 20.000.000 đ)
│   │       ├── stylists/       Hồ sơ thợ, kỹ năng, ca làm theo tuần, ngày nghỉ riêng
│   │       ├── working-hours/  Giờ mở cửa theo thứ, ngày nghỉ của tiệm
│   │       ├── booking-engine/ Bộ tính khung giờ trống + lá chắn chống đặt trùng
│   │       ├── customers/      Hồ sơ khách gộp theo SĐT, lịch sử dịch vụ
│   │       ├── invoices/       Phiếu tính tiền, mã giảm giá, phiếu điều chỉnh
│   │       ├── reviews/        Đánh giá 1–5 sao bằng liên kết dùng một lần
│   │       ├── notifications/  Hàng đợi email (3 lần thử) + thông báo trong ứng dụng
│   │       ├── analytics/      Doanh thu theo thợ/dịch vụ, mật độ khung giờ, xuất CSV
│   │       └── audit/          Nhật ký hoạt động chỉ đọc
│   └── test/                   E2E Supertest trên CSDL tạm salon_booking_test
├── frontend/                   React 18 + TypeScript + Vite + TailwindCSS + Lucide + Recharts
│   └── src/
│       ├── api/                Axios client tự làm mới access token (+ mockBackend cho chế độ Demo)
│       ├── components/         Modal, Toast, Badge, StarRating, DateNav, chuông thông báo…
│       ├── contexts/           AuthContext, ToastContext, BookingContext
│       ├── layouts/            PublicLayout (mobile-first), AdminLayout (sidebar theo quyền)
│       └── pages/              public · auth · reception · stylist · owner · admin
├── deploy/                     Cấu hình hạ tầng
│   ├── docker/                 docker-compose.yml: PostgreSQL 15 · PgAdmin · Maildev
│   └── cloudflared/            Mẫu Cloudflare Tunnel có tên miền cố định
├── docs/
│   ├── reports/                Báo cáo thực tập .docx (NĐ 30/2020), báo cáo kiểm thử, nghiệm thu
│   ├── presentations/          Slide thuyết trình .pptx
│   ├── requirements/           Đề tài gốc (4 Sprint · 39 User Story · 165 SP)
│   ├── feedback/               Góp ý của Mentor theo từng đợt
│   ├── testing/                Test case, danh sách lỗi QA, runbook kiểm thử lại
│   ├── guides/                 Hướng dẫn Git Flow, Vibe Testing
│   ├── prompts/                Prompt kiểm định dùng cho trợ lý AI
│   ├── tools/                  build_report_docx.py · build_slides_pptx.py · report_data.py
│   ├── assets/                 Sơ đồ, biểu tượng, ảnh chụp màn hình
│   └── *.md                    API, triển khai, staging, múi giờ, kịch bản demo, đối chiếu backlog
├── scripts/
│   ├── launcher.mjs            Lõi điều phối: Docker → CSDL → gói npm → chạy & giám sát tiến trình
│   ├── update.mjs              Cập nhật 1 chạm (git pull → build → sao lưu + migration → chạy lại)
│   ├── backup.mjs              Sao lưu CSDL ngay
│   ├── hoyo/                   HoYoSalon Launcher: máy chủ cục bộ + giao diện Dark Glassmorphism
│   ├── lib/                    Mô-đun dùng chung (so sánh phiên bản, chẩn đoán)
│   ├── windows/ · unix/        Lệnh cũ cho người quen dùng (run_project, start_server, update_project…)
│   └── ai/                     AI explorer + sinh báo cáo kiểm thử AI
└── tests/                      Kịch bản AI e2e (*.e2e.ts) + kết quả tests/ai-bug-reports/
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

## Chạy cho tiệm thật và cập nhật 1 chạm

`scripts\windows\run_project.bat` là chế độ **phát triển** (có dữ liệu mẫu, nạp lại mỗi lần chạy). Máy dùng thật (máy bàn của tiệm) chạy chế độ **máy chủ**:
bản production, NestJS phục vụ cả giao diện lẫn API ở **một cổng**, chạy migration nhưng **không nạp dữ liệu mẫu**, không đụng tới dữ liệu khách.

| Việc | Windows | macOS / Linux |
|---|---|---|
| **Launcher (khuyên dùng)** | `HoYoSalon.bat` → Cài đặt: *Máy chủ cửa hàng* → **BẮT ĐẦU** / **CẬP NHẬT** | `npm run launcher` |
| Chạy chế độ máy chủ | `scripts\windows\start_server.bat` | `./scripts/unix/start_server.sh` |
| **Cập nhật phiên bản mới (1 chạm)** | `scripts\windows\update_project.bat` | `./scripts/unix/update_project.sh` |
| Mở đường hầm HTTPS ra Internet (Cloudflare Quick Tunnel, miễn phí) | `scripts\windows\start_tunnel.bat` | `./scripts/unix/start_tunnel.sh` |
| Sao lưu CSDL ngay | `npm run db:backup` | `npm run db:backup` |

`scripts\windows\update_project.bat` thực hiện: `git pull --ff-only` → cài gói nếu `package.json` đổi → build bản mới ở thư mục tạm → dừng → **sao lưu CSDL + migration** → chạy lại → kiểm tra `/health`.
Lỗi ở bước nào thì giữ hoặc **tự quay về bản cũ**; dữ liệu khách và phiên đăng nhập không mất.
Laptop / điện thoại chỉ cần mở địa chỉ của máy chủ (cùng Wi-Fi, hoặc qua đường hầm): thay đổi trên máy này **hiện ngay** trên máy kia nhờ luồng đồng bộ thời gian thực (SSE), và dải
"Hệ thống vừa có phiên bản mới" báo khi cần bấm Tải lại.

Hai phương án triển khai miễn phí (Cloud: Render + Neon/Supabase + Cloudflare Pages, hoặc máy bàn làm máy chủ + Cloudflare Tunnel), quy ước migration, cô lập kiểm thử e2e,
giới hạn của từng gói miễn phí và xử lý sự cố: [`docs/TRIEN-KHAI.md`](docs/TRIEN-KHAI.md). **Trước khi mở máy chủ ra Internet** hãy khoá tài khoản mẫu: `npm run security:check`.

---

## Lệnh thường dùng

```bash
npm run install:all      # cài gói cho backend + frontend
npm run db:up            # chỉ dựng docker (postgres, pgadmin, maildev)
npm run db:reset         # xoá volume, dựng lại CSDL TRỐNG (rồi npm run db:seed để có dữ liệu mẫu)
npm run db:migrate       # áp dụng migration còn chờ (tự sao lưu nếu CSDL đã có dữ liệu); db:status để xem
npm run db:backup        # sao lưu CSDL ngay vào backups/
npm run migration:generate -- TenThayDoi   # sinh migration từ khác biệt entity
npm run db:seed          # nạp dữ liệu mẫu (chỉ máy phát triển; chạy lại nhiều lần vẫn an toàn)
npm run start:all        # chạy song song API + giao diện
npm run start:launch     # tiến trình giám sát: API + giao diện, tự khởi động lại khi sập, mở trình duyệt khi /health = 200
npm run launcher         # HoYoSalon Launcher (giao diện BẮT ĐẦU / CẬP NHẬT / Chẩn đoán)
npm run update           # cập nhật 1 chạm (node scripts/update.mjs --check: chỉ kiểm tra phiên bản)
npm run backup           # sao lưu CSDL ngay vào backups/
npm run test:scripts     # kiểm thử thư viện Launcher (semver, changelog, zip, ẩn bí mật)
npm run build            # build backend và frontend cho môi trường thật
npm test                 # 35 kiểm thử đơn vị bộ tính khung giờ
npm run test:e2e         # kiểm thử end-to-end trên CSDL TẠM salon_booking_test (tự tạo, tự xoá; cần PostgreSQL đang chạy)
npm run lint             # ESLint cho cả hai phía
```

---

## Kiểm thử

| Bộ | Lệnh | Nội dung |
|---|---|---|
| Đơn vị backend | `npm test` | 168 ca: bộ tính khung giờ, âm lịch & ngày lễ, độ phủ ca, trợ lý xếp lịch, DTO, quy tắc ca… |
| Đơn vị frontend + Launcher | `npm run test:frontend` · `npm run test:scripts` | Luật bản Demo; semver, CHANGELOG, ZIP, ẩn bí mật |
| Góp ý Mentor Sprint 2 | `npm run test:e2e` | Đăng ký ca → duyệt, giữ chỗ 10 phút (10 khách tranh 1 khung), email xác nhận, AI ngày lễ, độ phủ ca, trợ lý xếp lịch, chân trang |
| Phân quyền | `npm run test:e2e` | Đối chiếu 17 endpoint × 4 vai trò, khoá 15 phút sau 5 lần sai |
| Chống đặt trùng | `npm run test:e2e` | 20 yêu cầu đồng thời → đúng 1 thành công |
| End-to-end | `npm run test:e2e` | Đặt → xác nhận → check-in → hoàn tất → tính tiền → đánh giá → báo cáo |

---

## Nhật ký sửa lỗi — Sprint 1 · Lỗi 2 (27/09/2026)

| # | Lỗi được báo | Cách khắc phục |
|---|---|---|
| 1 | Ảnh dịch vụ lỗi / trống trên giao diện khách | `SmartImage` (`components/Media.tsx`) tự chuyển sang nền gradient theo chủ đề (kéo — Tóc, giọt nước — Gội, lấp lánh — Da, bàn tay — Massage, viên ngọc — Combo) khi ảnh lỗi, mất mạng hoặc tải quá 8 giây. Không còn khung ảnh vỡ. |
| 2 | Đăng nhập đúng email + mật khẩu nhưng bị từ chối | Dữ liệu demo dùng `@lumi.vn` / `demo1234` → đổi sang đúng bộ tài khoản ở bảng trên; khoá dữ liệu demo nâng lên `salon.demo.v5` để trình duyệt tự nạp lại dữ liệu mới. |
| 3 | Email trong README và trên web không khớp | Một nguồn duy nhất `DEMO_ACCOUNTS` / `DEMO_PASSWORDS` (`frontend/src/utils/constants.ts`) dùng chung cho mockBackend và nút đăng nhập nhanh, khớp `backend/database/seed.sql` và README. |
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
| `./scripts/unix/run_project.sh` in chữ rồi thoát, không chạy gì | Heredoc `cat <<'INFO'` thiếu dòng kết thúc `INFO` → phần mở trình duyệt và `npm run start:all` bị in ra như văn bản | Viết lại script, dùng `scripts/launcher.mjs` chung cho cả hai hệ điều hành |
| Lần đầu dựng volume: nạp dữ liệu báo `ECONNREFUSED` | `pg_isready` qua Unix socket báo sẵn sàng khi entrypoint còn chạy init script trên máy chủ tạm (chưa mở TCP) | Healthcheck qua TCP `-h 127.0.0.1`; `run-seed.ts` tự thử lại kết nối tới 120 giây |
| Launcher hỏng từ ngày thứ hai trở đi | `seed.sql` sinh lịch hẹn mẫu cho ngày mới có thể trùng giờ lịch thật → vi phạm `appointments_no_overlap` | Bỏ qua khung giờ đã có lịch; `ON CONFLICT DO NOTHING` cho mọi khoá duy nhất; ngày nghỉ mẫu không chèn khi trùng kỳ nghỉ khác |
| Tài khoản mẫu không đăng nhập được sau khi đổi mật khẩu / bị khoá | Seed chỉ `DO NOTHING` | Seed đưa 8 tài khoản mẫu về đúng mật khẩu, mở khoá |
| `/health` trả 200 dù CSDL chết → trình duyệt mở quá sớm | Luôn trả 200 kèm `degraded` | Trả **503** khi CSDL chưa truy vấn được |
| Proxy Vite trả 500 rỗng khi API đang biên dịch | Không có trình xử lý lỗi proxy; đích `localhost` phụ thuộc IPv4/IPv6 | Proxy trỏ `127.0.0.1`, lỗi trả **503 + thông điệp tiếng Việt**; API lắng nghe dual-stack; `strictPort` cho 5173 |
| `.bat` nhảy nhãn sai / `.sh` báo `$'\r'` trên máy khác | Nhãn `:WAITDB` nằm trong khối `( )`; không cố định kiểu xuống dòng | Không còn nhãn trong khối; thêm `.gitattributes` (`*.bat` CRLF, `*.sh` LF) |
| `node_modules` cũ sau `git pull` gây lỗi build | Chỉ cài gói khi chưa có thư mục `node_modules` | Cài lại khi hash `package.json` + `package-lock.json` đổi |
| `[WEB] npm run dev:frontend exited with code 3221226505`, trang web chết dù API vẫn chạy | 3221226505 = `0xC0000409`: Node.js trên Windows abort ở tầng native (assertion libuv khi đóng handle, nodejs/node#56645) — không bắt được bằng JavaScript. concurrently chỉ báo mã thoát rồi bỏ mặc. Bản vá v1.2.4 (`await new Promise(() => {})`) không có tác dụng: Promise treo không giữ được event loop, tiến trình OPEN vẫn thoát ngay | Tiến trình giám sát `launcher.mjs run`: chạy thẳng `node vite.js` / `node nest.js` (bỏ 4 tầng cmd/npm), stdin giữ mở, mở trình duyệt ngay trong tiến trình (không còn tiến trình phụ thoát giữa chừng), giải mã mã thoát, tự khởi động lại, dừng cả cây bằng `taskkill /T` / nhóm tiến trình |
| Vòng lặp liên kết `node_modules/salon-spa-booking → ..` | Phụ thuộc thừa `"salon-spa-booking": "file:.."` trong backend/frontend | Gỡ bỏ |
| Máy mới clone, chạy `npm run dev` vào chế độ Demo: dữ liệu giả, bỏ qua mọi luật của backend | `frontend/.env` bị gitignore nên thiếu `VITE_DEMO_MODE`, và thiếu biến thì `DEMO_MODE` mặc định bật khi chạy dev | `DEMO_MODE` chỉ bật khi `VITE_DEMO_MODE=true`. `launcher.mjs start` tự tạo `.env`, ghi `VITE_DEMO_MODE=false`, chờ Docker và PostgreSQL, nạp dữ liệu rồi mới chạy; `scripts\windows\run_project.bat` / `.sh` rút gọn còn lớp vỏ gọi launcher |

---

## Góp ý Mentor Sprint 2 (06/10/2026) — v1.4.0

| # | Góp ý | Đã làm | Vị trí |
|---|---|---|---|
| 1 | Phân chia lại nhánh GitHub | `main` (Production) · `develop` (Staging) · `feature/*` · `fix/*` · `docs/*`; nhánh cũ lưu thành thẻ `archive/*` | `docs/guides/git/GIT-BRANCHING.md`, `scripts/git/branch-cleanup.mjs` |
| 2 | Bảng ca làm rối mắt | Lưới thợ × ngày, ca tô màu theo buổi, nút ẩn tới khi rê chuột, đếm thợ trực | `pages/admin/shifts/ShiftBoard.tsx` |
| 3 | Chọn giờ 24 giờ | `TimeSelect24` 00:00 → 23:45, bước 15 phút | `components/TimeSelect24.tsx` |
| 4 | AI phân tích khung giờ | Trợ lý xếp lịch: sớm · vừa khít · cân bằng thợ, có lý do | `GET /appointments/smart-slots`, `SmartSlotAssistant.tsx` |
| 5 | AI sinh ngày lễ | Âm lịch thiên văn + Bộ luật Lao động, không chèn lên lịch khách | `GET /holidays/suggestions`, `POST /holidays/generate` |
| 6 | Thợ tự đăng ký lịch, quản lý duyệt | Đăng ký cả tuần, duyệt / sửa giờ / từ chối / duyệt tất cả | `/shift-requests`, trang “Đăng ký lịch làm” |
| 7 | Chân trang | Nền tối, Facebook, Zalo, địa chỉ + chỉ đường, hotline, email, giờ mở cửa, đội ngũ chuyên viên | `GET /public/salon-info`, `layouts/SiteFooter.tsx` |
| 8 | Hiển thị dày hơn | Lưới 4 cột liền mạch, 2 hàng + “Xem thêm”, khung 7xl | `pages/public/HomePage.tsx` |
| 9 | Khung giờ nào cũng có thợ | Cảnh báo khoảng trống + gợi ý thợ ít giờ làm, xếp 1 cú nhấp | `GET /shifts/coverage`, `CoveragePanel.tsx` |
| 10 | Email đặt lịch thành công | Email đầy đủ (trạng thái, chỉ đường, Google Calendar), gửi ngay; gửi bổ sung từ màn hình thành công | `POST /public/bookings/email` |
| 11 | Giữ chỗ 10–15 phút | Khoá khung giờ khi khách điền form, đếm ngược, giữ thêm | `POST/DELETE /public/holds`, `SLOT_HOLD_MINUTES` |

Chi tiết từng mục: [`docs/feedback/2026-10-06-mentor-sprint2/RESOLUTION.md`](docs/feedback/2026-10-06-mentor-sprint2/RESOLUTION.md) · lịch sử phiên bản: [`CHANGELOG.md`](CHANGELOG.md).

---

## Tài liệu kèm theo

- [`docs/STAGING.md`](docs/STAGING.md) — môi trường staging và tài khoản mẫu (một trang)
- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — kịch bản demo nghiệm thu theo từng bước
- [`docs/TIMEZONE.md`](docs/TIMEZONE.md) — quy ước múi giờ và định dạng
- [`docs/BACKLOG-MAPPING.md`](docs/BACKLOG-MAPPING.md) — 39 user story ↔ mã nguồn
- [`docs/API.md`](docs/API.md) — danh mục endpoint theo module
- [`docs/guides/git/GIT-BRANCHING.md`](docs/guides/git/GIT-BRANCHING.md) — quy trình nhánh Git
- [`docs/reports/`](docs/reports/) · [`docs/presentations/`](docs/presentations/) — báo cáo thực tập (NĐ 30/2020) và slide
