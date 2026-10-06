# AGENTS.md — Quy Định & Hướng Dẫn Kỹ Thuật Dự Án

## 1. Tổng Quan Dự Án & Phạm Vi
- **Tên dự án**: Hệ Thống Đặt Lịch & Quản Lý Salon Spa (`thucTap_HeThongDatLichSPA` tại `F:\hoc_tap\thuc_tap\du_an`).
- **Phạm vi**: 4 Sprints · 39 User Stories · 165 Story Points (`docs/BACKLOG-MAPPING.md`).
- **Công nghệ**: NestJS 10 (Backend) + TypeORM + PostgreSQL 16 + React 18 / Vite (Frontend) + Tailwind CSS + Lucide Icons.

## 2. Integrated Agent Skills (`.agents/skills/`)
1. **`salon-spa-deep-auditor`**: Master audit & bug reproduction protocol for 23 QA items and 39 User Stories.
2. **`nestjs-postgres-concurrency-guard`**: PostgreSQL `SERIALIZABLE` transactions, row locking (`FOR UPDATE`), `EXCLUDE USING gist`, idempotent migrations.
3. **`fresha-luxury-ui-engine`**: Fresha Light Luxury UI, 4-step booking wizard, offline SVG fallback avatars, magic-byte image validation.
4. **`vietqr-security-ratelimit`**: Dynamic Napas247 VietQR (EMVCo CRC-16), sliding window rate-limiting (HTTP 429), brute-force protection.
5. **`tdd-e2e-regression-suite`**: Test-driven validation, Supertest E2E isolation (random phone numbers), reverse verification testing.

## 3. Kỷ Luật Code & Tối Ưu Token (80% Token Reduction Playbook)
- **Terse Communication**: Không filler words, không chào hỏi. Tập trung 100% token vào phân tích kỹ thuật, vị trí lỗi và diff chuẩn xác.
- **Surgical Diffs**: Luôn chỉ sửa đúng phần code gây lỗi, không viết lại toàn bộ file.
- **Strict Typing**: Tuyệt đối không dùng `any` trong TypeScript. Mọi DTO, State, Props đều có kiểu dữ liệu tường minh.

## 4. Lệnh Kiểm Thử & Kiểm Soát Chất Lượng
```powershell
# Typecheck & Lint (PowerShell)
npm --prefix backend run typecheck; npm --prefix backend run lint
npm --prefix frontend run typecheck; npm --prefix frontend run lint

# Chạy Unit Tests
npm --prefix backend run test

# Chạy E2E Tests trên PostgreSQL 16
npm --prefix backend run test:e2e

# Khởi động toàn hệ thống
./HoYoSalon.bat   # Launcher 1-Click (hoặc scripts\windows\run_project.bat)
```

## 5. Các Ràng Buộc Nghiệp Vụ Cốt Lõi (Invariants)
1. **Thời lượng dịch vụ**: Bắt buộc là bội số của 15 phút (15 - 240 phút), giá tiền không âm và <= 20.000.000 đ.
2. **Khung giờ trống**: Chia theo lưới 15 phút, chặn giờ quá khứ và chặn giờ cách hiện tại dưới 60 phút.
3. **Chống đặt trùng & Phân thợ**: Dùng `SERIALIZABLE` + `FOR UPDATE` + Postgres `EXCLUDE` constraint (`appointments_no_overlap`). Khi chọn "Thợ bất kỳ", tự động ưu tiên thợ ít lịch nhất; nếu bị giành ca, tự động phân lại thợ rảnh kế tiếp (tối đa 5 lần).
4. **Bảo mật & Rate Limit**: Tối đa 5 lượt đặt/IP/giờ (429); tối đa 3 lịch chưa hoàn tất/SĐT; khóa tra cứu 30 phút sau 10 lần sai.
5. **Dữ liệu tham chiếu**: Không xóa cứng Dịch vụ / Thợ / Người dùng đã có lịch hẹn hoặc hóa đơn trong quá khứ.
