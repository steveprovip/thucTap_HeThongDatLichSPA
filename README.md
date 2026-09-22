# Hệ Thống Đặt Lịch SPA (thucTap_HeThongDatLichSPA)

Dự án phát triển Hệ thống đặt lịch hẹn dịch vụ SPA phục vụ cho kỳ thực tập tốt nghiệp.

---

## 🌳 Chiến Lược Phân Nhánh (Git Flow Branching Model)

Dự án tuân thủ mô hình Git Flow tiêu chuẩn với 5 nhánh chính:

| Nhánh (Branch) | Loại nhánh | Mục đích & Vai trò |
| :--- | :--- | :--- |
| `main` | **Nhánh chính** | Chứa mã nguồn chính thức, ổn định và sẵn sàng đưa lên môi trường chạy thực tế (Production). |
| `develop` | **Nhánh phát triển** | Tích hợp mã nguồn từ các tính năng trước khi đưa vào nhánh chính. |
| `feature/init` | **Nhánh tính năng** (`feature/*`) | Dùng để viết code cho từng tính năng mới riêng biệt. |
| `release/v1.0.0` | **Nhánh phát hành** (`release/*`) | Chuẩn bị cho bản phát hành mới, kiểm thử và sửa lỗi nhỏ trước khi gộp vào `main`. |
| `hotfix/v1.0.1` | **Nhánh sửa lỗi khẩn cấp** (`hotfix/*`) | Sửa lỗi khẩn cấp trực tiếp từ bản chạy thực tế (`main`). |

---

## 🛠️ Quy trình làm việc đề xuất (Workflow)

1. **Phát triển tính năng mới:**
   ```bash
   git checkout develop
   git checkout -b feature/<ten-tinh-nang>
   # Thực hiện commit và push lên remote
   git push -u origin feature/<ten-tinh-nang>
   # Tạo Pull Request (PR) hợp nhất vào nhánh develop
   ```

2. **Chuẩn bị phát hành:**
   ```bash
   git checkout develop
   git checkout -b release/v1.0.0
   # Kiểm thử, đóng gói phiên bản, sau đó merge vào cả main và develop
   ```

3. **Vá lỗi khẩn cấp trên Production:**
   ```bash
   git checkout main
   git checkout -b hotfix/<ten-loi>
   # Fix lỗi xong merge vào cả main và develop
   ```
