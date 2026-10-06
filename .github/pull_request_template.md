# 📋 Pull Request Review & Merge Template

## 📌 1. Thông Tin Chung
- **Mã User Story / Epic:** `EP-XX` / `SXX-XX` (Xem `docs/BACKLOG-MAPPING.md`)
- **Thành viên thực hiện:** @ten_github
- **Loại thay đổi (Check [x]):**
  - [ ] `feat`: Tính năng mới
  - [ ] `fix`: Sửa lỗi hệ thống
  - [ ] `docs`: Cập nhật tài liệu / báo cáo
  - [ ] `refactor`: Tối ưu hóa / tái cấu trúc mã nguồn
  - [ ] `test`: Bổ sung kiểm thử tự động / kịch bản test
  - [ ] `chore`: Cấu hình, script, công cụ hỗ trợ

---

## 🎯 2. Mô Tả Thay Đổi & Nhiệm Vụ Đạt Được
<!-- Tóm tắt ngắn gọn các file đã thay đổi và chức năng hoàn thành -->
- 
- 

---

## 🔍 3. Checklist Tự Kiểm Tra (Dành Cho Tác Giả PR)
- [ ] Nhánh đặt tên đúng mô hình `feature/*` · `fix/*` · `docs/*`, tách từ `develop` mới nhất (`git pull origin develop`) — xem `docs/guides/git/GIT-BRANCHING.md`.
- [ ] Commit message tuân thủ đúng chuẩn Conventional Commits (`feat(...)`, `fix(...)`, `docs(...)`).
- [ ] Chạy `npm run lint` không có bất kỳ warning/error nào (`--max-warnings 0`).
- [ ] Chạy `npm run build` thành công trên cả backend và frontend.
- [ ] Không commit các file nhạy cảm: `.env`, `node_modules/`, log rác.

---

## 🧪 4. Bằng Chứng Kiểm Thử (Proof of Testing)
- [ ] Đã test cục bộ trên máy cá nhân với CSDL mẫu.
- [ ] Đính kèm ảnh chụp màn hình / video ngắn chứng minh chức năng hoạt động đúng (nếu có).

---

## 👑 5. Phê Duyệt Của Tech Lead / Reviewer
- [ ] Code logic chuẩn, không gây conflict hoặc break module khác.
- [ ] Đạt Definition of Done (DoD) của Sprint.
- [ ] Đủ điều kiện merge vào `develop`.
