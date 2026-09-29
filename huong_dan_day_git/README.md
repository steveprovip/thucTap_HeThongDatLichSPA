# 🚀 HỆ THỐNG HƯỚNG DẪN ĐẨY CODE GITHUB CHUẨN DOANH NGHIỆP & LƯU VẾT LỊCH SỬ
### Dự án: Hệ Thống Đặt Lịch Và Quản Lý Vận Hành Salon - Spa
**Học phần:** TTCS_T926_K2S3_N3 | **Nhóm:** Nhóm 3 (10 Thành Viên)  
**Product Owner (GVHD):** ThS. Cấn Tuấn Anh | **Tech Lead:** Nguyễn Duy Linh

---

## 📂 Danh Mục Tài Liệu Hướng Dẫn Trong Thư Mục Này

| Tệp Tài Liệu | Nội Dung Chính | Đối Tượng Sử Dụng |
| :--- | :--- | :--- |
| **[`01_QUY_TRINH_GIT_CHUAN_DOANH_NGHIEP.md`](./01_QUY_TRINH_GIT_CHUAN_DOANH_NGHIEP.md)** | Cẩm nang quy trình Git Flow: Cấu trúc nhánh, quy tắc đặt tên, Conventional Commits, cách mở Pull Request (PR). | Toàn bộ 10 thành viên |
| **[`02_HUONG_DAN_CHI_TIET_10_THANH_VIEN.md`](./02_HUONG_DAN_CHI_TIET_10_THANH_VIEN.md)** | **Bảng phân công chi tiết cho 10 thành viên** (theo Báo Cáo Thực Tập): Tên nhánh, thư mục quản lý, tập lệnh mẫu copy-paste để tạo commit. | Từng thành viên tra cứu nhiệm vụ của mình |
| **[`03_KIEU_GIAI_QUYET_KHI_LEADER_SUA_HO_CODE.md`](./03_KIEU_GIAI_QUYET_KHI_LEADER_SUA_HO_CODE.md)** | **Bí kíp cứu cánh:** Leader tự code/sửa hệ thống nhưng thành viên vẫn có 100% commit xanh trên GitHub để chấm điểm. | Leader & Thành viên cần hỗ trợ |
| **[`04_CAC_LENH_GIT_THUONG_DUNG_VA_XU_LY_LOI.md`](./04_CAC_LENH_GIT_THUONG_DUNG_VA_XU_LY_LOI.md)** | Sổ tay xử lý lỗi Git: Bị từ chối push, xung đột (conflict), lỡ commit nhầm file, hoàn tác code. | Toàn bộ 10 thành viên |

---

## ⚡ 3 Bước Khởi Động Nhanh (Dành Cho Thành Viên Mới)

### Bước 1: Thiết lập tên tác giả Git trên máy cá nhân
Chạy file script tự động trong thư mục `scripts/`:
*   **Trên Windows:** Nhấp đúp chuột vào file `scripts/setup_git_workflow.bat` rồi nhập Họ tên và Email GitHub.
*   **Trên macOS/Linux:** Mở terminal chạy `bash scripts/setup_git_workflow.sh`.

### Bước 2: Luôn cập nhật mã nguồn mới nhất từ nhánh `develop`
```bash
git checkout develop
git pull origin develop
```

### Bước 3: Tạo nhánh riêng theo đúng tên nhiệm vụ được giao
Tra cứu tên nhánh của bạn trong file **[`02_HUONG_DAN_CHI_TIET_10_THANH_VIEN.md`](./02_HUONG_DAN_CHI_TIET_10_THANH_VIEN.md)**, ví dụ:
```bash
git checkout -b feature/namkhanh-public-booking
```

---

## ⛔ 4 QUY TẮC BẤT DI BẤT DỊCH (VI PHẠM SẼ BỊ TỪ CHỐI REVIEW)
1. ❌ **TUYỆT ĐỐI KHÔNG push trực tiếp vào `main` hoặc `develop`.** Mọi code phải đi qua nhánh riêng (`feature/...`, `docs/...`) và mở Pull Request (PR).
2. ❌ **KHÔNG BAO GIỜ commit file `.env`, file cấu hình nhạy cảm hoặc thư mục `node_modules/`.**
3. ✅ **Trước khi code hoặc commit phải `git pull origin develop`** để tránh bị xung đột code cũ.
4. ✅ **Commit message phải có tiền tố rõ ràng:** `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
