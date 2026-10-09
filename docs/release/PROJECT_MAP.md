# Bản đồ dự án và quy ước tổ chức

Không có một cây thư mục quốc tế duy nhất bắt buộc cho mọi web app. Quy ước dưới đây giúp người mới tìm đúng nguồn và giúp phát hành không mang cache/bí mật.

- `backend/`: mã API, model, migration và test backend.
- `frontend/`: mã giao diện, test và cấu hình build.
- `deploy/`: cấu hình hạ tầng và proxy.
- `scripts/`: công cụ vận hành/kiểm chứng, script test riêng.
- `docs/release/`: hồ sơ hiện tại đồng bộ theo phiên bản.
- `docs/requirements/` hoặc `de_tai_08.md`: đề tài gốc và tiêu chí nghiệp vụ.
- `docs/reports/`, `docs/presentations/` hoặc `CacGiaiDoanThucHien/`: báo cáo học phần lịch sử.
- `.runtime/`, `logs/`, `backups/`, `node_modules/`, `.env*` thật: trạng thái chạy, không phải bản bàn giao mã công khai.

Bước tổ chức đã làm là thêm điểm vào docs/release và danh mục hiện tại. Chưa di chuyển hàng loạt tài liệu cũ vì script tạo báo cáo và liên kết đang dùng đường dẫn đó. Muốn chuyển sang docs/archive cần cập nhật toàn bộ tham chiếu rồi kiểm thử bộ sinh tài liệu.

Phân loại nội dung theo Diataxis: hướng dẫn bắt đầu, cách thao tác, tham chiếu kỹ thuật và giải thích kiến trúc. Thư mục là quy ước của dự án, không phải lời chứng nhận đạt một tiêu chuẩn quốc tế.
