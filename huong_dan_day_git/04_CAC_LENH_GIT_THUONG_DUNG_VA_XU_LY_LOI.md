# 🆘 SỔ TAY CÁC LỆNH GIT THƯỜNG DÙNG & XỬ LÝ SỰ CỐ NHANH

---

## 📌 1. Các Lệnh Git Cơ Bản Hằng Ngày

| Nhu Cầu | Câu Lệnh |
| :--- | :--- |
| **Kiểm tra trạng thái file** | `git status` |
| **Xem lịch sử commit ngắn gọn** | `git log --oneline -n 10` |
| **Chuyển sang nhánh khác** | `git checkout <tên_nhánh>` |
| **Tạo và chuyển sang nhánh mới** | `git checkout -b <tên_nhánh_mới>` |
| **Kéo code mới nhất từ remote** | `git pull origin <tên_nhánh>` |
| **Lưu tạm thời code chưa commit** | `git stash` (Khôi phục lại: `git stash pop`) |
| **Xóa file hoặc bỏ thay đổi của 1 file** | `git checkout -- <đường_dẫn_file>` |

---

## 🛠️ 2. Xử Lý Các Sự Cố Thường Gặp

### Tình huống 1: Bị từ chối khi Push (`[rejected - non-fast-forward]`)
*   **Nguyên nhân:** Trên GitHub đã có commit mới hơn (do Leader vừa sửa hoặc người khác vừa push).
*   **Cách giải quyết:**
    ```bash
    # 1. Kéo code mới về và kết hợp vào nhánh của bạn
    git pull origin <tên_nhánh_của_bạn>
    
    # 2. Sau đó push lại bình thường
    git push origin <tên_nhánh_của_bạn>
    ```

---

### Tình huống 2: Xung đột code (`CONFLICT: Merge conflict in ...`)
*   **Nguyên nhân:** Cả bạn và Leader cùng sửa vào cùng một dòng trong một file.
*   **Cách giải quyết:**
    1. Mở file bị conflict bằng VS Code.
    2. Bạn sẽ thấy các khối:
       ```
       <<<<<<< HEAD (Code hiện tại trên máy bạn)
       const a = 1;
       =======
       const a = 2; (Code trên GitHub)
       >>>>>>> develop
       ```
    3. Chọn **"Accept Current Change"**, **"Accept Incoming Change"**, hoặc **"Accept Both Changes"** tùy theo logic đúng.
    4. Xóa các ký hiệu `<<<<<<<`, `=======`, `>>>>>>>` và lưu file.
    5. Chạy lệnh:
       ```bash
       git add .
       git commit -m "fix(merge): giai quyet xung dot code"
       git push origin <tên_nhánh_của_bạn>
       ```

---

### Tình huống 3: Lỡ commit nhầm file `.env` hoặc file tạm
*   **Cách hủy commit gần nhất mà giữ nguyên code trong máy:**
    ```bash
    git reset --soft HEAD~1
    ```
    Sau đó thêm file `.gitignore` để bỏ qua file nhạy cảm rồi commit lại.

---

### Tình huống 4: Muốn xóa hoàn toàn các sửa đổi chưa commit để quay về trạng thái sạch sẽ
```bash
git reset --hard HEAD
git clean -fd
```
*(⚠️ Lưu ý: Lệnh này sẽ xóa toàn bộ code chưa commit, hãy cẩn thận trước khi gõ).*

---

### Tình huống 5: Bị rơi vào trạng thái `HEAD detached`
*   **Nguyên nhân:** Bạn vừa checkout vào một mã commit thay vì tên nhánh.
*   **Cách giải quyết:**
    ```bash
    git checkout develop
    ```
