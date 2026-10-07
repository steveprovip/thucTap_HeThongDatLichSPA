# Chạy hệ thống trên macOS

Dành cho thành viên nhóm dùng Mac (Apple Silicon M1–M4 hoặc Intel). Cách dùng giống Windows: một lần bấm, không gõ lệnh.

## 1. Cài một lần

| Việc | Ghi chú |
|---|---|
| **Node.js LTS ≥ 20** — nodejs.org, hoặc `brew install node` | Kiểm tra: `node -v` |
| **Git** — gõ `git --version`; macOS tự hiện hộp thoại cài *Command Line Tools*, bấm **Cài đặt** | |
| **Docker Desktop** — đúng bản Apple Silicon hoặc Intel (docker.com) | Mở một lần, chờ "Engine running" |
| `git clone <địa chỉ kho mã>` | **Không tải .zip**: bản .zip mất quyền chạy tệp và không tự cập nhật được |

## 2. Chạy

1. Nhấp đúp **`HoYoSalon.command`** ở thư mục gốc. Lần đầu macOS có thể chặn ("không xác định được nhà phát triển"): **chuột phải > Mở > Mở**.
2. Lần đầu tệp tự tạo ứng dụng **`~/Applications/Hương Sen Salon.app`**. Kéo vào **Dock**: từ nay bấm ứng dụng đó, **không có cửa sổ Terminal**.
3. Cửa sổ Launcher mở ra → **BẮT ĐẦU**. Trình duyệt tự mở ứng dụng khi sẵn sàng.

Cách khác (dành cho lập trình viên): `npm run launcher`, hoặc `./scripts/unix/run_project.sh` (dev), `./scripts/unix/start_server.sh` (máy chủ), `./scripts/unix/update_project.sh` (cập nhật).
Tự mở Launcher khi đăng nhập Mac: **Cài đặt hệ thống > Cài đặt chung > Mục đăng nhập > +** > chọn *Hương Sen Salon*.

## 3. Lỗi thường gặp trên Mac

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| `Permission denied` khi chạy `./scripts/unix/*.sh` | Bản cũ thiếu quyền chạy. `git pull` (từ v1.5.1 đã sửa) hoặc `chmod +x scripts/unix/*.sh HoYoSalon.command` |
| `error getting credentials … docker-credential-desktop: executable file not found in $PATH`, hoặc báo "chưa cài Docker" dù đã cài | Ứng dụng mở từ Finder/Dock không có PATH của Terminal. Từ v1.5.1 Launcher tự thêm `/usr/local/bin`, `/opt/homebrew/bin`, thư mục của Docker Desktop. Bản cũ: chạy bằng `npm run launcher` trong Terminal |
| Cổng **5432** bận (Postgres.app / `brew services` đang chạy PostgreSQL) | `brew services stop postgresql@16`, hoặc đặt `POSTGRES_PORT=5433` trong `.env` và `DB_PORT=5433` trong `backend/.env` |
| Hộp thoại tường lửa "node muốn nhận kết nối đến" | **Cho phép** nếu muốn điện thoại / máy khác cùng Wi-Fi truy cập; **Từ chối** thì chỉ máy này dùng được |
| Docker báo `platform linux/amd64 does not match … arm64` | Cảnh báo của image chưa có bản ARM, chạy giả lập — chậm hơn nhưng vẫn hoạt động |
| `.command` mở rồi tắt ngay, không thấy Launcher | Xem `logs/launcher-ui.log`; thường do thiếu Node.js ≥ 20 (hộp thoại sẽ báo) |
| "Tự bật hệ thống khi mở máy" không có trong Cài đặt Launcher | Tính năng này chỉ dành cho Windows; dùng *Mục đăng nhập* như trên |
