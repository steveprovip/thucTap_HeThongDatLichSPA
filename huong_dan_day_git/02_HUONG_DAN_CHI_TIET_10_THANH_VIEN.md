# 👥 HƯỚNG DẪN ĐẨY GIT CHI TIẾT CHO TỪNG THÀNH VIÊN (10 THÀNH VIÊN)
*(Trích xuất chính xác theo Ma trận Phân công Bảng 2.5 & Bảng 2.6 trong Báo Cáo Thực Tập)*

---

## 📋 BẢNG TỔNG HỢP PHÂN CÔNG NHÁNH & PHẠM VI

| STT | Họ và Tên | Vai Trò | Tên Nhánh Quy Định | Thư Mục / File Phụ Trách |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Nguyễn Duy Linh** | Tech Lead · Nhóm trưởng | `main`, `develop` | Toàn quyền kiến trúc backend, DB, review & merge PR |
| **2** | **Lê Thị Phương Linh** | Phó nhóm · Phụ trách tài liệu | `docs/phuonglinh-scrum-report` | `docs/report/`, tài liệu quy trình Scrum, theo dõi Point |
| **3** | **Trương Quốc Khánh** | QA · Test Lead | `test/quockhanh-qa-acceptance` | `docs/DEMO-SCRIPT.md`, `docs/BACKLOG-MAPPING.md`, bug list |
| **4** | **Nguyễn Nam Khánh** | Dev Frontend (Khách hàng) | `feature/namkhanh-public-booking` | `frontend/src/pages/public/` (Home, Booking, Lookup) |
| **5** | **Bùi Quang Minh** | Dev Frontend (Quản trị) | `feature/quangminh-admin-portal` | `frontend/src/pages/admin/` (Services, Stylists, Hours) |
| **6** | **Nguyễn Thị Hương** | Tester | `test/huong-test-cases` | `docs/qa/`, `docs/Test_Cases_Salon_Spa.xlsx` |
| **7** | **Dương Đức Mạnh** | Phân tích yêu cầu | `docs/ducmanh-survey-analysis` | `docs/report/` (Chương 1, Chương 2, Khảo sát hiện trạng) |
| **8** | **Phương Đình Khoa Nam** | Thiết kế sơ đồ | `docs/khoanam-system-diagrams` | `docs/diagrams/` (.drawio, .png, sơ đồ ERD, Use Case) |
| **9** | **Nguyễn Hoàng Long** | Slide & Hình ảnh | `docs/hoanglong-slide-deck` | `docs/assets/screenshots/`, Slide thuyết trình nghiệm thu |
| **10**| **Phạm Mậu Lực** | Dữ liệu mẫu & Video | `chore/mauluc-seed-demo-media` | `database/seed-data-real.sql`, `docs/demo-video/` |

---

## 📌 HƯỚNG DẪN CHI TIẾT TỪNG THÀNH VIÊN (CÁC LỆNH COPY-PASTE)

---

### 1. Nguyễn Duy Linh (Tech Lead · Nhóm trưởng)
*   **Nhiệm vụ:** Backend NestJS, CSDL PostgreSQL, giải thuật tính khung giờ 15 phút, khóa chống đặt trùng (SERIALIZABLE + EXCLUDE), bảo vệ nhánh và duyệt Merge PR.
*   **Quy trình:**
    ```bash
    # 1. Đồng bộ develop
    git checkout develop
    git pull origin develop

    # 2. Duyệt PR của thành viên trên GitHub Web hoặc sửa trực tiếp (xem File 03)
    ```

---

### 2. Lê Thị Phương Linh (Phó nhóm · Tài liệu Scrum)
*   **Nhiệm vụ:** Soạn thảo báo cáo Word, cấu trúc chương mục, quản lý Story Point 4 Sprint và Definition of Done.
*   **Các lệnh thực hiện trên máy của Phương Linh:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b docs/phuonglinh-scrum-report

    # Sau khi cập nhật file trong docs/
    git add docs/
    git commit -m "docs(scrum): cap nhat bao cao tien do sprint va tong hop story point"
    git push -u origin docs/phuonglinh-scrum-report
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 3. Trương Quốc Khánh (QA · Test Lead)
*   **Nhiệm vụ:** Cập nhật kịch bản nghiệm thu `DEMO-SCRIPT.md`, bảng ánh xạ `BACKLOG-MAPPING.md`, điều phối test 39 user story.
*   **Các lệnh thực hiện trên máy của Quốc Khánh:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b test/quockhanh-qa-acceptance

    # Sau khi chỉnh sửa file nghiệm thu
    git add docs/DEMO-SCRIPT.md docs/BACKLOG-MAPPING.md
    git commit -m "test(acceptance): ra soat kich ban nghiem thu 39 user story va log loi sprint 1"
    git push -u origin test/quockhanh-qa-acceptance
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 4. Nguyễn Nam Khánh (Dev Frontend – Phân hệ Khách hàng)
*   **Nhiệm vụ:** Giao diện đặt lịch công khai (`HomePage`, `Step1Services`, `Step2Slot`, `LookupPage`), câu chữ tiếng Việt và tối ưu hiển thị di động (360px).
*   **Các lệnh thực hiện trên máy của Nam Khánh:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b feature/namkhanh-public-booking

    # Sau khi viết/chỉnh giao diện trong frontend/src/pages/public/
    git add frontend/src/pages/public/
    git commit -m "feat(public-ui): toi uu giao dien dat lich 4 buoc va responsive mobile 360px"
    git push -u origin feature/namkhanh-public-booking
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```
    > 💡 *Nếu chưa tự tin về logic: Nam Khánh tạo khung giao diện cơ bản rồi push lên, Tech Lead sẽ kéo nhánh về hỗ trợ hoàn thiện.*

---

### 5. Bùi Quang Minh (Dev Frontend – Phân hệ Quản trị)
*   **Nhiệm vụ:** Quản lý dịch vụ (`ServicesPage`), Quản lý thợ (`StylistsPage`), Giờ mở cửa (`WorkingHoursPage`), kiểm tra ràng buộc form.
*   **Các lệnh thực hiện trên máy của Quang Minh:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b feature/quangminh-admin-portal

    # Sau khi cập nhật các trang trong frontend/src/pages/admin/
    git add frontend/src/pages/admin/
    git commit -m "feat(admin): hoan thien form quan ly dich vu va rang buoc thoi luong boi so 15"
    git push -u origin feature/quangminh-admin-portal
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 6. Nguyễn Thị Hương (Tester)
*   **Nhiệm vụ:** Lập bảng Test Cases chi tiết (Excel/Markdown), ghi nhận Pass/Fail cho từng ca kiểm thử.
*   **Các lệnh thực hiện trên máy của Hương:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b test/huong-test-cases

    # Thêm bảng test case vào docs/qa/
    git add docs/
    git commit -m "test(cases): bo sung 35 test case kiem thu giao dien va phan quyen 5 vai tro"
    git push -u origin test/huong-test-cases
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 7. Dương Đức Mạnh (Phân tích yêu cầu)
*   **Nhiệm vụ:** Soạn thảo Chương 1 & Chương 2: Khảo sát hiện trạng, so sánh phần mềm với phương pháp ghi sổ/Zalo truyền thống, phân tích lợi ích.
*   **Các lệnh thực hiện trên máy của Mạnh:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b docs/ducmanh-survey-analysis

    # Sau khi cập nhật nội dung chương khảo sát
    git add docs/
    git commit -m "docs(analysis): bo sung noi dung khao sat thuc trang va ma tran loi ich he thong"
    git push -u origin docs/ducmanh-survey-analysis
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 8. Phương Đình Khoa Nam (Thiết kế sơ đồ hệ thống)
*   **Nhiệm vụ:** Vẽ sơ đồ Use Case tổng thể, sơ đồ CSDL 24 bảng (ERD), sơ đồ luồng dữ liệu (Data Flow) dạng Draw.io và xuất ảnh PNG.
*   **Các lệnh thực hiện trên máy của Khoa Nam:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b docs/khoanam-system-diagrams

    # Thêm sơ đồ vào docs/diagrams/
    git add docs/
    git commit -m "docs(diagrams): cap nhat so do Use Case tong the va ERD 24 bang PostgreSQL"
    git push -u origin docs/khoanam-system-diagrams
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 9. Nguyễn Hoàng Long (Slide & Hình ảnh minh họa)
*   **Nhiệm vụ:** Soạn Slide thuyết trình báo cáo theo từng Sprint, chụp ảnh màn hình các chức năng để chèn vào báo cáo.
*   **Các lệnh thực hiện trên máy của Long:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b docs/hoanglong-slide-deck

    # Thêm ảnh chụp và slide vào docs/
    git add docs/
    git commit -m "docs(slide): cap nhat slide thuyet trinh sprint 4 va bo anh chup man hinh giao dien"
    git push -u origin docs/hoanglong-slide-deck
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```

---

### 10. Phạm Mậu Lực (Dữ liệu mẫu & Video Demo)
*   **Nhiệm vụ:** Soạn kịch bản dữ liệu thực tế (tên dịch vụ, thợ, giá thực tế), tạo file seed data SQL và quay video demo luồng đặt lịch hoàn chỉnh.
*   **Các lệnh thực hiện trên máy của Lực:**
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b chore/mauluc-seed-demo-media

    # Thêm file dữ liệu mẫu hoặc link demo
    git add database/ docs/
    git commit -m "chore(seed): bo sung du lieu mau thuc te cho 20 dich vu spa va anh mau thợ"
    git push -u origin chore/mauluc-seed-demo-media
    # Lên GitHub bấm Tạo Pull Request vào develop
    ```
