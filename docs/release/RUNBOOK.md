# Kiểm định và quy trình vận hành Salon Spa — 08/10/2026

Mục tiêu ưu tiên: một ứng dụng web trên máy chủ có HTTPS cố định; máy tại quầy và điện thoại dùng cùng một API/CSDL. Cài tại tiệm vẫn là phương án dự phòng. Bản này cải thiện vận hành và giữ nguyên đề tài, chưa phải biên bản nghiệm thu của chủ tiệm.

## 1. Nguồn đề tài và những gì giữ nguyên

Nguồn duy nhất cho phạm vi là `docs/requirements/3. Hệ thống đặt lịch Salon Spa.xlsx`, đọc trực tiếp XML workbook, không chỉnh file gốc.

| Chỉ tiêu/ranh giới | Ô gốc ở sheet `1. Product Overview` | Áp dụng |
|---|---|---|
| 39 story, 6 epic, 165 điểm; 4 sprint | B7, B9:B11 | Giữ nguyên; chi tiết `docs/BACKLOG-MAPPING.md` |
| Một salon; khách đặt không cần tài khoản; quản lý ca/lịch/thanh toán/đánh giá | A25, A37:A47 | Giữ nguyên module nghiệp vụ |
| PostgreSQL 15 | B53 | Compose dev và production dùng 15; CI thêm 16 để kiểm tra tương thích, không tự nâng volume lên 16 |
| Ảnh lưu trên máy chủ, tối đa 2 MB | B55 | Volume uploads riêng; sao lưu ảnh cùng CSDL khi bàn giao |
| Sao lưu 02:00, giữ 14 bản, diễn tập khôi phục trước nghiệm thu | B66 | Lịch hiện có giữ nguyên; sửa retention từ 15 về 14 theo từng CSDL; tệp cũ giữ lại |
| Không cổng thanh toán thật, native mobile, Zalo/SMS, tồn kho, đa chi nhánh, lương, ML gợi ý | C37:C44 | Không thêm các tính năng này; VietQR chỉ hỗ trợ lễ tân xác nhận chuyển khoản |

**Thay đổi yêu cầu nghiệp vụ: không có.** Sửa 14 bản sao lưu và mô tả PostgreSQL 15 là đưa hệ thống về đúng đề tài. Docker đóng gói, CI, lockfile, kiểm tra sao lưu là bổ sung kỹ thuật để vận hành. Node 22 là mục tiêu đóng gói mới; launcher vẫn có kiểm tra tối thiểu Node 20 cho khả năng tương thích cũ.

## 2. Lỗi đã tái hiện và sửa

| Mức | Vấn đề trước sửa | Kết quả sau sửa | Bằng chứng |
|---|---|---|---|
| P0 | `localhost:55432` có thể sao lưu nhầm `salon_postgres` ở cổng 5432 | Docker fallback phải khớp published IP/cổng của endpoint cấu hình | `backend/src/database/backup.spec.ts` |
| P0 | Sao lưu TLS có xác minh chứng chỉ bị hạ xuống `require` | Giữ `verify-full` khi cấu hình yêu cầu xác minh | Cùng bộ test |
| P1 | Mật khẩu CSDL nằm trong argv của `docker exec` | Chuyển qua môi trường `PGPASSWORD`; argv chỉ chứa tên biến | Cùng bộ test |
| P1 | Hai bản trong cùng giây ghi đè; file bị cắt có thể bị tính là thành công | UUID, file `.partial`, quyền POSIX 0600; chỉ đổi tên sau exit 0 và magic `PGDMP` | Cùng bộ test; magic không thay thế diễn tập restore |
| P1 | Retention xoá mọi `.dump`, kể cả CSDL khác | Prefix tên CSDL + hash host/cổng/CSDL, giữ 14 bản của đúng đích; không tự xoá bản legacy | Cùng bộ test; scheduler chỉ tính bản hoàn tất của đúng đích |
| P1 | `npm ci` lỗi tự chạy `npm install`, âm thầm đổi gói/lockfile trên máy khách | Luôn `npm ci`; lỗi/thiếu lockfile thì dừng và ghi nguyên nhân | `scripts/lib/test/dependencies.test.mjs` |
| P1 | Rollback source/dist nhưng giữ dependency bản mới | Trước bật lại bản cũ, cài lại theo lockfile cũ; nếu không cài được thì báo lỗi và không bật với gói sai | Chưa diễn tập toàn bộ updater trên mọi OS; cần staging |
| P1 | Chế độ máy chủ mặc định cho migration tiếp tục nếu không backup được | Launcher `serve` mặc định `required`; CLI dev giữ cơ chế hiện có | Code review + typecheck/build; phải kiểm tra rollback ở staging |
| P1 | Chỉ CI Linux/Node 20/PostgreSQL 16, fallback install che lỗi khoá | CI portable Windows/macOS/Linux Node 22; E2E PG15/16; image build riêng, strict npm ci | Workflow mới; chưa chạy trên GitHub trong phiên này |

Sáu regression của sao lưu đã thất bại trên mã chưa sửa. Bộ sao lưu hiện có tám ca đạt, gồm bổ sung tách retention cho hai host/cổng có cùng tên database. Đây là bằng chứng tái hiện, không chỉ là kiểm tra văn bản.

## 3. Bố cục và nguồn thông tin thống nhất

Giữ cấu trúc hiện có để không phá import/launcher/tài liệu của nhóm. Không tồn tại một bố cục thư mục duy nhất áp dụng bắt buộc quốc tế cho mọi dự án. Phân loại theo trách nhiệm:

| Khu vực | Nguồn chính | Quy tắc |
|---|---|---|
| Nghiệp vụ | `docs/requirements/` | Giữ đề tài gốc, gắn sheet/ô và mã story cho mọi đề xuất |
| Mã ứng dụng | `backend/`, `frontend/` | Không chép artefact báo cáo vào source |
| Hạ tầng | `deploy/docker/`, `deploy/cloudflared/` | Tách production khỏi Compose dev; không đổi volume dev |
| Vận hành | `docs/operations/` | Runbook và bằng chứng theo ngày/release |
| Báo cáo/slide | `docs/reports/`, `docs/presentations/` | Nội dung phát hành phải lấy từ cùng manifest do quy trình release sinh; không tự gõ số test khác nhau |
| Dữ liệu chạy | `backups/`, `logs/`, `backend/uploads/` | Không commit; volume riêng ở server; sao lưu ngoài máy |
| Lịch sử | `docs/feedback/`, tài liệu QA theo đợt | Không xoá lịch sử; ghi rõ thời điểm, không dùng số pass cũ làm số hiện tại |

README và bảng story hiện mô tả đã cài đặt 39 story. Điều đó không chứng minh tất cả AC, hiệu năng, thao tác UI và dữ liệu cá nhân đều đạt. Mỗi release phải gắn commit, hash workbook, số test thực chạy và danh sách chưa đạt.

## 4. Máy chủ web: bản Docker candidate

Tệp: `deploy/docker/Dockerfile.production`, `compose.production.yml`, `production.env.example` và `.dockerignore`.

- Build frontend/backend theo lockfile, runtime không chứa dev dependencies; ứng dụng chạy user `node`.
- Một cổng app ở `127.0.0.1:3000`; CSDL không publish cổng. HTTPS reverse proxy ở host trỏ vào cổng này.
- Volume riêng cho CSDL, ảnh và sao lưu. Compose production dùng project `salon-production`, tách khỏi volume dev.
- Không có Maildev/PgAdmin/dữ liệu mẫu ở production. Migration bắt buộc sao lưu khi có dữ liệu; bootstrap admin đầu tiên; khoá tài khoản demo còn mật khẩu mặc định.
- Một tiến trình API, phù hợp một tiệm. Bus SSE hiện nằm trong bộ nhớ; không scale nhiều replica trước khi bổ sung thiết kế đồng bộ.
- Image dùng PostgreSQL client 15; khi kết nối server phiên bản cao hơn phải cập nhật client tương ứng, không đổi image DB đang có volume một cách trực tiếp.

Chuẩn bị một bản clone sạch hoặc release checkout riêng, Node/Docker/Compose có trên máy build. Copy `production.env.example` thành `production.env` ngoài Git. Thay tất cả `REPLACE_*`, tên miền, SMTP, admin; sinh hai khoá JWT khác nhau bằng `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Không dùng cấu hình development `.env` để làm máy thật.

Lệnh từ gốc dự án; đường dẫn env là tuyệt đối và đường dẫn `SALON_PROD_ENV_FILE` phải trùng file đó:

```bash
export SALON_PROD_ENV_FILE=/srv/salon/secrets/production.env
docker compose --env-file "$SALON_PROD_ENV_FILE" -f deploy/docker/compose.production.yml config --quiet
docker compose --env-file "$SALON_PROD_ENV_FILE" -f deploy/docker/compose.production.yml build
docker compose --env-file "$SALON_PROD_ENV_FILE" -f deploy/docker/compose.production.yml up -d
docker compose --env-file "$SALON_PROD_ENV_FILE" -f deploy/docker/compose.production.yml ps
curl --fail http://127.0.0.1:3000/health
```

PowerShell thay dòng đầu bằng `$env:SALON_PROD_ENV_FILE='C:\salon\secrets\production.env'`, và truyền `--env-file $env:SALON_PROD_ENV_FILE` cho cùng các lệnh Compose.

Trước mở khách: cài reverse proxy HTTPS tên miền cố định, redirect HTTP sang HTTPS; kiểm tra proxy truyền IP và `TRUST_PROXY` đúng địa chỉ proxy thực sự nhìn thấy từ container. `loopback` có thể không khớp Docker bridge; không đặt tin mọi proxy khi cổng app có đường truy cập ngoài proxy. Cấu hình SSE không buffer/timeout ngắn; thử điện thoại và máy quầy. Kiểm tra email thật, link trong email phải dùng `FRONTEND_URL` HTTPS. Đổi mật khẩu bootstrap lần đầu và gỡ mật khẩu bootstrap khỏi cấu hình lưu trữ sau đó.

Không dùng gói có đĩa tạm để giữ ảnh thật, hoặc Quick Tunnel đổi URL làm địa chỉ cửa hàng chính. Ưu tiên VPS/managed host có persistent volume, giám sát, sao lưu ngoài máy và người chịu trách nhiệm khôi phục; lựa chọn nhà cung cấp/ngân sách là quyết định triển khai tiếp theo.

## 5. Cài tại tiệm trên Windows/macOS/Linux

Mục tiêu Node 22; Git clone để giữ quyền executable và lịch sử cập nhật; Docker Desktop trên Windows/macOS, Docker Engine + Compose plugin trên Linux. Cổng DB dev mặc định 5432; nếu bận đổi đồng bộ `POSTGRES_PORT` gốc và `DB_PORT` backend. Không dừng một PostgreSQL khác chỉ để lấy cổng.

| OS | Máy phát triển | Máy cửa hàng |
|---|---|---|
| Windows | `scripts\windows\run_project.bat` | `scripts\windows\start_server.bat` hoặc Launcher chế độ Máy chủ cửa hàng |
| macOS | `./scripts/unix/run_project.sh` | `./scripts/unix/start_server.sh`, Launcher `HoYoSalon.command` |
| Linux | `./scripts/unix/run_project.sh` | `./scripts/unix/start_server.sh`; service supervisor cần kiểm định riêng |

Dev seed đặt lại mật khẩu demo; máy thật chỉ dùng server mode. Launcher frontend chạy API thật; demo chỉ bật rõ bằng `npm --prefix frontend run dev:demo`. Khi `npm ci` thất bại, giữ log, đối chiếu Node/lockfile/mạng; không sửa lockfile trực tiếp ở máy khách. CI OS mới là cấu hình kiểm định tiếp theo, không phải kết quả đã chạy trên Mac/Linux thật.

## 6. Cập nhật và rollback

Máy local: cập nhật nhánh main sạch qua `npm run update`, `UPDATE_BACKUP=required` (mặc định). Quy trình có cửa sổ dừng; cache/npm hoặc ổ đĩa lỗi vẫn có thể làm rollback không hoàn tất. Không cam kết cập nhật luôn thành công. Source/dist được khôi phục có điều kiện, dependency cũ được cài lại; CSDL không tự hạ migration/restore.

Server: dùng image tag theo commit/digest, giữ image trước. Build/test release trước cửa sổ bảo trì; backup **CSDL + uploads + cấu hình đã mã hoá** ngoài máy. Dừng app trong thời gian thay schema; xem migration status; chạy image mới, `/health`, `/version.json`, đăng nhập, đọc lịch, đặt thử vào dữ liệu staging và đối chiếu doanh thu. Chỉ nối khách sau khi đạt.

Chỉ rollback image khi schema còn tương thích ngược. Migration TypeORM hiện dùng giao dịch **từng migration**: migration trước có thể đã commit dù migration sau thất bại. Không khẳng định CSDL hoàn toàn chưa đổi. Không chạy `migration:revert`, `db:reset`, `down -v` trên dữ liệu khách. Nếu migration phá tương thích phải dùng phương án chuyển tiếp đã review, hoặc phục hồi vào **CSDL mới** rồi chuyển kết nối sau đối chiếu; bảo toàn mọi giao dịch phát sinh sau backup.

## 7. Sao lưu và phục hồi

`npm run backup` tại máy local; trong Docker dùng `docker compose ... exec app node dist/database/backup-cli.js`. Mỗi database giữ 14 tệp mới với prefix riêng; file legacy không bị tự xoá. Lịch tự động 02:00 giờ Việt Nam, khởi động bù sau ba phút nếu bản gần nhất quá 26 giờ. Kiểm tra log backup; một volume cùng máy chưa phải sao lưu ngoài máy.

Với archive mới, chạy `pg_restore --list <file.dump>` rồi diễn tập phục hồi vào database staging **trống và tên riêng**, tuyệt đối không chỉ định tên DB khách. Dùng pg client cùng hoặc mới hơn server. `pg_dump` chỉ sao lưu một CSDL, không chứa role toàn cluster. Backup uploads và cấu hình ngoài DB, mã hoá và kiểm soát quyền truy cập.

Ví dụ dưới đây chỉ dùng cho DB thử mới đã được người vận hành đặt tên rõ:

```bash
createdb -h <test-host> -U <test-user> salon_restore_drill_test
pg_restore --exit-on-error --no-owner --no-privileges -h <test-host> -U <test-user> -d salon_restore_drill_test <file.dump>
```

Sau restore: kiểm tra số dòng/fingerprint customers/appointments/invoices, đối chiếu tổng phiếu đã đóng và báo cáo; mở ảnh; kiểm tra role, đăng nhập, thao tác lịch, múi giờ. Ghi thời gian hoàn thành và dữ liệu mất tối đa thực tế. RPO/RTO chưa có số đã được PO chấp nhận; cần đặt mục tiêu và đo trong diễn tập. Backup mỗi ngày có thể mất tới một ngày dữ liệu nếu chỉ dựa vào lịch này.

## 8. Chặn nghiệm thu và hướng cải tiến tiếp theo

1. **Bảo vệ dữ liệu cá nhân (B63):** controller customers có GET tìm kiếm/chi tiết/lịch sử nhưng chưa có `@Audit` cho đọc; không tìm thấy luồng xoá/ẩn danh theo yêu cầu trong bảy ngày. Cần thiết kế giữ chứng từ tài chính, xác minh chủ thể, xử lý audit/backup, thêm test rồi PO nghiệm thu. Không tự xoá dữ liệu lịch sử vì chưa có quy tắc nghiệp vụ lưu chứng từ.
2. **Tính tương thích cập nhật:** chưa diễn tập mất mạng, mất điện, hết đĩa, dependency native, migration lỗi giữa chuỗi và schema không tương thích trên Windows/macOS/Linux. Không quảng bá rollback tuyệt đối.
3. **Nghiệm thu người dùng:** cần chủ tiệm/lễ tân thật chạy trọn booking → xác nhận → nhắc → check-in → hoàn tất → thu tiền → đánh giá; đo dưới 60 giây ở mười lượt theo B32, giao diện 360px/1366px, AA B64.
4. **Hiệu năng B60/B61:** test 20 yêu cầu tranh cùng slot không thay cho đo 30 người dùng, 20.000 lịch và p95 khung giờ <800ms; trang 4G <2s và báo cáo <3s cần đo trên dữ liệu/host đại diện.
5. **Email/giám sát:** xác nhận SLA email thật, hàng đợi retry, email không gửi được phải có cảnh báo; theo dõi health, lỗi, độ trễ, dung lượng, ngày backup gần nhất; có người nhận sự cố.
6. **Phát hành:** chốt domain/host/ngân sách, scan dependency và image, SBOM/provenance, checksum artefact; chưa có kết luận sạch lỗ hổng hay chứng nhận ASVS.

Hướng đột phá phù hợp đề tài là giảm công việc cài ở mỗi thiết bị: một server, browser clients, release image có version, bằng chứng dùng chung cho app/báo cáo/slide, một vòng pilot nhỏ với lễ tân thật. Không tăng số tính năng ngoài phạm vi để che lỗi vận hành.

## 9. Nguồn kỹ thuật

- [Docker: dùng Compose trong production](https://docs.docker.com/compose/how-tos/production/) — cấu hình production riêng, không bind source ứng dụng.
- [PostgreSQL: SQL dump và custom archive](https://www.postgresql.org/docs/15/backup-dump.html) — backup/restore, giới hạn dump một CSDL.
- [OWASP ASVS](https://owasp.org/projects/asvs/) — tiêu chí kiểm định bảo mật, không tự coi checklist là chứng nhận.
- [SLSA provenance](https://slsa.dev/spec/v1.2/provenance) — nguồn và quy trình tạo artefact để truy vết release.

Kết quả thực chạy và hash release phải lấy từ manifest/báo cáo tổng hợp của đợt này; các job CI được thêm không có nghĩa đã chạy trên GitHub.
