# -*- coding: utf-8 -*-
"""
Dữ liệu dùng chung cho build_report_docx.py và build_slides_pptx.py.

Mọi con số ở đây được đối chiếu trực tiếp với mã nguồn (xem chú thích từng mục).
Sửa ở đây một lần -> chạy lại cả hai script là báo cáo và slide khớp nhau.
"""

# ---------------------------------------------------------------- Thông tin chung
UNIVERSITY_PARENT = "ĐẠI HỌC THÁI NGUYÊN"
UNIVERSITY = "TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN VÀ TRUYỀN THÔNG"
FACULTY = "KHOA CÔNG NGHỆ THÔNG TIN"
REPORT_KIND = "BÁO CÁO THỰC TẬP TỐT NGHIỆP"
TITLE = "XÂY DỰNG HỆ THỐNG ĐẶT LỊCH VÀ QUẢN LÝ VẬN HÀNH SALON - SPA"
TITLE_SHORT = "Hệ thống Đặt lịch và Quản lý Vận hành Salon - Spa"
CLASS_CODE = "TTCS_T926_K2S3_N3"
TEAM = "Nhóm 3"
ADVISOR = "ThS. Cấn Tuấn Anh"
PLACE_DATE = "Thái Nguyên, tháng 10 năm 2026"
REPO_URL = "https://github.com/steveprovip/thucTap_HeThongDatLichSPA"

# ---------------------------------------------------------------- Thành viên
# Nguồn: "Bảng phân công chi tiết theo từng người.docx". MSSV chưa có -> điền vào "mssv" rồi chạy lại.
MEMBERS = [
    {"name": "Nguyễn Duy Linh", "mssv": "", "role": "Nhóm trưởng · Tech Lead",
     "task": "Backend NestJS, CSDL (trigger, ràng buộc), giải thuật tính khung giờ, chống đặt trùng; review và merge Pull Request",
     "output": "Mã nguồn backend, schema.sql, kiến trúc hệ thống",
     "areas": {"be": "C", "fe": "H", "test": "H", "doc": "H", "demo": "C", "ops": "C"}},
    {"name": "Lê Thị Phương Linh", "mssv": "", "role": "Phó nhóm · Phụ trách tài liệu",
     "task": "Chuẩn hoá báo cáo Word theo mẫu của trường; viết chương Kiến trúc và Quy trình Scrum; theo dõi Sprint, Story Point",
     "output": "Báo cáo tổng hợp, tài liệu quy trình Scrum",
     "areas": {"be": "", "fe": "", "test": "", "doc": "C", "demo": "H", "ops": ""}},
    {"name": "Trương Quốc Khánh", "mssv": "", "role": "QA · Test Lead",
     "task": "Kịch bản nghiệm thu (DEMO-SCRIPT), đối chiếu 39 user story (BACKLOG-MAPPING); điều phối kiểm thử thủ công, báo lỗi",
     "output": "docs/DEMO-SCRIPT.md, docs/BACKLOG-MAPPING.md, danh sách lỗi",
     "areas": {"be": "", "fe": "", "test": "C", "doc": "H", "demo": "C", "ops": ""}},
    {"name": "Nguyễn Nam Khánh", "mssv": "", "role": "Dev Frontend – phân hệ Khách",
     "task": "Trang công khai: HomePage, Step1Services, Step2Slot, LookupPage; câu chữ tiếng Việt, bố cục nút, kiểm tra trên di động",
     "output": "frontend/src/pages/public",
     "areas": {"be": "", "fe": "C", "test": "H", "doc": "", "demo": "H", "ops": ""}},
    {"name": "Bùi Quang Minh", "mssv": "", "role": "Dev Frontend – phân hệ Quản trị",
     "task": "ServicesPage, StylistsPage, WorkingHoursPage; kiểm tra ràng buộc biểu mẫu (giá không âm, thời lượng bội số 15 phút)",
     "output": "frontend/src/pages/admin",
     "areas": {"be": "", "fe": "C", "test": "H", "doc": "", "demo": "H", "ops": ""}},
    {"name": "Nguyễn Thị Hương", "mssv": "", "role": "Tester",
     "task": "Soạn bộ Test Case từ DEMO-SCRIPT, chạy thử trên web và ghi Pass/Fail; phụ trách các ticket QA trên Jira",
     "output": "docs/testing/Test_Cases_Salon_Spa.xlsx",
     "areas": {"be": "", "fe": "", "test": "C", "doc": "", "demo": "", "ops": ""}},
    {"name": "Dương Đức Mạnh", "mssv": "", "role": "Phân tích yêu cầu",
     "task": "Viết Chương 1–2: lý do chọn đề tài, khảo sát hiện trạng (sổ tay, Zalo), so sánh hệ thống mới với cách làm cũ",
     "output": "docs/report/ (Chương 1, 2)",
     "areas": {"be": "", "fe": "", "test": "", "doc": "C", "demo": "H", "ops": ""}},
    {"name": "Phương Đình Khoa Nam", "mssv": "", "role": "Thiết kế sơ đồ",
     "task": "Vẽ sơ đồ Use Case, sơ đồ CSDL 26 bảng, luồng nghiệp vụ trên Draw.io / StarUML và xuất ảnh chèn báo cáo",
     "output": "docs/diagrams/ (.drawio, .png)",
     "areas": {"be": "", "fe": "", "test": "", "doc": "C", "demo": "", "ops": ""}},
    {"name": "Nguyễn Hoàng Long", "mssv": "", "role": "Slide & hình ảnh",
     "task": "Slide nghiệm thu theo Sprint; chụp ảnh màn hình từng chức năng cho báo cáo; đóng vai khách hàng khi demo",
     "output": "Slide_Nghiem_Thu_Sprint.pptx, ảnh màn hình",
     "areas": {"be": "", "fe": "", "test": "", "doc": "H", "demo": "C", "ops": ""}},
    {"name": "Phạm Mậu Lực", "mssv": "", "role": "Dữ liệu mẫu & video demo",
     "task": "Soạn danh sách dịch vụ cắt – uốn – nhuộm kèm giá thực tế, ảnh thợ; quay video một luồng đặt lịch hoàn chỉnh",
     "output": "backend/database/seed-data-real.sql, video demo",
     "areas": {"be": "", "fe": "", "test": "", "doc": "", "demo": "H", "ops": "C"}},
]
AREAS = [("be", "Backend & CSDL"), ("fe", "Frontend"), ("test", "Kiểm thử"),
         ("doc", "Tài liệu & sơ đồ"), ("demo", "Slide & demo"), ("ops", "Dữ liệu mẫu & hạ tầng")]

# ---------------------------------------------------------------- Product Backlog
# Nguồn: docs/BACKLOG-MAPPING.md
EPICS = [
    ("EP-01", "Tài khoản và phân quyền", 7, 27),
    ("EP-02", "Dịch vụ, thợ và lịch làm việc", 6, 27),
    ("EP-03", "Đặt lịch công khai và tính khung giờ trống", 7, 31),
    ("EP-04", "Vận hành lịch hẹn hằng ngày", 9, 39),
    ("EP-05", "Thanh toán và hồ sơ khách hàng", 5, 23),
    ("EP-06", "Nhắc lịch, thông báo và báo cáo", 5, 18),
]

STORIES = [
    ("S1-01", "EP-01", "Đăng nhập, khoá 15 phút sau 5 lần sai, JWT 30 phút / 7 ngày"),
    ("S1-02", "EP-01", "Tạo / sửa / ngưng hoạt động tài khoản, mật khẩu tạm, chặn ngưng admin cuối cùng"),
    ("S1-03", "EP-01", "4 vai trò nhân sự; khách dùng trang công khai; menu theo quyền, API trả 403"),
    ("S1-04", "EP-01", "Đổi mật khẩu, quên mật khẩu, liên kết 30 phút dùng một lần"),
    ("S1-05", "EP-02", "Dịch vụ: thời lượng bội số 15 (15–240), giá ≤ 20.000.000 đ, không xoá khi đã có lịch"),
    ("S1-06", "EP-02", "Nhóm dịch vụ, thứ tự hiển thị, chặn xoá nhóm còn dịch vụ"),
    ("S1-07", "EP-02", "Hồ sơ thợ, ảnh ≤ 2 MB, kỹ năng nhiều – nhiều"),
    ("S1-08", "EP-02", "Giờ mở cửa theo thứ, chênh tối thiểu 60 phút"),
    ("S1-09", "EP-01", "Nhật ký hoạt động chỉ đọc, lọc theo ngày và tài khoản"),
    ("S1-10", "EP-01", "Môi trường staging một lệnh + dữ liệu mẫu chạy lại không nhân đôi"),
    ("S2-01", "EP-02", "Ca làm theo tuần, nghỉ giữa ca, chống chồng lấn, sao chép tuần"),
    ("S2-02", "EP-02", "Ngày nghỉ tiệm / thợ; xác nhận lịch bị ảnh hưởng; chỉ ghi nhật ký sau khi lưu"),
    ("S2-03", "EP-03", "Danh mục công khai, tìm kiếm không dấu, hiển thị tốt ở 360 px"),
    ("S2-04", "EP-03", "Chọn tối đa 5 dịch vụ, cộng dồn thời lượng và tiền tạm tính"),
    ("S2-05", "EP-03", "Bộ tính khung giờ trống 15 phút, gợi ý 2 ngày gần nhất còn chỗ"),
    ("S2-06", "EP-03", "Chọn đích danh thợ hoặc thợ bất kỳ (ưu tiên thợ ít lịch nhất)"),
    ("S2-07", "EP-03", "Chốt lịch không cần tài khoản, mã 8 ký tự, giới hạn theo SĐT và IP"),
    ("S2-08", "EP-03", "Chống đặt trùng: SERIALIZABLE + FOR UPDATE + EXCLUDE"),
    ("S2-09", "EP-03", "Tra cứu bằng mã hoặc SĐT, chặn 30 phút sau 10 lần sai"),
    ("S3-01", "EP-04", "Lịch ngày dạng cột theo thợ, trục 15 phút"),
    ("S3-02", "EP-04", "Xác nhận / từ chối lịch online, lý do bắt buộc"),
    ("S3-03", "EP-04", "Check-in trong cửa sổ ±60 phút, đánh dấu muộn > 15 phút"),
    ("S3-04", "EP-04", "Đổi thợ / dời giờ, kiểm tra kỹ năng và khoảng trống"),
    ("S3-05", "EP-04", "Khách tự huỷ khi còn ≥ 120 phút"),
    ("S3-06", "EP-04", "Đánh dấu không đến sau 30 phút, hoàn tác trong 15 phút"),
    ("S3-07", "EP-04", "Khách vãng lai tại quầy, tự điền theo SĐT"),
    ("S3-08", "EP-04", "Thợ xem lịch riêng, bắt đầu / hoàn tất, SĐT được che"),
    ("S3-09", "EP-04", "Chuyển lịch hàng loạt khi thợ nghỉ đột xuất"),
    ("S3-10", "EP-05", "Gộp hồ sơ khách theo SĐT, tìm kiếm nhanh"),
    ("S4-01", "EP-05", "Phiếu tính tiền, dịch vụ phát sinh, tiền mặt / chuyển khoản, phiếu điều chỉnh"),
    ("S4-02", "EP-05", "Mã giảm giá phần trăm hoặc số tiền, một mã mỗi phiếu"),
    ("S4-03", "EP-05", "Lịch sử 10 lượt gần nhất + ghi chú kỹ thuật 500 ký tự"),
    ("S4-04", "EP-05", "Đánh giá 1–5 sao qua liên kết dùng một lần trong 7 ngày"),
    ("S4-05", "EP-06", "Email xác nhận ≤ 2 phút, nhắc trước 24 giờ, thử lại 3 lần"),
    ("S4-06", "EP-06", "Thông báo trong ứng dụng, chuông đếm chưa đọc"),
    ("S4-07", "EP-06", "Doanh thu theo thợ / dịch vụ, xuất CSV UTF-8"),
    ("S4-08", "EP-06", "Tổng quan hôm nay, tự làm mới 60 giây"),
    ("S4-09", "EP-06", "Tỉ lệ không đến / huỷ, phân bố khung giờ"),
    ("S4-10", "EP-01", "Rà soát phân quyền bằng kiểm thử tự động + kịch bản demo"),
]

# Nguồn: docs/requirements/3. Hệ thống đặt lịch Salon Spa.xlsx, sheet 4. Product Backlog và 5. Sprint Plan.
STORY_POINTS = dict(zip([s[0] for s in STORIES], [
    5, 5, 5, 3, 5, 3, 5, 3, 3, 3,
    8, 3, 5, 3, 8, 3, 5, 5, 2,
    8, 3, 3, 5, 2, 3, 5, 5, 5, 3,
    8, 2, 5, 5, 5, 3, 5, 3, 2, 3,
]))
SPRINTS = [
    ("Sprint 1", "Nền tảng tài khoản và danh mục gốc",
     "4 vai trò nhân sự, khách công khai; dịch vụ, thợ, giờ mở cửa; staging 1 lệnh", 10, "40"),
    ("Sprint 2", "Ca làm và đặt lịch công khai",
     "Ca làm theo tuần, ngày nghỉ; khách tự đặt lịch 4 bước; bộ tính khung giờ 15 phút; chống đặt trùng", 9, "42"),
    ("Sprint 3", "Vận hành lịch hẹn trong ngày",
     "Lịch ngày theo cột thợ, xác nhận, check-in, dời lịch, vãng lai, no-show, lịch của thợ, chuyển lịch hàng loạt", 10, "42"),
    ("Sprint 4", "Thanh toán, đánh giá, báo cáo",
     "Phiếu tính tiền, mã giảm giá, lịch sử khách, đánh giá, email nhắc lịch, thông báo, doanh thu, rà soát phân quyền", 10, "41"),
]

# ---------------------------------------------------------------- Snapshot kiểm định 06/10/2026, v1.4.0 (develop)
QUALITY_DATE = "06/10/2026"
UNIT_TESTS = 168
E2E_TESTS = 95
E2E_SUITES = 13
DEMO_TESTS = 4
LAUNCHER_TESTS = 4
ARCHITECTURE = [
    ("1. Trình bày (Cloud/Local)", "React 18 + Vite (Cloudflare Pages CDN)", "Trang công khai và quản lý; nhận SSE; triển khai đám mây toàn cầu https://huongsen-salon.pages.dev"),
    ("2. Giao tiếp API", "NestJS 10 (Render Cloud Service)", "REST/JSON, JWT, CORS; triển khai backend 24/7 https://salon-spa-api-93d7.onrender.com"),
    ("3. Nghiệp vụ & Vận hành", "NestJS Service + Cloudflare Worker", "Tính khung giờ, ca làm, giữ chỗ; Worker cron 10 phút giữ thức API 24/7"),
    ("4. Lưu trữ", "TypeORM + Supabase PostgreSQL 17", "Migration 32 bảng, Session Pooler cổng 5432, sao lưu tự động pg_dump"),
]
STATS = [
    ("Sprint / User Story / Story Point", "4 / 39 / 165"),
    ("Kiến trúc ứng dụng", "4 tầng: giao diện, API, nghiệp vụ, lưu trữ"),
    ("Phân quyền nhân sự", "4 vai trò; khách đặt lịch công khai"),
    ("Hạ tầng", "Cloud 24/7 (Cloudflare Pages + Render + Supabase) · SSE · Launcher (BẮT ĐẦU / CẬP NHẬT)"),
    ("Bảng PostgreSQL / Entity TypeORM", "32 / 32"),
    ("Kiểm thử đơn vị / E2E / Demo + Launcher", f"{UNIT_TESTS} / {E2E_TESTS} ({E2E_SUITES} bộ) / {DEMO_TESTS} + {LAUNCHER_TESTS}"),
]

DEMO_ACCOUNTS = [
    ("Quản trị hệ thống (Cloud)", "admin@salon.vn", "Admin@123456"),
    ("Quản trị hệ thống (Local)", "admin@salon.vn", "Admin@123"),
    ("Chủ tiệm", "owner@salon.vn", "Owner@123"),
    ("Lễ tân", "reception@salon.vn", "Reception@123"),
    ("Thợ (5 tài khoản)", "stylist1@salon.vn … stylist5@salon.vn", "Stylist@123"),
]

RELEASES = [
    ("22/09/2026", "—", "Khởi tạo mã nguồn 4 Sprint, 39 user story, cấu trúc Git Flow"),
    ("25/09/2026", "v1.1.0", "Giao diện Fresha Light Luxury: ảnh riêng, hiệu ứng, vạch giờ hiện tại"),
    ("27/09/2026", "v1.2.0", "Khắc phục 15 + 8 lỗi kiểm thử Sprint 1: ảnh dự phòng offline, hộp thoại mật khẩu tạm, nút Quay lại"),
    ("28/09/2026", "v1.2.1", "Rà soát tích hợp máy chủ thật: phân trang TypeORM, giới hạn 200 dòng, múi giờ Việt Nam"),
    ("28/09/2026", "v1.2.2 – v1.2.3", "Launcher chạy trên mọi máy: healthcheck TCP, seed idempotent, /health trả 503 khi mất CSDL"),
    ("28/09/2026", "v1.2.5", "Supervisor tự phục hồi: tự khởi động lại khi Vite/Nest sập (mã 3221226505), dừng sạch cây tiến trình"),
    ("02/10/2026", "v1.3.0", "Khắc phục 23 lỗi QA Sprint 2, lá chắn đặt trùng, VietQR động, bộ hồi quy"),
    ("04/10/2026", "v1.3.1 – v1.3.5", "Gia cố DTO, giới hạn huỷ lịch, giới tính thợ, launcher 1-click, QA vòng 3–4"),
    ("05/10/2026", "v1.3.6", "Thống nhất số liệu khách, chặn tạo/dời lịch vào ngày nghỉ lễ"),
    ("06/10/2026", "v1.4.0", "HoYoSalon Launcher; tái cấu trúc monorepo; 11 góp ý Mentor Sprint 2 (giữ chỗ 10 phút, AI xếp lịch, AI ngày lễ, thợ tự đăng ký ca…)"),
    ("07/10/2026", "v1.5.0", "Nhật ký hoạt động chi tiết, tự giải phóng cổng bị chiếm khi khởi động"),
    ("08/10/2026", "v1.6.0", "Hệ thống đặt lịch Salon Spa hoàn thiện, sao lưu pg_dump tự động"),
    ("11/10/2026", "v2.0.0", "AI Local Spark-X2.5-4B, phân trang toàn diện, hoá đơn nhiệt K80"),
    ("12/10/2026", "v2.1.0 – v2.1.1", "AI local 1 chạm, vòng tự cải tiến có duyệt, tự chuyển CPU/GPU"),
    ("13/10/2026", "v2.2.0", "Kéo thả kiểu Jira cho lịch hẹn và bảng ca làm, QR chia sẻ link 1 chạm"),
    ("15/10/2026", "v2.2.1", "Triển khai đám mây 24/7 (Cloudflare Pages https://huongsen-salon.pages.dev, Render API https://salon-spa-api-93d7.onrender.com, Supabase DB, Worker giữ thức)"),
]

# ---------------------------------------------------------------- Góp ý Mentor Sprint 2 (06/10/2026) -> v1.4.0
# Nguồn: docs/feedback/2026-10-06-mentor-sprint2/TEXT NOTE SPRINT 2.docx, chi tiết RESOLUTION.md cùng thư mục.
MENTOR_ITEMS = [
    ("1", "Phân chia lại nhánh GitHub", "main (Production) · develop (Staging) · feature/… · fix/… · docs/…; nhánh cũ lưu thành thẻ archive/…", "docs/git-branching-model"),
    ("2", "Bảng ca làm rối mắt", "Lưới thợ × ngày, ca tô màu theo buổi, nút ẩn tới khi rê chuột, đếm thợ trực", "feature/shift-board-24h-picker"),
    ("3", "Chọn giờ 24 giờ", "TimeSelect24: 00:00 → 23:45, bước 15 phút, không phụ thuộc SA/CH", "feature/shift-board-24h-picker"),
    ("4", "AI phân tích khung giờ đặt lịch", "Trợ lý xếp lịch chấm điểm sớm · vừa khít · cân bằng thợ, có lý do, 1 cú nhấp điền sẵn", "feature/ai-slot-assistant"),
    ("5", "AI sinh ngày lễ cả năm", "Âm lịch thiên văn + Bộ luật Lao động; không chèn lên lịch khách", "feature/ai-holiday-generator"),
    ("6", "Thợ tự đăng ký lịch, quản lý duyệt", "Đăng ký cả tuần; duyệt / sửa giờ / từ chối / duyệt tất cả", "feature/shift-registration-approval"),
    ("7", "Chân trang đủ thông tin", "Nền tối; Facebook, Zalo, chỉ đường, hotline, email, giờ mở cửa, đội ngũ chuyên viên", "feature/public-footer-density"),
    ("8", "Hiển thị dày hơn", "Lưới 4 cột liền mạch, 2 hàng + Xem thêm, khung rộng 7xl", "feature/public-footer-density"),
    ("9", "Khung giờ nào cũng có thợ", "Cảnh báo khoảng trống + gợi ý thợ ít giờ làm, xếp 1 cú nhấp", "feature/shift-coverage-balance"),
    ("10", "Email đặt lịch thành công", "Email đầy đủ, gửi ngay; gửi bổ sung từ màn hình thành công", "feature/booking-confirmation-email"),
    ("11", "Giữ chỗ 10–15 phút", "Khoá khung giờ khi khách điền form; đếm ngược; 10 khách tranh 1 khung → 1", "feature/booking-slot-hold"),
]
