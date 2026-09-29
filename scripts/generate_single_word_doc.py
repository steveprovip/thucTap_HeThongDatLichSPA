# -*- coding: utf-8 -*-
import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def create_callout(doc, text, title="LƯU Ý QUAN TRỌNG", bg_color="F0FDF4", border_color="0D9488"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    tbl.columns[0].width = Inches(6.5)
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    # Border left
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'<w:tcBorders {nsdecls("w")}><w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/><w:top w:val="none"/><w:right w:val="none"/><w:bottom w:val="none"/></w:tcBorders>')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    r_title = p.add_run(f"📌 {title}: ")
    r_title.bold = True
    r_title.font.name = "Calibri"
    r_title.font.size = Pt(10.5)
    r_title.font.color.rgb = RGBColor(13, 148, 136)
    
    r_text = p.add_run(text)
    r_text.font.name = "Calibri"
    r_text.font.size = Pt(10)
    r_text.font.color.rgb = RGBColor(30, 41, 59)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def add_code_block(doc, code_text):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    tbl.columns[0].width = Inches(6.5)
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "1E293B") # Dark slate
    set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(code_text)
    run.font.name = "Consolas"
    run.font.size = Pt(9.5)
    run.font.color.rgb = RGBColor(241, 245, 249)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def build_word_doc():
    doc = Document()
    
    # Page Margins
    sections = doc.sections
    for s in sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.9)
        s.right_margin = Inches(0.9)
        
    # Styles
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    
    r1 = title_p.add_run("HƯỚNG DẪN QUY TRÌNH GIT WORKFLOW CHUẨN DOANH NGHIỆP\n& KỸ THUẬT LƯU VẾT ĐÓNG GÓP CHO 10 THÀNH VIÊN\n")
    r1.bold = True
    r1.font.name = "Calibri"
    r1.font.size = Pt(17)
    r1.font.color.rgb = RGBColor(15, 23, 42) # Slate-900
    
    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_p.paragraph_format.space_after = Pt(14)
    r_sub = sub_p.add_run("Dự án: Hệ Thống Đặt Lịch & Quản Lý Vận Hành Salon - Spa\nHọc phần: TTCS_T926_K2S3_N3 | Nhóm 3 (10 thành viên) | Tech Lead: Nguyễn Duy Linh")
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(11)
    r_sub.font.italic = True
    r_sub.font.color.rgb = RGBColor(100, 116, 139)
    
    create_callout(doc, "Tài liệu này là quy chuẩn thực hành bắt buộc cho 10 thành viên Nhóm 3. Hướng dẫn chi tiết cách tạo nhánh, đặt tên commit, mở Pull Request và các kỹ thuật giúp Trưởng nhóm hỗ trợ/sửa code mà thành viên vẫn có 100% lịch sử đóng góp (commit xanh) trên GitHub để phục vụ đánh giá điểm thực tập.", "MỤC TIÊU TÀI LIỆU", "F0FDF4", "0D9488")
    
    # -------------------------------------------------------------
    # PHẦN 1: QUY TRÌNH GIT FLOW CHUẨN DOANH NGHIỆP
    # -------------------------------------------------------------
    h1 = doc.add_heading("PHẦN 1. QUY CHUẨN GIT FLOW CHUẨN DOANH NGHIỆP", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(6)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)
        
    p = doc.add_paragraph("Mô hình phân nhánh của hệ thống được thiết lập theo chuẩn Git Flow kết hợp Pull Request:")
    p.paragraph_format.space_after = Pt(4)
    
    # Branch table
    tbl_b = doc.add_table(rows=1, cols=3)
    tbl_b.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_b.columns[0].width = Inches(1.5)
    tbl_b.columns[1].width = Inches(1.8)
    tbl_b.columns[2].width = Inches(3.2)
    
    headers = ["Nhánh", "Quyền Hạn", "Mục Đích & Ý Nghĩa"]
    hdr_cells = tbl_b.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        set_cell_background(hdr_cells[i], "0D9488")
        set_cell_margins(hdr_cells[i], top=100, bottom=100, left=100, right=100)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.bold = True
            r.font.name = "Calibri"
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    branch_data = [
        ("main", "Chỉ Tech Lead merge", "Mã nguồn phát hành chính thức, sẵn sàng demo, đã qua nghiệm thu của Product Owner (Thầy Cấn Tuấn Anh). CẤM PUSH TRỰC TIẾP."),
        ("develop", "Tech Lead duyệt PR", "Nhánh tích hợp tính năng hàng ngày của cả nhóm. Mọi thành viên tạo Pull Request vào đây."),
        ("feature/...", "Thành viên phụ trách", "Nhánh phát triển tính năng mới theo từng User Story được giao."),
        ("docs/...", "Thành viên phụ trách", "Nhánh viết báo cáo Word, slide, khảo sát, tài liệu API."),
        ("test/...", "Tester phụ trách", "Nhánh viết kịch bản nghiệm thu, bảng Test Cases kiểm thử.")
    ]
    
    for row_idx, data in enumerate(branch_data):
        row = tbl_b.add_row()
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for c_idx, text in enumerate(data):
            c = row.cells[c_idx]
            c.text = text
            set_cell_background(c, bg)
            set_cell_margins(c, top=80, bottom=80, left=100, right=100)
            p = c.paragraphs[0]
            for r in p.runs:
                r.font.name = "Calibri"
                r.font.size = Pt(9.5)
                if c_idx == 0:
                    r.bold = True
                    r.font.color.rgb = RGBColor(15, 23, 42)
                    
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    
    # Quy chuẩn Conventional Commits
    h2 = doc.add_heading("1.1. Quy Chuẩn Đặt Tên Commit (Conventional Commits)", level=2)
    h2.paragraph_format.space_before = Pt(10)
    h2.paragraph_format.space_after = Pt(4)
    for r in h2.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(30, 41, 59)
        
    p = doc.add_paragraph("Cú pháp bắt buộc cho mọi commit:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "<tiền_tố>(<phạm_vi>): <mô tả ngắn gọn nội dung đã làm>\n\nVí dụ:\nfeat(booking): hoan thien giao dien chon thoi gian va dich vu\nfix(auth): sua loi token expire 401 khong tu refresh\ndocs(report): cap nhat chuong 2 khao sat thuc trang\ntest(qa): bo sung 20 test case kiem thu phan quyen 5 vai tro")
    
    # 5 bước làm việc hàng ngày
    h2 = doc.add_heading("1.2. Quy Trình 5 Bước Làm Việc Hằng Ngày Của Thành Viên", level=2)
    h2.paragraph_format.space_before = Pt(10)
    h2.paragraph_format.space_after = Pt(4)
    for r in h2.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(30, 41, 59)
        
    steps_text = (
        "• Bước 1 - Cập nhật code mới nhất: Trước khi làm việc, luôn chạy `git checkout develop` và `git pull origin develop`.\n"
        "• Bước 2 - Tạo nhánh riêng: Chạy `git checkout -b <tên_nhánh_của_bạn>` từ develop.\n"
        "• Bước 3 - Thực hiện công việc: Code hoặc viết tài liệu, kiểm tra không lỗi (`npm run lint`, `npm run build`).\n"
        "• Bước 4 - Commit & Push: Chạy `git add .` -> `git commit -m \"...\"` -> `git push -u origin <tên_nhánh>`.\n"
        "• Bước 5 - Mở Pull Request: Lên GitHub, bấm Create Pull Request từ nhánh của bạn vào `develop`, gắn reviewer là @steveprovip."
    )
    p_step = doc.add_paragraph(steps_text)
    p_step.paragraph_format.line_spacing = 1.2
    p_step.paragraph_format.space_after = Pt(10)
    for r in p_step.runs:
        r.font.name = "Calibri"
        r.font.size = Pt(10)

    # -------------------------------------------------------------
    # PHẦN 2: MA TRẬN PHÂN CÔNG & HƯỚNG DẪN CHI TIẾT 10 THÀNH VIÊN
    # -------------------------------------------------------------
    h1 = doc.add_heading("PHẦN 2. HƯỚNG DẪN CHI TIẾT CHO TỪNG THÀNH VIÊN (10 THÀNH VIÊN)", level=1)
    h1.paragraph_format.space_before = Pt(16)
    h1.paragraph_format.space_after = Pt(6)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)
        
    p = doc.add_paragraph("Căn cứ theo Bảng 2.5 và Bảng 2.6 trong Báo Cáo Thực Tập chính thức, dưới đây là bảng ma trận phân công và hướng dẫn từng bước kèm tập lệnh Git cụ thể cho từng cá nhân:")
    p.paragraph_format.space_after = Pt(6)
    
    # Member matrix table
    tbl_m = doc.add_table(rows=1, cols=5)
    tbl_m.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_m.columns[0].width = Inches(0.5)
    tbl_m.columns[1].width = Inches(1.4)
    tbl_m.columns[2].width = Inches(1.2)
    tbl_m.columns[3].width = Inches(1.8)
    tbl_m.columns[4].width = Inches(1.6)
    
    m_headers = ["STT", "Họ và Tên", "Vai Trò", "Tên Nhánh Quy Định", "Thư Mục Phụ Trách"]
    hdr_cells = tbl_m.rows[0].cells
    for i, h in enumerate(m_headers):
        hdr_cells[i].text = h
        set_cell_background(hdr_cells[i], "0D9488")
        set_cell_margins(hdr_cells[i], top=100, bottom=100, left=80, right=80)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.bold = True
            r.font.name = "Calibri"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    members_data = [
        ("1", "Nguyễn Duy Linh", "Tech Lead (Trưởng nhóm)", "main, develop", "backend/, database/, architecture"),
        ("2", "Lê Thị Phương Linh", "Phó nhóm · Tài liệu", "docs/phuonglinh-scrum-report", "docs/report/, quy trình Scrum, theo dõi Point"),
        ("3", "Trương Quốc Khánh", "QA · Test Lead", "test/quockhanh-qa-acceptance", "docs/DEMO-SCRIPT.md, docs/BACKLOG-MAPPING.md"),
        ("4", "Nguyễn Nam Khánh", "Dev Frontend (Khách)", "feature/namkhanh-public-booking", "frontend/src/pages/public/ (Home, Booking, Lookup)"),
        ("5", "Bùi Quang Minh", "Dev Frontend (Quản trị)", "feature/quangminh-admin-portal", "frontend/src/pages/admin/ (Services, Stylists, Hours)"),
        ("6", "Nguyễn Thị Hương", "Tester", "test/huong-test-cases", "docs/qa/, docs/Test_Cases_Salon_Spa.xlsx"),
        ("7", "Dương Đức Mạnh", "Phân tích yêu cầu", "docs/ducmanh-survey-analysis", "docs/report/ (Chương 1, 2 Khảo sát thực trạng)"),
        ("8", "Phương Đình Khoa Nam", "Thiết kế sơ đồ", "docs/khoanam-system-diagrams", "docs/diagrams/ (.drawio, .png, ERD 24 bảng)"),
        ("9", "Nguyễn Hoàng Long", "Slide & Hình ảnh", "docs/hoanglong-slide-deck", "docs/assets/screenshots/, Slide nghiệm thu"),
        ("10", "Phạm Mậu Lực", "Dữ liệu mẫu & Video", "chore/mauluc-seed-demo-media", "database/seed-data-real.sql, docs/demo-video/")
    ]
    
    for row_idx, data in enumerate(members_data):
        row = tbl_m.add_row()
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for c_idx, text in enumerate(data):
            c = row.cells[c_idx]
            c.text = text
            set_cell_background(c, bg)
            set_cell_margins(c, top=70, bottom=70, left=80, right=80)
            p = c.paragraphs[0]
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                r.font.name = "Calibri"
                r.font.size = Pt(9)
                if c_idx == 1:
                    r.bold = True
                    
    doc.add_paragraph().paragraph_format.space_after = Pt(10)
    
    # Detailed section for each member
    member_details = [
        {
            "num": "1", "name": "Nguyễn Duy Linh", "role": "Tech Lead · Nhóm trưởng",
            "desc": "Quản trị toàn bộ mã nguồn Backend NestJS, CSDL PostgreSQL (24 bảng, trigger audit, ràng buộc EXCLUDE), thuật toán tính khung giờ 15 phút, chống đặt trùng SERIALIZABLE, phê duyệt và merge Pull Request.",
            "cmd": "# 1. Kiem tra va cap nhat develop\ngit checkout develop\ngit pull origin develop\n\n# 2. Ho tro va sua code cho thanh vien truc tiep tren nhanh cua ban do (Xem Phan 3)"
        },
        {
            "num": "2", "name": "Lê Thị Phương Linh", "role": "Phó nhóm · Phụ trách tài liệu Scrum",
            "desc": "Chuẩn hóa báo cáo Word theo mẫu quy định của trường; tổng hợp các chương Kiến trúc và Quy trình Scrum; theo dõi tiến độ 4 Sprint và thống kê Story Point (165 Point).",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b docs/phuonglinh-scrum-report\n\n# Cap nhat file bao cao trong docs/\ngit add docs/\ngit commit -m \"docs(scrum): cap nhat bao cao tien do sprint va tong hop story point\"\ngit push -u origin docs/phuonglinh-scrum-report\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "3", "name": "Trương Quốc Khánh", "role": "QA · Test Lead",
            "desc": "Soạn thảo kịch bản nghiệm thu 5 phần (DEMO-SCRIPT.md), lập bảng ánh xạ 39 User Story (BACKLOG-MAPPING.md), điều phối kiểm thử thủ công và ghi nhận danh sách lỗi.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b test/quockhanh-qa-acceptance\n\n# Chinh sua file nghiem thu trong docs/\ngit add docs/DEMO-SCRIPT.md docs/BACKLOG-MAPPING.md\ngit commit -m \"test(acceptance): ra soat kich ban nghiem thu 39 user story va log loi sprint 1\"\ngit push -u origin test/quockhanh-qa-acceptance\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "4", "name": "Nguyễn Nam Khánh", "role": "Dev Frontend – Phân hệ Khách hàng",
            "desc": "Phát triển giao diện đặt lịch công khai 4 bước (HomePage, Step1Services, Step2Slot, LookupPage), câu chữ tiếng Việt, kiểm tra hiển thị responsive di động 360px.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b feature/namkhanh-public-booking\n\n# Chinh sua cac file trong frontend/src/pages/public/\ngit add frontend/src/pages/public/\ngit commit -m \"feat(public-ui): toi uu giao dien dat lich 4 buoc va responsive mobile 360px\"\ngit push -u origin feature/namkhanh-public-booking\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "5", "name": "Bùi Quang Minh", "role": "Dev Frontend – Phân hệ Quản trị",
            "desc": "Phát triển các trang quản trị salon (ServicesPage, StylistsPage, WorkingHoursPage), kiểm tra ràng buộc form (thời lượng bội số 15 phút, giá không âm).",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b feature/quangminh-admin-portal\n\n# Chinh sua cac file trong frontend/src/pages/admin/\ngit add frontend/src/pages/admin/\ngit commit -m \"feat(admin): hoan thien form quan ly dich vu va rang buoc thoi luong boi so 15\"\ngit push -u origin feature/quangminh-admin-portal\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "6", "name": "Nguyễn Thị Hương", "role": "Tester",
            "desc": "Lập bảng Test Cases chi tiết (Excel/Markdown), thực thi kiểm thử 5 vai trò trên giao diện thực tế và ghi nhận kết quả Pass/Fail.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b test/huong-test-cases\n\n# Bo sung tai lieu test case vao docs/qa/\ngit add docs/\ngit commit -m \"test(cases): bo sung 35 test case kiem thu giao dien va phan quyen 5 vai tro\"\ngit push -u origin test/huong-test-cases\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "7", "name": "Dương Đức Mạnh", "role": "Phân tích yêu cầu",
            "desc": "Soạn thảo nội dung Chương 1 và Chương 2 trong báo cáo: khảo sát thực trạng quản lý truyền thống (sổ tay, tin nhắn Zalo), lập ma trận so sánh và phân tích lợi ích của hệ thống.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b docs/ducmanh-survey-analysis\n\n# Cap nhat file noi dung khao sat vao docs/\ngit add docs/\ngit commit -m \"docs(analysis): bo sung noi dung khao sat thuc trang va ma tran loi ich he thong\"\ngit push -u origin docs/ducmanh-survey-analysis\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "8", "name": "Phương Đình Khoa Nam", "role": "Thiết kế sơ đồ hệ thống",
            "desc": "Thiết kế sơ đồ Use Case tổng thể, sơ đồ kiến trúc ERD 24 bảng PostgreSQL, sơ đồ luồng dữ liệu trên Draw.io/StarUML và xuất ảnh PNG chất lượng cao cho báo cáo.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b docs/khoanam-system-diagrams\n\n# Them so do vao docs/diagrams/\ngit add docs/diagrams/\ngit commit -m \"docs(diagrams): cap nhat so do Use Case tong the va ERD 24 bang PostgreSQL\"\ngit push -u origin docs/khoanam-system-diagrams\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "9", "name": "Nguyễn Hoàng Long", "role": "Slide thuyết trình & Hình ảnh minh họa",
            "desc": "Soạn thảo bộ Slide thuyết trình nghiệm thu theo từng Sprint, chụp ảnh màn hình các chức năng và đóng vai khách hàng trong buổi demo nghiệm thu.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b docs/hoanglong-slide-deck\n\n# Them slide va bo anh chup vao docs/\ngit add docs/\ngit commit -m \"docs(slide): cap nhat slide thuyet trinh sprint 4 va bo anh chup man hinh giao dien\"\ngit push -u origin docs/hoanglong-slide-deck\n# Mo Pull Request tren GitHub vao develop"
        },
        {
            "num": "10", "name": "Phạm Mậu Lực", "role": "Dữ liệu mẫu & Video Demo",
            "desc": "Soạn kịch bản dữ liệu thực tế (danh mục dịch vụ, giá tiền thực tế, ảnh thợ), chuẩn bị file seed data SQL và quay video demo hoàn chỉnh luồng đặt lịch.",
            "cmd": "git checkout develop\ngit pull origin develop\ngit checkout -b chore/mauluc-seed-demo-media\n\n# Them file seed data va video link vao database/ docs/\ngit add database/ docs/\ngit commit -m \"chore(seed): bo sung du lieu mau thuc te cho 20 dich vu spa va anh mau thợ\"\ngit push -u origin chore/mauluc-seed-demo-media\n# Mo Pull Request tren GitHub vao develop"
        }
    ]
    
    for m in member_details:
        h3 = doc.add_heading(f"2.{m['num']}. Thành viên: {m['name']} ({m['role']})", level=2)
        h3.paragraph_format.space_before = Pt(8)
        h3.paragraph_format.space_after = Pt(2)
        for r in h3.runs:
            r.font.name = "Calibri"
            r.font.color.rgb = RGBColor(15, 23, 42)
            
        p_desc = doc.add_paragraph(f"• Nhiệm vụ chính: {m['desc']}")
        p_desc.paragraph_format.space_after = Pt(2)
        p_desc.runs[0].font.name = "Calibri"
        p_desc.runs[0].font.size = Pt(9.5)
        
        p_c = doc.add_paragraph("• Các lệnh Git copy-paste chạy từ máy cá nhân:")
        p_c.paragraph_format.space_after = Pt(2)
        p_c.runs[0].font.name = "Calibri"
        p_c.runs[0].font.size = Pt(9.5)
        p_c.runs[0].bold = True
        
        add_code_block(doc, m["cmd"])

    # -------------------------------------------------------------
    # PHẦN 3: BÍ KÍP DÀNH CHO TECH LEAD
    # -------------------------------------------------------------
    h1 = doc.add_heading("PHẦN 3. BÍ KÍP TECH LEAD: TỰ CODE/SỬA HỆ THỐNG NHƯNG THÀNH VIÊN VẪN CÓ 100% VẾT LỊCH SỬ GITHUB", level=1)
    h1.paragraph_format.space_before = Pt(16)
    h1.paragraph_format.space_after = Pt(6)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)
        
    p = doc.add_paragraph("Khi thành viên trong nhóm yếu kỹ năng lập trình hoặc chưa vững xử lý logic phức tạp, Tech Lead hoàn toàn có thể tự tay code hoặc refactor lại toàn bộ hệ thống mà vẫn đảm bảo 100% thành viên có lịch sử commit xanh và PR được ghi nhận trên GitHub để phục vụ việc chấm điểm.")
    p.paragraph_format.space_after = Pt(6)
    
    # Phương pháp 1
    h2 = doc.add_heading("3.1. Phương Pháp 1: Thành Viên Push Khung Ban Đầu ➔ Tech Lead Sửa Trực Tiếp Trên Nhánh (Khuyên Dùng)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(4)
    
    p = doc.add_paragraph("Quy trình 4 bước chuẩn thực tế:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "# BƯỚC 1 (Tại máy của Thành Viên):\n# Thành viên tạo branch, tạo file cơ bản rồi commit và push:\ngit checkout develop\ngit pull origin develop\ngit checkout -b feature/namkhanh-public-booking\ngit add .\ngit commit -m \"feat(public): khoi tao khung giao dien dat lich\"\ngit push -u origin feature/namkhanh-public-booking\n# Thành viên lên GitHub bấm [Create Pull Request] vào develop -> GHI NHẬN CÔNG MỞ PR VÀ COMMIT CHO THÀNH VIÊN!\n\n# BƯỚC 2 (Tại máy của Tech Lead):\n# Tech Lead kéo nhánh của thành viên về máy mình:\ngit fetch origin\ngit checkout feature/namkhanh-public-booking\n# Tech Lead tự do code lại toàn bộ, fix bug, tối ưu giao diện/backend hoàn chỉnh.\n\n# BƯỚC 3 (Tại máy của Tech Lead):\n# Tech Lead commit và push thẳng vào nhánh của thành viên:\ngit add .\ngit commit -m \"refactor(public): hoan thien toan bo logic dat lich va responsive\"\ngit push origin feature/namkhanh-public-booking\n\n# BƯỚC 4:\n# Tech Lead lên GitHub bấm [Merge Pull Request].\n# KẾT QUẢ: Cả 2 người đều có commit xanh trong Insights -> Contributors!")

    # Phương pháp 2
    h2 = doc.add_heading("3.2. Phương Pháp 2: Dùng Tính Năng GitHub PR Suggestion (100% Commit Thuộc Về Thành Viên)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(4)
    p = doc.add_paragraph(
        "1. Thành viên push code sơ khai và mở Pull Request.\n"
        "2. Tech Lead mở PR trên GitHub Web > Chuyển sang tab Files changed.\n"
        "3. Rà chuột đến khối code cần sửa > Bấm nút Add a suggestion (Ctrl + G) > Paste code chuẩn của Lead vào khung.\n"
        "4. Thành viên chỉ cần vào PR bấm 1 nút [Commit suggestion].\n"
        "👉 KẾT QUẢ: GitHub ghi nhận commit đó 100% do chính thành viên thực hiện!"
    )
    p.paragraph_format.space_after = Pt(6)
    
    # Phương pháp 3
    h2 = doc.add_heading("3.3. Phương Pháp 3: Kỹ Thuật Đồng Tác Giả (Co-Authored-By)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(4)
    p = doc.add_paragraph("Khi Tech Lead tự tay viết code trên máy mình nhưng muốn chia sẻ điểm đóng góp cho các thành viên khác, hãy thêm thẻ Co-authored-by vào cuối commit message:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "git add .\ngit commit -m \"feat(admin): hoan thien toan bo module quan ly thoi gian ca truc\n\nCo-authored-by: Bui Quang Minh <email_github_quangminh@gmail.com>\nCo-authored-by: Le Thi Phuong Linh <email_github_phuonglinh@gmail.com>\"\ngit push origin develop")

    # -------------------------------------------------------------
    # PHẦN 4: SỔ TAY XỬ LÝ SỰ CỐ GIT THƯỜNG GẶP
    # -------------------------------------------------------------
    h1 = doc.add_heading("PHẦN 4. SỔ TAY XỬ LÝ CÁC SỰ CỐ GIT THƯỜNG GẶP", level=1)
    h1.paragraph_format.space_before = Pt(16)
    h1.paragraph_format.space_after = Pt(6)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)
        
    issues = [
        ("4.1. Bị từ chối khi Push (rejected - non-fast-forward)", "Nguyên nhân: Trên GitHub đã có commit mới hơn (do Lead hoặc người khác vừa push).\nCách xử lý: Chạy `git pull origin <tên_nhánh_của_bạn>` rồi chạy lại `git push origin <tên_nhánh_của_bạn>`."),
        ("4.2. Xung đột code (Merge Conflict)", "Nguyên nhân: Cả hai người cùng sửa một dòng trong cùng một file.\nCách xử lý: Mở file bị conflict bằng VS Code > Chọn Accept Incoming Change (code mới) hoặc Accept Current Change > Lưu file > Chạy `git add .` > `git commit -m \"fix(merge): resolve conflict\"` > `git push`."),
        ("4.3. Lỡ commit nhầm file rác hoặc .env", "Cách xử lý: Chạy `git reset --soft HEAD~1` để hủy commit gần nhất mà không làm mất code trong máy."),
        ("4.4. Muốn xóa toàn bộ thay đổi chưa commit để quay về trạng thái sạch sẽ", "Cách xử lý: Chạy `git reset --hard HEAD` và `git clean -fd`.")
    ]
    
    for title, desc in issues:
        h3 = doc.add_heading(title, level=2)
        h3.paragraph_format.space_before = Pt(6)
        h3.paragraph_format.space_after = Pt(2)
        p = doc.add_paragraph(desc)
        p.paragraph_format.space_after = Pt(6)
        p.runs[0].font.name = "Calibri"
        p.runs[0].font.size = Pt(9.5)
        
    output_path = r"F:\hoc_tap\thuc_tap\du_an\huong_dan_day_git\Huong_Dan_Quy_Trinh_Git_Va_Luu_Vet_Dong_Gop_10_Thanh_Vien.docx"
    doc.save(output_path)
    print(f"Generated successfully: {output_path}")

if __name__ == "__main__":
    build_word_doc()
