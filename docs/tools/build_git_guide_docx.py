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
    tbl.columns[0].width = Inches(6.6)
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'<w:tcBorders {nsdecls("w")}><w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/><w:top w:val="none"/><w:right w:val="none"/><w:bottom w:val="none"/></w:tcBorders>')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.15
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
    tbl.columns[0].width = Inches(6.6)
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "0F172A") # Slate-900
    set_cell_margins(cell, top=110, bottom=110, left=160, right=160)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(code_text)
    run.font.name = "Consolas"
    run.font.size = Pt(9.5)
    run.font.color.rgb = RGBColor(248, 250, 252)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def build_complete_word_doc():
    doc = Document()
    
    # Page Margins
    for s in doc.sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.85)
        s.right_margin = Inches(0.85)
        
    # Document Header
    p_header = doc.add_paragraph()
    p_header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_inst = p_header.add_run("BÁO CÁO THỰC TẬP CƠ SỞ · HỌC PHẦN TTCS_T926_K2S3_N3\nNHÓM 3 – DỰ ÁN HỆ THỐNG ĐẶT LỊCH VÀ QUẢN LÝ VẬN HÀNH SALON - SPA\n")
    r_inst.font.name = "Calibri"
    r_inst.font.size = Pt(10)
    r_inst.font.bold = True
    r_inst.font.color.rgb = RGBColor(100, 116, 139)
    
    # Document Main Title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_p.paragraph_format.space_before = Pt(6)
    title_p.paragraph_format.space_after = Pt(4)
    
    r1 = title_p.add_run("TÀI LIỆU QUY CHUẨN GIT FLOW DOANH NGHIỆP\n& CẨM NANG LƯU VẾT LỊCH SỬ ĐÓNG GÓP CHO 10 THÀNH VIÊN\n")
    r1.bold = True
    r1.font.name = "Calibri"
    r1.font.size = Pt(16)
    r1.font.color.rgb = RGBColor(15, 23, 42)
    
    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_p.paragraph_format.space_after = Pt(12)
    r_sub = sub_p.add_run("Product Owner (GVHD): ThS. Cấn Tuấn Anh | Tech Lead: Nguyễn Duy Linh (MSSV: DTC245200273)\nKho lưu trữ GitHub: https://github.com/steveprovip/thucTap_HeThongDatLichSPA")
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(10.5)
    r_sub.font.italic = True
    r_sub.font.color.rgb = RGBColor(71, 85, 105)
    
    create_callout(doc, "Tài liệu này chuẩn hóa toàn bộ quy trình phát triển theo mô hình Git Flow kinh điển của Vincent Driessen, phân công nhiệm vụ cụ thể cho 10 thành viên nhóm theo đúng Báo Cáo Thực Tập chính thức, và cung cấp 4 chiến lược thực chiến giúp Trưởng nhóm tự tay sửa/gánh code mà 100% thành viên vẫn có commit xanh và lịch sử đóng góp đầy đủ trên GitHub.", "MỤC ĐÍCH TÀI LIỆU", "F0FDF4", "0D9488")

    # =========================================================================
    # CHƯƠNG 1: MÔ HÌNH GIT FLOW CHUẨN (5 LOẠI NHÁNH)
    # =========================================================================
    h1 = doc.add_heading("CHƯƠNG 1. CẤU TRÚC MÔ HÌNH GIT FLOW CHUẨN DOANH NGHIỆP", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)

    p = doc.add_paragraph("Hệ thống áp dụng mô hình Git Flow chuẩn quốc tế gồm 5 loại nhánh rõ ràng:")
    p.paragraph_format.space_after = Pt(4)
    
    tbl_b = doc.add_table(rows=1, cols=4)
    tbl_b.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_b.columns[0].width = Inches(1.5)
    tbl_b.columns[1].width = Inches(1.1)
    tbl_b.columns[2].width = Inches(1.2)
    tbl_b.columns[3].width = Inches(2.8)
    
    headers = ["Tên Nhánh / Tiền Tố", "Loại Nhánh", "Xuất Phát Từ", "Mục Đích Sử Dụng & Vòng Đời"]
    hdr_cells = tbl_b.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        set_cell_background(hdr_cells[i], "0D9488")
        set_cell_margins(hdr_cells[i], top=90, bottom=90, left=80, right=80)
        p = hdr_cells[i].paragraphs[0]
        for r in p.runs:
            r.bold = True
            r.font.name = "Calibri"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    branch_specs = [
        ("main (Default)", "Chính (Long-lived)", "Gốc dự án", "Chứa mã nguồn sản phẩm chính thức đã qua nghiệm thu, dùng nộp bài / demo. CẤM COMMIT TRỰC TIẾP. Mỗi lần merge đều đánh Tag phiên bản (v1.0.0, v1.1.0...)."),
        ("develop", "Chính (Long-lived)", "main", "Nhánh tích hợp tính năng hàng ngày của cả 10 thành viên. Mọi Pull Request (PR) đều gộp về đây."),
        ("feature/*\n(VD: feature/namkhanh-...)", "Tạm thời (Short-lived)", "develop", "Từng thành viên tạo nhánh riêng để phát triển 1 User Story. Sau khi hoàn thành và được duyệt PR vào develop thì XÓA NHÁNH."),
        ("release/*\n(VD: release/v1.3.0)", "Tạm thời (Short-lived)", "develop", "Dùng để đóng gói mốc Sprint / chuẩn bị demo. Chỉ sửa lỗi nhỏ và bump version, sau đó merge vào cả main (gắn Tag) và develop rồi XÓA NHÁNH."),
        ("hotfix/*\n(VD: hotfix/v1.2.6)", "Tạm thời (Short-lived)", "main", "Dùng khi bản main đang chạy thực tế gặp lỗi nghiêm trọng cần vá gấp. Sửa xong merge vào cả main (gắn Tag) và develop rồi XÓA NHÁNH.")
    ]
    
    for row_idx, data in enumerate(branch_specs):
        row = tbl_b.add_row()
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for c_idx, text in enumerate(data):
            c = row.cells[c_idx]
            c.text = text
            set_cell_background(c, bg)
            set_cell_margins(c, top=70, bottom=70, left=80, right=80)
            p = c.paragraphs[0]
            for r in p.runs:
                r.font.name = "Calibri"
                r.font.size = Pt(9)
                if c_idx == 0:
                    r.bold = True
                    
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # Quy ước Commit
    h2 = doc.add_heading("1.1. Quy Chuẩn Commit Message (Conventional Commits)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(2)
    
    p = doc.add_paragraph("Mọi commit của các thành viên bắt buộc tuân theo định dạng chuẩn quốc tế:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "<loại_commit>(<phạm_vi>): <mô tả ngắn gọn nội dung>\n\nCác tiền tố quy định:\n- feat     : Thêm tính năng mới (VD: feat(booking): giao dien chon gio hen)\n- fix      : Sửa lỗi hệ thống (VD: fix(auth): sua loi token 401)\n- docs     : Cập nhật tài liệu / báo cáo (VD: docs(report): cap nhat chuong 2)\n- test     : Bổ sung kịch bản kiểm thử (VD: test(qa): bo sung 20 test case)\n- refactor : Tối ưu / sửa lại code nhưng giữ nguyên tính năng\n- chore    : Cấu hình hệ thống, script hỗ trợ, cài đặt thư viện")

    # =========================================================================
    # CHƯƠNG 2: QUY TRÌNH 5 BƯỚC LÀM VIỆC HÀNG NGÀY
    # =========================================================================
    h1 = doc.add_heading("CHƯƠNG 2. QUY TRÌNH 5 BƯỚC LÀM VIỆC HÀNG NGÀY CỦA THÀNH VIÊN", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)

    workflow_steps = [
        ("Bước 1: Luôn kéo code mới nhất từ develop", "Trước khi bắt đầu bất kỳ công việc nào trong ngày, thành viên phải đồng bộ mã nguồn mới nhất:\ngit checkout develop\ngit pull origin develop"),
        ("Bước 2: Tạo nhánh riêng theo đúng tên nhiệm vụ", "Tách một nhánh mới từ develop theo quy định:\ngit checkout -b feature/<ten_thanh_vien>-<ten_chuc_nang>\n# Ví dụ: git checkout -b feature/namkhanh-public-booking"),
        ("Bước 3: Thực hiện công việc và kiểm tra cục bộ", "Chỉnh sửa code hoặc tài liệu trong thư mục được phân công. Chạy lệnh kiểm tra tính hợp lệ:\nnpm run lint\nnpm run build"),
        ("Bước 4: Commit và đẩy lên GitHub", "Lưu lại vết thay đổi và push nhánh lên kho lưu trữ:\ngit add .\ngit commit -m \"feat(public): hoan thien trang dat lich khach hang\"\ngit push -u origin feature/namkhanh-public-booking"),
        ("Bước 5: Tạo Pull Request (PR) trên GitHub", "Truy cập https://github.com/steveprovip/thucTap_HeThongDatLichSPA\n- Bấm [Compare & pull request]\n- Chọn Base: develop <--- Compare: nhánh của bạn\n- Điền thông tin theo mẫu PR Template có sẵn\n- Gán Reviewer: @steveprovip (Tech Lead) rồi bấm [Create pull request].")
    ]
    
    for title, desc in workflow_steps:
        h3 = doc.add_heading(title, level=2)
        h3.paragraph_format.space_before = Pt(6)
        h3.paragraph_format.space_after = Pt(2)
        p = doc.add_paragraph(desc)
        p.paragraph_format.space_after = Pt(4)
        p.runs[0].font.name = "Calibri"
        p.runs[0].font.size = Pt(9.5)

    # =========================================================================
    # CHƯƠNG 3: PHÂN CÔNG & TẬP LỆNH CHO 10 THÀNH VIÊN
    # =========================================================================
    h1 = doc.add_heading("CHƯƠNG 3. PHÂN CÔNG NHIỆM VỤ & TẬP LỆNH GIT CHO 10 THÀNH VIÊN", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)

    p = doc.add_paragraph("Dưới đây là ma trận phân công 10 thành viên theo đúng Bảng 2.5 và Bảng 2.6 trong Báo Cáo Thực Tập chính thức:")
    p.paragraph_format.space_after = Pt(4)
    
    # Table 10 members
    tbl_m = doc.add_table(rows=1, cols=5)
    tbl_m.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_m.columns[0].width = Inches(0.4)
    tbl_m.columns[1].width = Inches(1.4)
    tbl_m.columns[2].width = Inches(1.3)
    tbl_m.columns[3].width = Inches(1.8)
    tbl_m.columns[4].width = Inches(1.7)
    
    m_headers = ["STT", "Họ và Tên", "Vai Trò", "Tên Nhánh Quy Định", "Thư Mục Phụ Trách"]
    hdr_cells = tbl_m.rows[0].cells
    for i, h in enumerate(m_headers):
        hdr_cells[i].text = h
        set_cell_background(hdr_cells[i], "0D9488")
        set_cell_margins(hdr_cells[i], top=90, bottom=90, left=70, right=70)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.bold = True
            r.font.name = "Calibri"
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    members_data = [
        ("1", "Nguyễn Duy Linh", "Tech Lead (Trưởng nhóm)", "main, develop", "backend/, database/, architecture"),
        ("2", "Lê Thị Phương Linh", "Phó nhóm · Tài liệu Scrum", "docs/phuonglinh-scrum-report", "docs/report/, quy trình Scrum, theo dõi Point"),
        ("3", "Trương Quốc Khánh", "QA · Test Lead", "test/quockhanh-qa-acceptance", "docs/DEMO-SCRIPT.md, docs/BACKLOG-MAPPING.md"),
        ("4", "Nguyễn Nam Khánh", "Dev Frontend (Khách)", "feature/namkhanh-public-booking", "frontend/src/pages/public/ (Home, Booking, Lookup)"),
        ("5", "Bùi Quang Minh", "Dev Frontend (Quản trị)", "feature/quangminh-admin-portal", "frontend/src/pages/admin/ (Services, Stylists, Hours)"),
        ("6", "Nguyễn Thị Hương", "Tester", "test/huong-test-cases", "docs/qa/, docs/testing/Test_Cases_Salon_Spa.xlsx"),
        ("7", "Dương Đức Mạnh", "Phân tích yêu cầu", "docs/ducmanh-survey-analysis", "docs/report/ (Chương 1, 2 Khảo sát thực trạng)"),
        ("8", "Phương Đình Khoa Nam", "Thiết kế sơ đồ", "docs/khoanam-system-diagrams", "docs/diagrams/ (.drawio, .png, ERD 24 bảng)"),
        ("9", "Nguyễn Hoàng Long", "Slide & Hình ảnh", "docs/hoanglong-slide-deck", "docs/assets/screenshots/, Slide nghiệm thu"),
        ("10", "Phạm Mậu Lực", "Dữ liệu mẫu & Video", "chore/mauluc-seed-demo-media", "backend/database/seed-data-real.sql, docs/demo-video/")
    ]
    
    for row_idx, data in enumerate(members_data):
        row = tbl_m.add_row()
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for c_idx, text in enumerate(data):
            c = row.cells[c_idx]
            c.text = text
            set_cell_background(c, bg)
            set_cell_margins(c, top=65, bottom=65, left=70, right=70)
            p = c.paragraphs[0]
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                r.font.name = "Calibri"
                r.font.size = Pt(8.5)
                if c_idx == 1:
                    r.bold = True
                    
    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Detailed for each
    member_cmd_details = [
        ("1", "Nguyễn Duy Linh", "Tech Lead · Trưởng nhóm", "Quản trị toàn bộ mã nguồn Backend NestJS, CSDL PostgreSQL (24 bảng, trigger audit, ràng buộc EXCLUDE), thuật toán tính khung giờ 15 phút, chống đặt trùng SERIALIZABLE, phê duyệt và merge Pull Request.", "git checkout develop\ngit pull origin develop\n# Ho tro, review PR va merge code cho cac thanh vien"),
        ("2", "Lê Thị Phương Linh", "Phó nhóm · Tài liệu Scrum", "Chuẩn hóa báo cáo Word theo mẫu quy định; tổng hợp chương Kiến trúc và Quy trình Scrum; theo dõi tiến độ 4 Sprint và 165 Story Point.", "git checkout develop\ngit pull origin develop\ngit checkout -b docs/phuonglinh-scrum-report\n# Chinh sua file trong docs/\ngit add docs/\ngit commit -m \"docs(scrum): cap nhat bao cao tien do sprint va tong hop story point\"\ngit push -u origin docs/phuonglinh-scrum-report"),
        ("3", "Trương Quốc Khánh", "QA · Test Lead", "Soạn kịch bản nghiệm thu 5 phần (DEMO-SCRIPT.md), đối chiếu 39 User Story (BACKLOG-MAPPING.md), điều phối kiểm thử thủ công và tổng hợp danh sách lỗi.", "git checkout develop\ngit pull origin develop\ngit checkout -b test/quockhanh-qa-acceptance\n# Chinh sua file trong docs/\ngit add docs/DEMO-SCRIPT.md docs/BACKLOG-MAPPING.md\ngit commit -m \"test(acceptance): ra soat kich ban nghiem thu 39 user story va log loi sprint 1\"\ngit push -u origin test/quockhanh-qa-acceptance"),
        ("4", "Nguyễn Nam Khánh", "Dev Frontend – Khách hàng", "Giao diện đặt lịch công khai 4 bước (HomePage, Step1Services, Step2Slot, LookupPage), câu chữ tiếng Việt, kiểm tra responsive di động 360px.", "git checkout develop\ngit pull origin develop\ngit checkout -b feature/namkhanh-public-booking\n# Chinh sua trong frontend/src/pages/public/\ngit add frontend/src/pages/public/\ngit commit -m \"feat(public-ui): toi uu giao dien dat lich 4 buoc va responsive mobile 360px\"\ngit push -u origin feature/namkhanh-public-booking"),
        ("5", "Bùi Quang Minh", "Dev Frontend – Quản trị", "Các trang quản trị salon (ServicesPage, StylistsPage, WorkingHoursPage), kiểm tra ràng buộc form (thời lượng bội số 15 phút, giá không âm).", "git checkout develop\ngit pull origin develop\ngit checkout -b feature/quangminh-admin-portal\n# Chinh sua trong frontend/src/pages/admin/\ngit add frontend/src/pages/admin/\ngit commit -m \"feat(admin): hoan thien form quan ly dich vu va rang buoc thoi luong boi so 15\"\ngit push -u origin feature/quangminh-admin-portal"),
        ("6", "Nguyễn Thị Hương", "Tester", "Lập bảng Test Cases chi tiết (Excel/Markdown), thực thi kiểm thử 5 vai trò trên giao diện thực tế và ghi nhận kết quả Pass/Fail.", "git checkout develop\ngit pull origin develop\ngit checkout -b test/huong-test-cases\n# Chinh sua trong docs/qa/\ngit add docs/\ngit commit -m \"test(cases): bo sung 35 test case kiem thu giao dien va phan quyen 5 vai tro\"\ngit push -u origin test/huong-test-cases"),
        ("7", "Dương Đức Mạnh", "Phân tích yêu cầu", "Soạn thảo nội dung Chương 1 và Chương 2 trong báo cáo: khảo sát thực trạng quản lý truyền thống (sổ tay, tin nhắn Zalo), lập ma trận so sánh và phân tích lợi ích của hệ thống.", "git checkout develop\ngit pull origin develop\ngit checkout -b docs/ducmanh-survey-analysis\n# Chinh sua file khao sat trong docs/\ngit add docs/\ngit commit -m \"docs(analysis): bo sung noi dung khao sat thuc trang va ma tran loi ich he thong\"\ngit push -u origin docs/ducmanh-survey-analysis"),
        ("8", "Phương Đình Khoa Nam", "Thiết kế sơ đồ hệ thống", "Thiết kế sơ đồ Use Case tổng thể, sơ đồ kiến trúc ERD 24 bảng PostgreSQL, sơ đồ luồng dữ liệu trên Draw.io/StarUML và xuất ảnh PNG chất lượng cao cho báo cáo.", "git checkout develop\ngit pull origin develop\ngit checkout -b docs/khoanam-system-diagrams\n# Them so do vao docs/diagrams/\ngit add docs/diagrams/\ngit commit -m \"docs(diagrams): cap nhat so do Use Case tong the va ERD 24 bang PostgreSQL\"\ngit push -u origin docs/khoanam-system-diagrams"),
        ("9", "Nguyễn Hoàng Long", "Slide & Hình ảnh minh họa", "Soạn thảo bộ Slide thuyết trình nghiệm thu theo từng Sprint, chụp ảnh màn hình các chức năng và đóng vai khách hàng trong buổi demo nghiệm thu.", "git checkout develop\ngit pull origin develop\ngit checkout -b docs/hoanglong-slide-deck\n# Them slide va anh vao docs/\ngit add docs/\ngit commit -m \"docs(slide): cap nhat slide thuyet trinh sprint 4 va bo anh chup man hinh giao dien\"\ngit push -u origin docs/hoanglong-slide-deck"),
        ("10", "Phạm Mậu Lực", "Dữ liệu mẫu & Video Demo", "Soạn kịch bản dữ liệu thực tế (danh mục dịch vụ, giá tiền thực tế, ảnh thợ), chuẩn bị file seed data SQL và quay video demo hoàn chỉnh luồng đặt lịch.", "git checkout develop\ngit pull origin develop\ngit checkout -b chore/mauluc-seed-demo-media\n# Them seed data va video vao database/ docs/\ngit add database/ docs/\ngit commit -m \"chore(seed): bo sung du lieu mau thuc te cho 20 dich vu spa va anh mau tho\"\ngit push -u origin chore/mauluc-seed-demo-media")
    ]
    
    for num, name, role, desc, cmd in member_cmd_details:
        h3 = doc.add_heading(f"3.{num}. {name} — {role}", level=2)
        h3.paragraph_format.space_before = Pt(8)
        h3.paragraph_format.space_after = Pt(2)
        for r in h3.runs:
            r.font.name = "Calibri"
            r.font.color.rgb = RGBColor(15, 23, 42)
            
        p = doc.add_paragraph(f"• Nhiệm vụ: {desc}")
        p.paragraph_format.space_after = Pt(2)
        p.runs[0].font.name = "Calibri"
        p.runs[0].font.size = Pt(9.5)
        
        p_c = doc.add_paragraph("• Lệnh Git mẫu copy-paste:")
        p_c.paragraph_format.space_after = Pt(2)
        p_c.runs[0].font.name = "Calibri"
        p_c.runs[0].font.size = Pt(9.5)
        p_c.runs[0].bold = True
        
        add_code_block(doc, cmd)

    # =========================================================================
    # CHƯƠNG 4: 4 KỸ THUẬT LEADER SỬA CODE NHƯNG THÀNH VIÊN VẪN CÓ VẾT
    # =========================================================================
    h1 = doc.add_heading("CHƯƠNG 4. BÍ KÍP TECH LEAD: TỰ TAY SỬA/GÁNH CODE NHƯNG THÀNH VIÊN VẪN CÓ 100% VẾT LỊCH SỬ GITHUB", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)

    p = doc.add_paragraph("Để giải quyết triệt để bài toán: Thành viên yếu kỹ năng lập trình, Tech Lead muốn tự viết lại code để hệ thống chạy chuẩn 100% nhưng vẫn cần thành viên có commit xanh và mở PR để tính điểm thực tập:")
    p.paragraph_format.space_after = Pt(4)
    
    create_callout(doc, "Thầy cô chấm điểm dựa trên 3 tiêu chí: (1) Số lượng Pull Request do thành viên mở, (2) Commit History có tên thành viên, (3) Biểu đồ đóng góp Insights -> Contributors. Cả 4 phương pháp dưới đây đều bảo đảm 100% tiêu chí trên!", "LỢI ÍCH CỐT LÕI", "EFF6FF", "2563EB")

    # PP 1
    h2 = doc.add_heading("4.1. Phương Pháp 1: Thành Viên Push Khung Ban Đầu ➔ Tech Lead Sửa Trực Tiếp Trên Nhánh (Khuyên Dùng)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "# BƯỚC 1 (Tại máy của Thành Viên):\ngit checkout develop\ngit pull origin develop\ngit checkout -b feature/namkhanh-public-booking\n# Sửa vài dòng hoặc tạo file mẫu\ngit add .\ngit commit -m \"feat(public): khoi tao khung giao dien dat lich\"\ngit push -u origin feature/namkhanh-public-booking\n# Thành viên lên GitHub mở Pull Request vào develop -> GHI NHẬN CÔNG MỞ PR CHO THÀNH VIÊN!\n\n# BƯỚC 2 (Tại máy của Tech Lead):\ngit fetch origin\ngit checkout feature/namkhanh-public-booking\n# Tech Lead tự do code lại toàn bộ frontend/backend cho chuẩn xịn.\ngit add .\ngit commit -m \"refactor(public): toi uu toan bo logic dat lich va responsive\"\ngit push origin feature/namkhanh-public-booking\n\n# BƯỚC 3:\n# Tech Lead lên GitHub bấm Approve và Merge Pull Request.\n# KẾT QUẢ: Cả thành viên và Lead đều có commit xanh trong lịch sử!")

    # PP 2
    h2 = doc.add_heading("4.2. Phương Pháp 2: Dùng Tính Năng GitHub PR Suggestion (100% Commit Thuộc Về Thành Viên)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(2)
    p = doc.add_paragraph(
        "1. Thành viên tạo PR lên GitHub.\n"
        "2. Tech Lead mở PR > Vào tab Files changed > Bôi đen đoạn code cần sửa > Bấm biểu tượng Add a suggestion (Ctrl + G).\n"
        "3. Lead dán toàn bộ code chuẩn vào khung Suggestion > Bấm Add comment.\n"
        "4. Thành viên mở PR của mình > Bấm nút [Commit suggestion].\n"
        "👉 KẾT QUẢ: Code chuẩn của Lead được đưa vào repo, nhưng GitHub ghi nhận commit đó 100% do thành viên thực hiện!"
    )
    p.paragraph_format.space_after = Pt(4)

    # PP 3
    h2 = doc.add_heading("4.3. Phương Pháp 3: Kỹ Thuật Đồng Tác Giả (Co-Authored-By Commit)", level=2)
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(2)
    p = doc.add_paragraph("Khi Tech Lead tự tay viết code trên máy mình nhưng muốn hệ thống tính điểm cho cả thành viên:")
    p.paragraph_format.space_after = Pt(2)
    add_code_block(doc, "git add .\ngit commit -m \"feat(admin): hoan thien toan bo module quan ly thoi gian ca truc\n\nCo-authored-by: Bui Quang Minh <email_github_quangminh@gmail.com>\nCo-authored-by: Le Thi Phuong Linh <email_github_phuonglinh@gmail.com>\"\ngit push origin develop")

    # =========================================================================
    # CHƯƠNG 5: SỔ TAY XỬ LÝ SỰ CỐ GIT THƯỜNG GẶP
    # =========================================================================
    h1 = doc.add_heading("CHƯƠNG 5. SỔ TAY XỬ LÝ SỰ CỐ GIT THƯỜNG GẶP", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    for r in h1.runs:
        r.font.name = "Calibri"
        r.font.color.rgb = RGBColor(13, 148, 136)

    troubles = [
        ("5.1. Bị từ chối khi Push (rejected - non-fast-forward)", "Nguyên nhân: Trên GitHub có commit mới hơn (do Lead vừa sửa hoặc người khác vừa push).\nCách xử lý:\ngit pull origin <tên_nhánh_của_bạn>\ngit push origin <tên_nhánh_của_bạn>"),
        ("5.2. Xung đột code (Merge Conflict)", "Nguyên nhân: Cả hai người cùng sửa một dòng trong cùng một file.\nCách xử lý:\n1. Mở file bị conflict bằng VS Code.\n2. Chọn Accept Incoming Change (chấp nhận code mới) hoặc Accept Current Change.\n3. Lưu file và chạy:\ngit add .\ngit commit -m \"fix(merge): giai quyet xung dot code\"\ngit push origin <tên_nhánh_của_bạn>"),
        ("5.3. Lỡ commit nhầm file rác hoặc .env", "Cách xử lý hủy commit gần nhất mà giữ nguyên code trong máy:\ngit reset --soft HEAD~1"),
        ("5.4. Muốn xóa sạch các thay đổi chưa commit để quay về ban đầu", "Chạy lệnh:\ngit reset --hard HEAD\ngit clean -fd")
    ]
    
    for title, desc in troubles:
        h3 = doc.add_heading(title, level=2)
        h3.paragraph_format.space_before = Pt(6)
        h3.paragraph_format.space_after = Pt(2)
        p = doc.add_paragraph(desc)
        p.paragraph_format.space_after = Pt(4)
        p.runs[0].font.name = "Calibri"
        p.runs[0].font.size = Pt(9.5)
        
    out_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "guides", "git", "Huong_Dan_Quy_Trinh_Git_Flow_Chuan_10_Thanh_Vien.docx")
    doc.save(out_file)
    print(f"Updated successfully: {out_file}")
    
    # Also try to overwrite old name if unlocked
    try:
        old_file = os.path.join(os.path.dirname(out_file), "Huong_Dan_Quy_Trinh_Git_Va_Luu_Vet_Dong_Gop_10_Thanh_Vien.docx")
        doc.save(old_file)
    except Exception:
        pass

if __name__ == "__main__":
    build_complete_word_doc()
