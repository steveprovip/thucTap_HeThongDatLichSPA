# Triển khai, đồng bộ thời gian thực và cập nhật 1 chạm

**Cập nhật 08/10/2026:** phương án web trên máy chủ với dữ liệu bền vững, bản Docker candidate,
quy trình khôi phục và giới hạn kiểm chứng hiện tại nằm trong [runbook vận hành](operations/PRODUCTION-READINESS-2026-10-08.md).
Các gói miễn phí và Quick Tunnel dưới đây phục vụ thử nghiệm; chưa phải cấu hình phát hành đã nghiệm thu.

Tài liệu này mô tả cách đưa hệ thống ra chạy thật mà **không tốn tiền**, làm sao để máy bàn, laptop và điện thoại
luôn thấy **cùng một dữ liệu**, và cách cập nhật phiên bản mới chỉ bằng một lần bấm.

- [0. Chọn phương án nào](#0-chọn-phương-án-nào)
- [1. Vì sao dữ liệu hết bị lệch giữa các máy](#1-vì-sao-dữ-liệu-hết-bị-lệch-giữa-các-máy)
- [2. Quy ước CSDL cho người lập trình (migration)](#2-quy-ước-csdl-cho-người-lập-trình-migration)
- [3. Phương án 1: Cloud miễn phí](#3-phương-án-1-cloud-miễn-phí)
- [4. Phương án 2: Máy bàn làm máy chủ](#4-phương-án-2-máy-bàn-làm-máy-chủ)
- [5. Cập nhật 1 chạm: `scripts\windows\update_project.bat`](#5-cập-nhật-1-chạm-update_projectbat)
- [6. Kiểm thử e2e không đụng CSDL thật](#6-kiểm-thử-e2e-không-đụng-csdl-thật)
- [7. Biến môi trường mới](#7-biến-môi-trường-mới)
- [8. Xử lý sự cố](#8-xử-lý-sự-cố)
- [9. Những điều chưa kiểm chứng](#9-những-điều-chưa-kiểm-chứng)
- [10. Nguồn](#10-nguồn)

---

## 0. Chọn phương án nào

| | **Phương án 1: Cloud miễn phí** | **Phương án 2: Máy bàn làm máy chủ** |
|---|---|---|
| Chi phí | 0 đ, có giới hạn của từng nhà cung cấp | 0 đ |
| Nơi giữ dữ liệu | Neon hoặc Supabase (PostgreSQL trên đám mây) | PostgreSQL trong Docker trên máy bàn |
| Địa chỉ truy cập | Cố định, dạng `https://…pages.dev` | Cùng Wi-Fi: `http://<IP máy bàn>:3000` (ổn định). Từ xa: Quick Tunnel, địa chỉ **đổi mỗi lần chạy** |
| Máy bàn tắt thì | Hệ thống vẫn chạy (nhưng API ngủ sau 15 phút không ai dùng, đánh thức mất khoảng 1 phút) | Cả hệ thống ngừng |
| Thời gian thực | Luồng SSE trực tiếp, tự chuyển sang hỏi định kỳ nếu bị chặn | Trong LAN: SSE trực tiếp. Qua Quick Tunnel: hỏi định kỳ 15 giây (Cloudflare không hỗ trợ SSE trên Quick Tunnel) |
| Ảnh thợ tải lên | **Mất** khi API khởi động lại (đĩa tạm của Render Free) | Giữ nguyên (thư mục `backend/uploads`) |
| Email thật | Phải dùng SMTP ở cổng khác 25/465/587 | SMTP thông thường |
| Phù hợp | Thử nghiệm, trình diễn, đồ án | Tiệm chạy thật tại một địa điểm |

**Khuyến nghị.** Render ghi rõ gói Free "không dùng cho ứng dụng production" ([nguồn](https://render.com/docs/free)), nên với tiệm chạy thật
đường miễn phí thực tế là **Phương án 2** (mạng LAN trong tiệm). Phương án 1 dùng để trình diễn hoặc khi cần một địa chỉ công khai cố định mà chấp nhận
các giới hạn ở mục 3.6.

---

## 1. Vì sao dữ liệu hết bị lệch giữa các máy

Trước đây mỗi máy tự chạy PostgreSQL của riêng mình (Docker volume riêng) và nạp `seed.sql` có dùng `now()`, nên máy bàn và laptop mỗi nơi một dữ liệu.
Nay hệ thống chia thành ba lớp:

1. **Một CSDL duy nhất.** Mọi thiết bị chỉ là màn hình gọi cùng một API, không máy nào giữ dữ liệu riêng.
2. **Thời gian thực (SSE).** Sau mỗi thao tác ghi thành công (đặt lịch, đổi trạng thái, thanh toán, sửa khách…) máy chủ phát một tín hiệu rất nhỏ `{seq, scope, at}`,
   **không chứa dữ liệu cá nhân**. Thiết bị nào đang mở trang nhận được sẽ tự tải lại danh sách. Điểm đặt lịch trên máy bàn hiện ngay trên laptop mà không cần bấm F5.
3. **Báo phiên bản mới.** Mỗi lần build sinh `version.json`. Thiết bị đang mở trang so sánh định kỳ (5 phút một lần và khi quay lại thẻ) và hiện dải
   *"Hệ thống vừa có phiên bản mới. [Tải lại]"*. Trang không tự tải lại để không làm mất thao tác đang dở.

Chấm trạng thái ở thanh trên cùng cho biết đang ở chế độ nào:

| Chấm | Ý nghĩa |
|---|---|
| **Trực tiếp** (xanh) | Luồng SSE đang mở, thay đổi từ máy khác hiện ngay |
| **Cập nhật định kỳ** (vàng) | SSE bị chặn hoặc không có, giao diện hỏi `/api/events/version` mỗi 15 giây. Dữ liệu vẫn đồng bộ, chậm vài giây |
| **Mất kết nối** (đỏ) | Thiết bị đang ngoại tuyến, tự đồng bộ lại khi có mạng |
| **Đang kết nối** (xám) | Đang thiết lập |

Cách hoạt động chi tiết: giao diện dùng `fetch` streaming (không dùng `EventSource` vì không gắn được tiêu đề `Authorization`); nếu không nhận được tín hiệu `hello` trong 10 giây,
hoặc 3 lần nối liền thất bại nhanh, tự chuyển sang hỏi định kỳ rồi thử lại SSE mỗi 60 giây. Khi nối lại, quay lại thẻ hoặc có mạng trở lại, giao diện đồng bộ ngay một lần.
Phiên đăng nhập hết hạn (401) được làm mới tự động.

Giới hạn của thiết kế: bus sự kiện nằm trong bộ nhớ nên **chỉ đúng khi chạy một tiến trình API** (đủ cho một tiệm, đúng với cả Render Free lẫn máy bàn);
tối đa 200 luồng đồng thời; mỗi luồng tối đa 20 phút rồi tự nối lại.

---

## 2. Quy ước CSDL cho người lập trình (migration)

`backend/database/schema.sql` đã **đóng băng** làm mốc gốc: nó được chạy duy nhất một lần bởi migration `BaselineSchema1791158400000`.
Từ nay **mọi thay đổi cấu trúc là một migration mới** trong `backend/src/database/migrations/`.
`seed.sql` (dữ liệu mẫu, đặt lại mật khẩu 8 tài khoản mẫu, phụ thuộc ngày hôm nay) **không bao giờ** nằm trong migration và không bao giờ chạy khi cập nhật.

| Việc | Lệnh (thư mục gốc dự án) |
|---|---|
| Sinh migration từ khác biệt giữa entity và CSDL | `npm run migration:generate -- TenThayDoi` |
| Tạo migration rỗng để viết tay (EXCLUDE, CHECK, trigger, chỉ mục GIN…) | `npm run migration:create --prefix backend -- src/database/migrations/TenThayDoi` |
| Xem đã chạy / còn chờ | `npm run db:status` |
| Áp dụng migration còn chờ (tự sao lưu nếu CSDL đã có dữ liệu) | `npm run db:migrate` |
| Hoàn tác migration gần nhất (chỉ ở máy phát triển) | `npm run migration:revert --prefix backend` |
| Nạp dữ liệu mẫu (chỉ máy phát triển, bị chặn khi `NODE_ENV=production`) | `npm run db:seed` |

Quy trình thêm một cột: sửa entity, chạy `migration:generate`, **đọc lại** file vừa sinh, `db:migrate`, chạy test, rồi commit file migration cùng mã nguồn.
Bộ sinh tự bỏ các câu lệnh về ràng buộc và chỉ mục vì chúng do `schema.sql` quản lý (TypeORM không hiểu `EXCLUDE`, `CHECK`, GIN không dấu); với những thứ đó hãy viết tay.

Những điều **không được làm**: sửa `schema.sql`; sửa một migration đã được chạy ở máy khác (hãy thêm migration mới); đưa `seed.sql` vào migration; bật `synchronize`.

**Sao lưu tự động.** `migration:run` chỉ sao lưu khi CSDL **đã có dữ liệu thật và có migration chờ chạy**, dùng `pg_dump` trên máy hoặc `docker exec salon_postgres pg_dump`,
lưu ở `backups/` (đổi bằng `BACKUP_DIR`, giữ 14 bản mới nhất cho từng CSDL). Chế độ `MIGRATION_BACKUP`: `auto` (mặc định, không sao lưu được thì cảnh báo rồi tiếp tục),
`required` (không sao lưu được thì **dừng, chưa đổi gì**; `update_project` dùng chế độ này), `off`. Mỗi migration chạy trong một giao dịch riêng nên migration lỗi tự hoàn tác.

---

## 3. Phương án 1: Cloud miễn phí

```
 git push main
      │
      ├─► GitHub Actions (CI): lint, typecheck, unit, e2e trên PostgreSQL 16 tạm
      │        │ xanh
      │        ▼
      │   Render (API NestJS)  ──────────►  Neon / Supabase (PostgreSQL)
      │    build → migration → bootstrap → chạy
      │
      └─► Cloudflare Pages (giao diện React tĩnh) ── gọi API qua HTTPS
```

### 3.1 Cơ sở dữ liệu: Neon (khuyên dùng) hoặc Supabase

| | Neon Free | Supabase Free |
|---|---|---|
| Dung lượng | 1 GB mỗi dự án (tối đa 20 GB toàn tài khoản) | 500 MB mỗi dự án |
| Tự ngủ | Sau 5 phút không dùng, **không tắt được** ở gói Free; lần truy vấn đầu tiên sẽ đánh thức | Dự án bị **tạm dừng sau 1 tuần không hoạt động** |
| Sao lưu | Khôi phục về một thời điểm trong 6 giờ gần nhất, 1 ảnh chụp thủ công | **Không có** sao lưu tự động |
| Số dự án | 100 | 2 dự án đang hoạt động |

Lấy chuỗi kết nối và dán vào biến `DATABASE_URL` (ví dụ `postgresql://user:matkhau@host/tencsdl?sslmode=require`). Lưu ý:

- **Neon:** dùng chuỗi **kết nối trực tiếp** (host không có `-pooler`), vì migration cần phiên làm việc đầy đủ. Đặt `DB_SSL=require`, `DB_STARTUP_TIMEZONE=false`, `DB_POOL_MAX=10`.
- **Supabase:** host kết nối trực tiếp `db.<mã>.supabase.co` ở gói Free **chỉ có IPv6**; nếu máy chạy API không có IPv6 hãy dùng *Shared pooler, chế độ Session* (`…pooler.supabase.com:5432`, có IPv4, hỗ trợ prepared statements).
  **Không dùng** chế độ Transaction (cổng 6543) vì không hỗ trợ prepared statements. Tài khoản qua pooler có dạng `postgres.<mã dự án>`. Đặt `DB_SSL=require`, `DB_STARTUP_TIMEZONE=false`.
- Hệ thống tự thử kết nối lại tối đa 20 lần, cách nhau 3 giây, nên CSDL đang ngủ không làm API sập.
- Múi giờ không bị ảnh hưởng khi đặt `DB_STARTUP_TIMEZONE=false`: cột là `TIMESTAMPTZ` và các câu SQL thô đều ghi rõ `AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- Supabase Free không có sao lưu: trước các đợt nâng cấp lớn hãy tự chạy `pg_dump` từ máy cá nhân.

### 3.2 API trên Render

1. Đưa mã lên GitHub, vào **Render → New → Blueprint**, chọn repo. Render đọc `render.yaml` ở thư mục gốc.
2. Điền các biến Render hỏi (đánh dấu `sync: false`): `DATABASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, và nhóm `SMTP_*` nếu muốn gửi email thật.
   `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` do Render tự sinh. **Không đổi chúng về sau**, đổi sẽ đăng xuất mọi người.
3. Lệnh khởi động trong `render.yaml` chạy lần lượt, bước nào lỗi thì dừng, bản đang chạy trước đó được giữ nguyên:
   `migration:run:prod` (chỉ đổi cấu trúc) → `bootstrap:prod` (CSDL trống thì tạo admin đầu tiên) → `security:lock:prod` (khoá tài khoản mẫu còn mật khẩu mặc định) → `start:prod`.
   Migration nằm trong lệnh khởi động vì lệnh "pre-deploy" của Render chỉ có ở gói trả phí.
4. Đăng nhập lần đầu bằng tài khoản `BOOTSTRAP_ADMIN_*`, hệ thống bắt đổi mật khẩu ngay. Sau đó có thể xoá hai biến này khỏi Render.

Giới hạn của Render Free (theo trang chính thức):

- 750 giờ chạy mỗi tháng cho cả workspace; hết giờ thì mọi dịch vụ Free bị treo tới đầu tháng sau.
- **Ngủ sau 15 phút không có truy cập**, đánh thức mất khoảng 1 phút (trình duyệt thấy trang chờ). Trong giờ làm việc luồng SSE tự nối lại mỗi 20 phút nên thường giữ cho API không ngủ, nhưng điều này **chưa kiểm chứng** trên Render.
- **Đĩa tạm:** mọi tệp ghi ra đĩa mất khi khởi động lại hoặc triển khai lại. Ảnh thợ tải lên sẽ biến mất; giao diện có sẵn ảnh đại diện SVG dự phòng. Muốn giữ ảnh cần kho lưu trữ ngoài (chưa làm trong dự án).
- **Chặn cổng 25, 465, 587:** không gửi email qua SMTP thông thường được. Chọn dịch vụ SMTP có cổng khác (nhiều nơi có 2525) và đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. Chưa kiểm chứng với dự án này.
- Render "có thể khởi động lại bất cứ lúc nào", không có SLA.
- Cơ sở dữ liệu Postgres miễn phí của Render **hết hạn sau 30 ngày**, vì vậy dùng Neon hoặc Supabase thay thế.
- Koyeb là phương án thay thế: có 1 dịch vụ web miễn phí (512 MB RAM, 0,1 vCPU) nhưng **bắt buộc có thẻ tín dụng** để xác minh tài khoản.

### 3.3 Giao diện trên Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, chọn repo.
2. Cấu hình build: thư mục gốc `frontend`, lệnh `npm run build`, thư mục kết quả `dist`.
3. Biến môi trường: `VITE_API_BASE_URL=https://<tên-dịch-vụ>.onrender.com/api` và `VITE_DEMO_MODE=false`.
4. Quay lại Render, đặt `FRONTEND_URL` và `CORS_ORIGINS` đúng địa chỉ `https://<dự-án>.pages.dev`.

Gói Free của Pages: 500 lượt build mỗi tháng, mỗi lần 1 build, tối đa 20.000 tệp mỗi site. Dự án không có `404.html` nên Pages phục vụ `index.html` cho mọi đường dẫn (chạy được React Router).
Vercel Hobby cũng triển khai được, nhưng gói này **chỉ cho mục đích cá nhân, phi thương mại**, nên không phù hợp để chạy cho một tiệm.

Thay vì tách đôi, có thể chạy **một dịch vụ duy nhất** trên Render: đổi `buildCommand` thành
`cd .. && npm ci --prefix backend && npm ci --prefix frontend && npm run build --prefix backend && npm run build --prefix frontend` và đặt `SERVE_FRONTEND=true`;
NestJS phục vụ luôn giao diện nên không cần `CORS_ORIGINS` hay `VITE_API_BASE_URL`. Đơn giản hơn nhưng mỗi lần build lâu hơn (chưa thử trên Render).

### 3.4 Chuỗi tự động khi đẩy mã

1. `git push origin main`.
2. GitHub Actions chạy CI (`.github/workflows/ci.yml`): lint, typecheck, build, unit test và **e2e trên PostgreSQL 16 tạm**.
3. CI xanh thì Render (`autoDeployTrigger: checksPass`) build và chạy lại API kèm migration. Cloudflare Pages build giao diện song song.
4. Thiết bị đang mở trang thấy dải "Hệ thống vừa có phiên bản mới" và bấm **Tải lại**.

Thời gian từ lúc đẩy mã đến lúc có bản mới phụ thuộc hàng đợi build của Render và Cloudflare, thường vài phút; không có cam kết 1 phút.
GitHub Actions miễn phí cho kho **công khai**; với kho riêng tư gói Free có 2.000 phút mỗi tháng.

### 3.5 Quy trình khi đổi cấu trúc CSDL

Commit migration mới cùng mã nguồn rồi đẩy lên `main`. Render chạy migration trước khi bật bản mới, nên khách và nhân viên không thấy trạng thái nửa vời.
Migration phải tương thích ngược một bản (chỉ thêm cột/bảng, không đổi tên hay xoá ngay) để bản cũ còn chạy trong lúc triển khai.

### 3.6 Tổng hợp rủi ro của Phương án 1

API ngủ và mất khoảng 1 phút khi đánh thức; ảnh tải lên mất; SMTP phải đổi cổng; Supabase Free tạm dừng sau 1 tuần không dùng và không có sao lưu; Neon ngủ sau 5 phút (truy vấn đầu chậm hơn); mọi dịch vụ Free không có cam kết hoạt động.
Nếu cần chạy thật thì ít nhất nâng cấp API lên gói trả phí hoặc dùng Phương án 2.

---

## 4. Phương án 2: Máy bàn làm máy chủ

Máy bàn giữ PostgreSQL và chạy bản production của hệ thống; laptop, điện thoại chỉ cần trình duyệt. Chi phí bằng 0.

```
 Laptop / điện thoại ──(Wi-Fi tiệm)──►  http://192.168.x.x:3000  ─┐
                                                                    ├─►  Máy bàn: NestJS (API + giao diện, một cổng)
 Từ xa ──HTTPS──► Cloudflare Tunnel (cloudflared) ──────────────────┘                  └─► PostgreSQL (Docker, chỉ nghe 127.0.0.1)
```

### 4.1 Chuẩn bị máy bàn (làm một lần)

1. Cài **Node.js 20+**, **Git** và **Docker Desktop** (bật "Start Docker Desktop when you sign in").
2. `git clone <địa chỉ repo>` rồi ở nhánh `main`. Không sửa mã nguồn trên máy này (cập nhật sẽ từ chối nếu có tệp bị sửa).
3. Chạy `scripts\windows\start_server.bat` một lần. Nó tạo `backend/.env`, sinh khoá JWT ngẫu nhiên, dựng PostgreSQL, cài gói, **chạy migration (không nạp dữ liệu mẫu)**, build bản production rồi chạy.
   CSDL trống thì cần tài khoản đầu tiên: mở `backend/.env`, điền `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` (≥ 8 ký tự, có chữ và số, không dấu; **tránh ký tự `#`** vì `.env` coi nó là bắt đầu ghi chú), rồi chạy lại. Đăng nhập xong hệ thống bắt đổi mật khẩu.
4. Đặt trong `backend/.env`: `FRONTEND_URL` (địa chỉ công khai, nằm trong link email gửi khách) và nhóm `SMTP_*` nếu gửi email thật. Hộp thư ảo Maildev chỉ hứng thư, không gửi ra ngoài.

`scripts\windows\start_server.bat` có thể chạy lại bao nhiêu lần tuỳ ý mà không đụng tới dữ liệu khách. Lần chạy sau nếu mã nguồn không đổi thì bỏ qua bước build.
Dừng máy chủ: `Ctrl+C` trong cửa sổ đó, hoặc `npm run stop:server`.

> `scripts\windows\run_project.bat` là chế độ **phát triển** (có dữ liệu mẫu, nạp lại mỗi lần chạy). **Không chạy nó trên máy chủ thật.**

### 4.2 Laptop và điện thoại trong tiệm

Khi chạy, cửa sổ máy chủ in địa chỉ LAN, ví dụ `http://192.168.1.20:3000`. Mở địa chỉ đó trên laptop hoặc điện thoại cùng Wi-Fi. Lần đầu Windows hỏi cho phép Node.js qua tường lửa: chọn **mạng riêng**.
Trong LAN, luồng SSE chạy trực tiếp (chấm **Trực tiếp**). Nên gán cho máy bàn một IP cố định bằng chức năng *DHCP reservation* của router để địa chỉ không đổi.

### 4.3 Truy cập từ xa bằng Cloudflare Tunnel

Đường hầm chỉ cần máy bàn chủ động kết nối ra Cloudflare, **không phải mở cổng trên router**.

**Cách A, Quick Tunnel (miễn phí hoàn toàn, không cần tài khoản hay tên miền):** chạy `scripts\windows\start_tunnel.bat` (sau khi `scripts\windows\start_server.bat` đã chạy). Cần có `cloudflared.exe`: tải
[bản Windows 64-bit](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe), đổi tên thành `cloudflared.exe`, đặt vào `C:\Cloudflared\bin` hoặc thư mục `tools\` của dự án.
Màn hình in địa chỉ dạng `https://….trycloudflare.com`; mở nó trên laptop hoặc điện thoại. Giới hạn do Cloudflare nêu rõ:

- Địa chỉ **ngẫu nhiên và đổi mỗi lần** chạy lại, tắt `cloudflared` là địa chỉ chết.
- **Không có cam kết hoạt động liên tục**; Cloudflare dành Quick Tunnel cho thử nghiệm.
- Tối đa 200 yêu cầu đồng thời, quá thì trả lỗi 429.
- **Không hỗ trợ SSE**: giao diện tự rơi về chế độ *Cập nhật định kỳ* (hỏi mỗi 15 giây), dữ liệu vẫn đồng bộ, chậm hơn vài giây.
- Không đặt địa chỉ này vào `FRONTEND_URL` vì sẽ hỏng link trong email gửi khách.
- Có tuỳ chọn mới (02/10/2026) chỉ cho phép một số email vào bằng mã OTP: đặt biến `CLOUDFLARED_ALLOWED_MAIL=ban@gmail.com` trước khi chạy `start_tunnel`. Cloudflare ghi rõ tính năng này cần trình duyệt tương tác;
  **chưa kiểm chứng** với giao diện của dự án.

**Cách B, Tunnel có tên (địa chỉ cố định):** cần một **tên miền đã thêm vào Cloudflare** để gắn tên miền phụ như `salon.tenmien.vn`. Tên miền thường phải mua, nên cách này **không còn miễn phí 100%**. Các bước:

1. Trong Cloudflare Zero Trust, mục Networks → Tunnels (tên menu có thể đổi): tạo tunnel, chọn Windows, sao chép **token**.
2. Mở Command Prompt bằng quyền quản trị: `cloudflared.exe service install <TOKEN>` (cài thành dịch vụ Windows, tự chạy khi bật máy).
3. Trong trang tunnel, thêm *Public hostname*: `salon.tenmien.vn` → dịch vụ `http://localhost:3000`.
4. Đặt `FRONTEND_URL=https://salon.tenmien.vn` trong `backend/.env`.

Có thể quản lý bằng tệp cấu hình thay cho token: xem mẫu `deploy/cloudflared/config.example.yml`. `cloudflared` không tự cập nhật trên Windows, thỉnh thoảng cần tải bản mới.
Tài liệu Cloudflare không nói rõ Tunnel có tên có giữ được luồng SSE lâu hay không; nếu bị cắt, giao diện tự chuyển sang hỏi định kỳ nên vẫn đồng bộ.

`TRUST_PROXY` mặc định `loopback` là đúng khi `cloudflared` chạy cùng máy (IP khách lấy từ `X-Forwarded-For` do `cloudflared` gắn, giới hạn tần suất theo IP vẫn đúng).

### 4.4 Giữ máy chủ luôn chạy

- Tắt chế độ ngủ khi cắm điện: `powercfg /change standby-timeout-ac 0` (chạy bằng quyền quản trị).
- Tự chạy khi đăng nhập Windows (Task Scheduler), ví dụ:
  `schtasks /Create /TN "Salon Spa - May chu" /SC ONLOGON /TR "\"F:\đường\dẫn\du_an\start_server.bat\"" /RL LIMITED /F`
  (cần bật đăng nhập tự động cho tài khoản Windows của máy bàn; chưa thử trên máy Windows thật).
- Container PostgreSQL có `restart: unless-stopped`, Docker Desktop bật cùng Windows thì CSDL tự lên.
- Mất điện giữa lúc cập nhật: chạy lại `scripts\windows\update_project.bat` (mục 5).

### 4.5 Sao lưu

- Tự động: mỗi lần cập nhật có đổi cấu trúc, hệ thống sao lưu trước vào `backups/` (giữ 14 bản cho từng CSDL).
- Thủ công bất cứ lúc nào: `npm run db:backup` (tạo `backups/salon_booking_…_thu_cong.dump`). Nên chép thư mục `backups/` sang USB hoặc ổ đám mây định kỳ: bản sao nằm cùng ổ đĩa với dữ liệu không chống được hỏng ổ cứng.
- Khôi phục (dừng máy chủ trước): `docker cp backups\<tệp>.dump salon_postgres:/tmp/s.dump` rồi
  `docker exec salon_postgres pg_restore -U salon -d salon_booking --clean --if-exists /tmp/s.dump`.

### 4.6 Bảo mật trước khi mở ra Internet (bắt buộc)

`seed.sql` tạo 8 tài khoản mẫu có mật khẩu **công khai trong README** (`Admin@123`…). Ai biết địa chỉ đường hầm đều thử được.
`scripts\windows\start_server.bat` tự chạy `security:check` và in cảnh báo; **bạn phải xử lý trước khi chia sẻ địa chỉ**:

```
npm run security:check            # liệt kê tài khoản mẫu còn mật khẩu mặc định (mã thoát 3 nếu có)
npm run security:lock --prefix backend   # khoá chúng (ngưng hoạt động + thu hồi phiên đăng nhập)
```

Tạo tài khoản thật ở màn hình *Người dùng* trước khi khoá. Tài khoản đã đổi mật khẩu không bị đụng tới. PgAdmin (5050), Maildev (1080) và PostgreSQL (5432) chỉ nghe `127.0.0.1`, không lộ ra mạng; đừng đổi điều đó.
Swagger (`/api/docs`) tự tắt khi chạy production.

---

## 5. Cập nhật 1 chạm: `scripts\windows\update_project.bat`

Bấm đúp `scripts\windows\update_project.bat` ở thư mục gốc (macOS/Linux: `./scripts/unix/update_project.sh`). Chạy trên macOS: xem [`docs/guides/CHAY-TREN-MACOS.md`](guides/CHAY-TREN-MACOS.md). Dữ liệu khách và phiên đăng nhập được giữ nguyên.

| Bước | Việc làm | Nếu lỗi |
|---|---|---|
| 0 | **Khoá cập nhật** `.salon-update.lock`: bấm CẬP NHẬT hai lần thì lần sau bị từ chối (khoá kẹt do mất điện tự hết khi tiến trình giữ khoá không còn / quá 2 giờ) | Dừng, chưa đổi gì |
| 1 | Kiểm tra Git, đang ở nhánh `main`, không có tệp mã nguồn bị sửa tại máy | Dừng, chưa đổi gì |
| 2 | `git fetch` rồi `git pull --ff-only origin main` (chỉ tiến tới, không bao giờ tự hợp nhất hay ghi đè) | Dừng, chưa đổi gì |
| 2b | **Preflight tương thích**: đọc migration MỚI của bản cập nhật; có thao tác phá huỷ trong `up()` (xoá bảng / cột, đổi kiểu, đổi tên, `TRUNCATE`, `DELETE FROM`, `SET NOT NULL`) thì dừng vì "quay về bản cũ" không còn an toàn — chạy lại với `--allow-destructive` khi đã xác nhận bản sao lưu | Dừng, chưa đổi gì |
| 3 | Chỉ khi `package.json` / `package-lock.json` đổi: cài gói npm bằng `npm ci` (dừng hệ thống trước để Windows không khoá tệp), rồi **kiểm tra chữ ký gói** `npm audit signatures` (chỉ cảnh báo) | Quay về bản cũ |
| 4 | **Build bản mới sang thư mục tạm** (`dist-next`) trong lúc bản cũ vẫn phục vụ khách | Bản cũ không bị đụng tới, mã nguồn đưa về bản cũ |
| 5 | Dừng hệ thống, **sao lưu CSDL (bắt buộc)**, chạy migration, bootstrap, kiểm tra tài khoản mẫu | Mỗi migration tự hoàn tác, bật lại bản cũ, đưa mã về bản cũ |
| 6 | Đổi `dist-next` thành `dist` (giữ bản cũ ở `dist-prev`) | – |
| 7 | Chạy lại máy chủ, chờ `/health`, kiểm tra `version.json` khớp bản vừa build và **smoke test chức năng**: `/health` (API + CSDL), thông tin tiệm, danh mục dịch vụ, trợ lý AI khách | **Tự quay về `dist-prev` và đưa mã về bản cũ** (trừ bản có migration phá huỷ đã chạy: dừng ở chế độ khôi phục, in đường dẫn bản sao lưu) |
| 8 | Ghi một dòng vào `logs/update-history.jsonl` (từ → tới, kết quả, thời gian, migration, bản sao lưu) | – |

Điểm cần biết:

- **Không bao giờ nạp dữ liệu mẫu.** Cả chế độ máy chủ lẫn chế độ phát triển khi được cập nhật đều chỉ chạy `migration:run`, không chạy `seed.sql`.
- **Phiên đăng nhập được giữ** vì khoá JWT nằm trong `backend/.env` (không đổi) và refresh token nằm trong CSDL. Thiết bị đang đăng nhập không bị bắt đăng nhập lại.
- **Logic cập nhật mới có hiệu lực ngay trong lần này:** sau `git pull`, launcher chạy lại chính nó bằng mã vừa kéo về cho các bước còn lại.
- Nếu hệ thống đang tắt, `scripts\windows\update_project.bat` cập nhật rồi bật luôn ở chế độ máy chủ. Nếu đang chạy ở chế độ phát triển (`scripts\windows\run_project.bat`), nó giữ đúng chế độ đó.
- Đã là phiên bản mới nhất thì báo "Không có gì để cập nhật" và **không khởi động lại** hệ thống.
- `package-lock.json` bị `npm install` tự sửa tại máy được bỏ qua khi kiểm tra tệp bị sửa, và tự hoàn lại nếu bản mới cũng đổi chính tệp đó.
- Lỗi ở bước 5 trở đi: CSDL đã giữ nguyên hoặc chỉ được **thêm** cấu trúc, nên bản cũ vẫn chạy được. Thông báo cuối cùng nêu đường dẫn bản sao lưu.
- Nhật ký máy chủ ghi vào `logs/server.log` để người lập trình đọc khi bản mới sập.

Biến tuỳ chọn: `UPDATE_BACKUP=required|auto|off` (mặc định `required`), `UPDATE_HEALTH_TIMEOUT` (giây chờ bản mới lên, mặc định 150), `SALON_NO_PAUSE=1` (không `pause` ở cuối, dùng khi chạy theo lịch), `UPDATE_ALLOW_DESTRUCTIVE=1` (tương đương `--allow-destructive`), `UPDATE_AUDIT_SIGNATURES=off` (bỏ kiểm tra chữ ký gói npm).

Kiểm thử các bước an toàn này (không cần mạng): `npm run test:launcher`.

Laptop và điện thoại **không cần cập nhật gì**: chúng mở trang từ máy chủ, nên chỉ cần bấm **Tải lại** khi thấy dải thông báo phiên bản mới.

---

## 6. Kiểm thử e2e không đụng CSDL thật

`npm run test:e2e` (hoặc job `e2e-tests` trong CI) **không còn chạy trên CSDL làm việc**:

1. `globalSetup` tạo CSDL tạm `salon_booking_test` (tên bắt buộc kết thúc bằng `_test`), chạy migration lên đó.
2. Mọi suite chạy trên CSDL tạm; `createTestApp()` kiểm tra lại `DB_NAME` và `current_database()` đều kết thúc bằng `_test`, nếu không thì dừng ngay.
3. `globalTeardown` xoá CSDL tạm (giữ lại để soi lỗi bằng `TEST_DB_KEEP=1`).
4. Chạy trên máy chủ không phải localhost bị chặn, trừ khi đặt `TEST_DB_ALLOW_REMOTE=1`. `DATABASE_URL` bị ép rỗng khi test.

Nhờ vậy test không làm bẩn dữ liệu bạn đang xem trên giao diện.

### 6.1 Chấm điểm Trợ lý tư vấn khách (`npm run eval:ai`)

Chạy khi máy chủ đang bật (có hoặc không có AI local): `npm run eval:ai` (tuỳ chọn `-- --k 5 --base http://<máy chủ>/api --min 0.9`).

- Mỗi kịch bản là **một cuộc hội thoại nhiều lượt** nhập vai khách, gửi kèm lịch sử và **trạng thái hội thoại** (`state`) y như widget.
- Chấm theo **kết quả** (ý định, ngày tra giờ trống, dịch vụ trong thẻ, giá đúng danh mục), không so từng chữ của câu văn.
- Mỗi kịch bản chạy `k` lần (mặc định 3) → **pass^k** = tỉ lệ kịch bản đạt cả k lần, đo độ ổn định của mô hình (phương pháp τ-bench).
- Báo cáo `logs/ai-eval-<ngày>.md`; mã thoát khác 0 khi pass^k dưới ngưỡng `--min` → dùng làm **cổng hồi quy** trước khi đổi model / prompt / luật.

Vòng cải tiến liên tục:

1. Câu trợ lý chưa trả lời được (chưa hiểu, chuyển người thật, dịch vụ tiệm không làm) được ghi vào `logs/assistant-gaps.jsonl`
   (đã che SĐT / email / dãy số). Chủ tiệm / lễ tân xem gom nhóm 30 ngày qua `GET /api/assistant/knowledge-gaps`.
2. Bổ sung mô tả dịch vụ / chính sách, hoặc thêm luật cho ý định mới.
3. Thêm câu đó thành kịch bản trong `scripts/ai/eval-assistant.mjs` (và unit test trong `customer-persona.spec.ts`).
4. `npm run eval:ai` đạt 100% rồi mới cập nhật.

---

## 7. Biến môi trường mới

Mẫu đầy đủ, có chú thích tiếng Việt, ở `backend/.env.example` (phần "TRIỂN KHAI MÁY CHỦ THẬT / ĐÁM MÂY"). Máy phát triển không cần đặt biến nào trong số này.

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `DATABASE_URL` | trống | Chuỗi kết nối kiểu đám mây; có thì `DB_HOST`… bị bỏ qua |
| `DB_SSL` | `false` | `true`: mã hoá + kiểm tra chứng chỉ; `require`: mã hoá, không kiểm tra |
| `DB_POOL_MAX` | `20` | Số kết nối tối đa của API (gói Free của CSDL nên đặt 10) |
| `DB_STARTUP_TIMEZONE` | `true` | Đặt `false` với Neon / Supabase pooler |
| `SERVE_FRONTEND`, `FRONTEND_DIST` | `false`, trống | NestJS phục vụ giao diện đã build (`start_server` tự đặt) |
| `CORS_ORIGINS` | trống | Địa chỉ giao diện ở tên miền khác, cách nhau bằng dấu phẩy |
| `FRONTEND_URL` | `http://localhost:5173` | Địa chỉ công khai, dùng trong link email gửi khách |
| `TRUST_PROXY` | `loopback` | `1` khi chạy sau Render; `loopback` khi `cloudflared` chạy cùng máy |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | trống | Tài khoản quản trị đầu tiên cho CSDL trống |
| `MIGRATION_BACKUP`, `UPDATE_BACKUP`, `BACKUP_DIR` | `auto`, `required`, `backups/` | Chính sách và nơi lưu sao lưu |
| `SEED_ALLOW_PRODUCTION`, `SALON_SEED` | trống | Cho phép / bỏ qua nạp dữ liệu mẫu |
| `TEST_DB_NAME`, `TEST_DB_KEEP`, `TEST_DB_ALLOW_REMOTE` | `salon_booking_test`, `0`, `0` | Cô lập kiểm thử e2e |
| `SSE_HEARTBEAT_MS` | `20000` | Chu kỳ tín hiệu giữ kết nối SSE |
| `SALON_SKIP_DOCKER`, `SALON_NO_BROWSER` | trống | Launcher: dùng PostgreSQL có sẵn thay cho Docker; không tự mở trình duyệt |
| `CLOUDFLARED_PATH`, `CLOUDFLARED_ALLOWED_MAIL` | trống | `start_tunnel`: đường dẫn `cloudflared`; chỉ cho email này vào |

Biến phía giao diện (`frontend/.env`): `VITE_API_BASE_URL` (địa chỉ API tuyệt đối khi giao diện và API ở hai tên miền) và `VITE_DEMO_MODE=false`.

---

## 8. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `scripts\windows\start_server.bat` báo "Chưa có tài khoản nào" | CSDL trống và chưa đặt `BOOTSTRAP_ADMIN_*` | Điền hai biến trong `backend/.env` rồi chạy lại |
| Bootstrap báo mật khẩu không hợp lệ dù đã đặt | Mật khẩu có `#` bị `.env` cắt cụt | Bỏ `#` hoặc đặt cả mật khẩu trong dấu nháy kép |
| `scripts\windows\update_project.bat` báo "tệp mã nguồn bị sửa" | Có người sửa tay mã nguồn trên máy chủ | Gửi thay đổi cho người lập trình, hoặc `git checkout -- <tệp>` |
| "git pull thất bại (lịch sử khác kho mã)" | Máy chủ có commit riêng chưa đẩy lên | Liên hệ người lập trình; không dùng `--force` |
| Chấm trạng thái vàng "Cập nhật định kỳ" | SSE bị chặn (Quick Tunnel, proxy công ty) | Bình thường, dữ liệu vẫn đồng bộ mỗi 15 giây |
| Laptop không mở được `http://IP:3000` | Tường lửa Windows hoặc khác mạng | Cho phép Node.js ở mạng riêng; kiểm tra cùng Wi-Fi |
| Render: API trả lỗi sau một lúc để yên | Đang ngủ (Free) | Đợi khoảng 1 phút rồi tải lại |
| Render báo `ECONNREFUSED` hoặc lỗi SSL với CSDL | Sai chuỗi kết nối hoặc thiếu `DB_SSL` | Dùng chuỗi trực tiếp, đặt `DB_SSL=require` |
| Supabase: không kết nối được từ Render | Host trực tiếp chỉ có IPv6 | Dùng pooler chế độ Session (cổng 5432) |
| Migration lỗi "relation … does not exist" | Migration viết sai thứ tự hoặc tên bảng | Sửa, đẩy lại; bản cũ vẫn chạy, CSDL không bị đổi |
| Muốn xem vì sao bản mới sập | – | Đọc `logs/server.log` |

---

## 9. Những điều chưa kiểm chứng

Đã chạy thật trên máy ảo Linux với PostgreSQL nhúng: migration trên CSDL trống và CSDL đã có dữ liệu; sao lưu (qua `pg_dump` giả lập, không phải bản thật); luồng cập nhật ở chế độ máy chủ và chế độ phát triển
(thành công, đã mới nhất, migration lỗi, build lỗi, bản mới sập khi khởi động, tệp bị sửa, sai nhánh, mất kết nối kho mã, gói npm mới, `package-lock.json` bị sửa); SSE và chế độ hỏi định kỳ; cô lập e2e.

**Chưa kiểm chứng:**

- Các lệnh riêng của **Windows** (`taskkill`, cửa sổ `cmd /k start`, đổi tên thư mục khi antivirus giữ tệp, `schtasks`, `powercfg`): chỉ được kiểm tra cú pháp, chưa chạy trên Windows thật.
- `pg_dump` thật (máy ảo không có): đường ống sao lưu mới chạy qua bản giả lập. Lần cập nhật đầu tiên trên máy tiệm hãy kiểm tra thư mục `backups/` có tệp `.dump` dung lượng lớn hơn 0.
- Triển khai thật trên **Render, Neon, Supabase, Cloudflare Pages**: cấu hình `render.yaml`, lệnh khởi động, SSL, và giả thuyết "SSE giữ cho Render Free khỏi ngủ" chưa được thử. Pages phục vụ `index.html` cho đường dẫn không có tệp theo tài liệu Cloudflare, chưa thử.
- `cloudflared` thật: chỉ thử phần đọc địa chỉ bằng một chương trình giả; chưa kiểm tra Quick Tunnel / Tunnel có tên, chưa kiểm tra SSE qua Tunnel có tên, chưa kiểm tra `--allowed-mail` với giao diện.
- Đồng bộ thời gian thực được kiểm tra bằng client Node, chưa bằng hai trình duyệt thật.
- Job `e2e-tests` trong CI chưa chạy trên GitHub (cùng bộ test đã chạy cục bộ).
- Email thật: Maildev chỉ hứng thư, chưa thử SMTP thật.

---

## 10. Nguồn

Các số liệu gói miễn phí được đối chiếu với trang chính thức ngày 05/10/2026; nhà cung cấp có thể đổi điều khoản bất cứ lúc nào.

- Render Free: <https://render.com/docs/free> · Blueprint: <https://render.com/docs/blueprint-spec> · Triển khai: <https://render.com/docs/deploys>
- Neon: <https://neon.com/docs/introduction/plans> · <https://neon.com/faqs/free-plan-limits-and-quotas>
- Supabase: <https://supabase.com/pricing> · <https://supabase.com/docs/guides/platform/billing-on-supabase> · <https://supabase.com/docs/guides/database/connecting-to-postgres>
- Cloudflare Quick Tunnels: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/> · Ghi chú phát hành: <https://developers.cloudflare.com/changelog/post/2026-10-02-protected-quick-tunnels/>
- Cloudflare Tunnel: <https://developers.cloudflare.com/tunnel/setup/> · Dịch vụ Windows: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/windows/> · Tải về: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/>
- Cloudflare Pages: <https://developers.cloudflare.com/pages/platform/limits/>
- Vercel Hobby: <https://vercel.com/docs/plans/hobby>
- Koyeb: <https://www.koyeb.com/docs/faqs/pricing>
- GitHub Actions: <https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions>
