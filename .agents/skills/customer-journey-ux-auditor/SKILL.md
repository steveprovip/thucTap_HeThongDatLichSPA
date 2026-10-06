---
name: customer-journey-ux-auditor
description: End-to-end customer and salon owner journey simulation. Tests real-world friction points, edge cases, reception check-in, booking UX, VietQR payment, and client handoff experience.
---

# Customer Journey & UX Auditor Protocol

## 1. Persona Testing
1. **Khách hàng đặt lịch online (Mobile/Desktop)**:
   - Thao tác chọn dịch vụ -> chọn khung giờ -> chọn thợ -> điền SĐT & Tên -> Xác nhận.
   - Nhận mã tra cứu 8 ký tự, email xác nhận trong 2 phút, mã VietQR thanh toán.
2. **Lễ tân tiếp đón & Check-in**:
   - Mở màn hình Lịch ngày (Day Timeline) / Chờ xác nhận (Pending).
   - Check-in đúng giờ / muộn > 15 phút / Đổi thợ / Dời giờ / Báo vãng lai (Walk-in).
3. **Thợ làm đẹp (Stylist)**:
   - Xem lịch cá nhân trên điện thoại (SĐT khách che dạng 09***123).
   - Bắt đầu dịch vụ -> Hoàn tất -> Đăng ký ca làm & ngày nghỉ.
4. **Chủ tiệm (Salon Owner)**:
   - Xem Dashboard doanh thu hôm nay, tỷ lệ no-show, xuất báo cáo CSV.
   - Thiết lập bảng giá, giờ mở cửa, duyệt ca làm của thợ.
