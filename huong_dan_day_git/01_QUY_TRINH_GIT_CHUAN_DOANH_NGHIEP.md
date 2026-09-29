# 📘 QUY TRÌNH GIT WORKFLOW CHUẨN DOANH NGHIỆP (GIT FLOW)

Tài liệu này quy định tiêu chuẩn làm việc với Git cho toàn bộ 10 thành viên nhóm trong suốt các Sprint.

---

## 🌳 1. Mô Hình Phân Nhánh (Branching Model)

```
[main]        -----------------------------------------------------> (Bản phát hành chính thức / Nộp bài)
                 ^                                             |
                 | (Merge sau mỗi Sprint)                      |
[develop]     -----------------------------------------------------> (Tích hợp tính năng hàng ngày)
                 ^                         ^              ^
                 | (Pull Request)          |              |
[feature/...] ---+ (Nam Khánh)             |              |
[docs/...]    -----------------------------+ (Mạnh / Long)|
[test/...]    --------------------------------------------+ (Hương / Quốc Khánh)
```

### Chi tiết các loại nhánh:
*   `main`: Nhánh chạy ổn định tuyệt đối, đã qua nghiệm thu của Product Owner (Thầy Cấn Tuấn Anh). Không ai được phép commit/push thẳng.
*   `develop`: Nhánh tích hợp trung tâm của cả nhóm. Mọi tính năng sau khi hoàn thành sẽ được tạo Pull Request (PR) để gộp vào đây.
*   `feature/<tên-thành-viên>-<chức-năng>`: Nhánh phát triển tính năng mới của từng thành viên.
*   `fix/<tên-thành-viên>-<lỗi>`: Nhánh sửa lỗi phát sinh từ QA/Tester.
*   `docs/<tên-thành-viên>-<nội-dung>`: Nhánh viết báo cáo Word, tài liệu API, Markdown.
*   `test/<tên-thành-viên>-<kịch-bản>`: Nhánh viết kịch bản test case và dữ liệu kiểm thử.

---

## 📝 2. Quy Chuẩn Commit Message (Conventional Commits)

Mỗi commit phải giải thích rõ ràng **mục đích** của thay đổi. Format bắt buộc:

```
<tiền_tố>(<phạm_vi>): <mô tả ngắn gọn bằng tiếng Việt không dấu hoặc có dấu>
```

### Các tiền tố hợp lệ:
*   `feat`: Thêm tính năng mới (VD: `feat(booking): tao giao dien chon ngay va gio`)
*   `fix`: Sửa lỗi (VD: `fix(auth): sua loi token bi het han khong redirect`)
*   `docs`: Cập nhật tài liệu, báo cáo (VD: `docs(report): hoan thien chuong 2 khao sat hien trang`)
*   `test`: Viết test case, bổ sung kịch bản kiểm thử (VD: `test(qa): them 20 test case kiem thu dat lich`)
*   `refactor`: Tái cấu trúc, tối ưu code mà không đổi tính năng (VD: `refactor(api): toi uu cau truy van thoi luong`)
*   `chore`: Cập nhật cấu hình, cài đặt thư viện (VD: `chore(deps): them thu vien recharts cho bieu do`)

---

## 🔄 3. Quy Trình 5 Bước Làm Việc Hàng Ngày Của Thành Viên

### Bước 1: Đồng bộ mã nguồn mới nhất
Trước khi bắt đầu bất kỳ công việc nào, hãy cập nhật nhánh `develop` trên máy:
```bash
git checkout develop
git pull origin develop
```

### Bước 2: Tạo nhánh làm việc mới từ `develop`
```bash
# Ví dụ: Thành viên Nam Khánh làm giao diện đặt lịch
git checkout -b feature/namkhanh-public-booking
```

### Bước 3: Viết code và kiểm tra cục bộ
*   Thực hiện chỉnh sửa file theo đúng phạm vi được giao.
*   Chạy thử ứng dụng để chắc chắn không bị lỗi:
    ```bash
    npm run lint
    npm run build
    ```

### Bước 4: Lưu thay đổi (Commit) và đẩy lên GitHub (Push)
```bash
git add .
git commit -m "feat(public): hoan thien trang chon dich vu va gio hen"
git push -u origin feature/namkhanh-public-booking
```

### Bước 5: Mở Pull Request (PR) trên GitHub
1. Truy cập vào repo GitHub: `https://github.com/steveprovip/thucTap_HeThongDatLichSPA`
2. Bấm vào nút màu vàng **"Compare & pull request"**.
3. Chọn:
   - **Base:** `develop`
   - **Compare:** `feature/namkhanh-public-booking` (nhánh của bạn)
4. Điền nội dung PR theo mẫu có sẵn (Template đã được cấu hình tự động).
5. Gán Reviewer là **@steveprovip** (Tech Lead).
6. Bấm **Create pull request**.

---

## 🛡️ 4. Quy Trình Phê Duyệt & Merge Của Tech Lead
1. Tech Lead nhận thông báo PR, kiểm tra code và chạy CI tự động.
2. Nếu có lỗi: Tech Lead sẽ comment trực tiếp trên dòng code hoặc đẩy commit hỗ trợ.
3. Khi đạt yêu cầu: Tech Lead bấm **Approve** và chọn **Squash and merge** hoặc **Rebase and merge** vào `develop`.
4. Thành viên ở máy cá nhân chuyển về `develop` và pull code mới:
   ```bash
   git checkout develop
   git pull origin develop
   # Xóa nhánh cũ trên máy cho gọn
   git branch -d feature/namkhanh-public-booking
   ```
