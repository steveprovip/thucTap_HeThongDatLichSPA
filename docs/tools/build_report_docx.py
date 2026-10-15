# -*- coding: utf-8 -*-
"""
Sinh báo cáo thực tập (.docx) cho dự án Hệ thống Đặt lịch Salon - Spa.

    pip install python-docx
    python docs/tools/build_report_docx.py

Kết quả: docs/reports/Bao_Cao_Thuc_Tap_He_Thong_Dat_Lich_Salon_Spa.docx
Định dạng: A4, lề trên 2 cm – dưới 2 cm – trái 3 cm – phải 1.5 cm, Times New Roman 13, giãn dòng 1.3.
Mở bằng Word -> chọn "Yes" khi được hỏi cập nhật trường để Mục lục có số trang.
"""
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import report_data as D  # noqa: E402

SCREENS = os.path.join(DOCS, "assets", "screens")
DIAGRAMS = os.path.join(DOCS, "assets", "diagrams")
OUT = os.path.join(DOCS, "reports", "Bao_Cao_Thuc_Tap_He_Thong_Dat_Lich_Salon_Spa.docx")

FONT = "Times New Roman"
BODY_PT = 13
TABLE_PT = 13
HEADER_FILL = "D9EFEC"  # teal rất nhạt cho hàng tiêu đề bảng
TEXT_WIDTH_CM = 16.5    # 21 - 3 - 1.5

# ============================================================================ tiện ích XML


def set_run_font(run, size=None, bold=None, italic=None, color=None, font=FONT):
    run.font.name = font
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), font)
    if size is not None:
        run.font.size = Pt(max(BODY_PT, size))
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color)


def style_font(style, size, bold=False, italic=False, color="000000"):
    style.font.name = FONT
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.italic = italic
    style.font.color.rgb = RGBColor.from_string(color)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), FONT)
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rfonts.get(qn(attr)) is not None:
            del rfonts.attrib[qn(attr)]
    return FONT


def shade_cell(cell, fill):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcpr.append(shd)


def set_cell_margins(table, top=60, bottom=60, left=90, right=90):
    tblpr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for side, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tblpr.append(mar)


def set_table_borders(table, sz=6, color="000000"):
    tblpr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(sz))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tblpr.append(borders)


def repeat_header(row):
    trpr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    el.set(qn("w:val"), "true")
    trpr.append(el)


def keep_row_together(row):
    trpr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    el.set(qn("w:val"), "true")
    trpr.append(el)


def add_field(paragraph, instr, placeholder=""):
    """Chèn trường Word (PAGE, TOC …)."""
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    fld_begin.set(qn("w:dirty"), "true")
    run._r.append(fld_begin)
    run2 = paragraph.add_run()
    instr_el = OxmlElement("w:instrText")
    instr_el.set(qn("xml:space"), "preserve")
    instr_el.text = instr
    run2._r.append(instr_el)
    run3 = paragraph.add_run()
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run3._r.append(sep)
    run4 = paragraph.add_run(placeholder)
    set_run_font(run4, size=BODY_PT, italic=bool(placeholder))
    run5 = paragraph.add_run()
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run5._r.append(end)
    for r in (run, run2, run3, run5):
        set_run_font(r, size=BODY_PT)


def set_page_number_format(section, fmt="decimal", start=1):
    sectpr = section._sectPr
    pg = sectpr.find(qn("w:pgNumType"))
    if pg is None:
        pg = OxmlElement("w:pgNumType")
        sectpr.append(pg)
    pg.set(qn("w:fmt"), fmt)
    pg.set(qn("w:start"), str(start))


def set_page_border(section):
    """Khung viền đôi cho trang bìa (theo thói quen trình bày báo cáo ở Việt Nam)."""
    sectpr = section._sectPr
    borders = OxmlElement("w:pgBorders")
    borders.set(qn("w:offsetFrom"), "page")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "thinThickSmallGap")
        el.set(qn("w:sz"), "24")
        el.set(qn("w:space"), "24")
        el.set(qn("w:color"), "0F766E")
        borders.append(el)
    # pgBorders phải đứng sau pgMar theo lược đồ
    pgmar = sectpr.find(qn("w:pgMar"))
    pgmar.addnext(borders)


def enable_update_fields(doc):
    settings = doc.settings.element
    el = OxmlElement("w:updateFields")
    el.set(qn("w:val"), "true")
    settings.append(el)


# ============================================================================ khối nội dung


class Report:
    def __init__(self):
        self.doc = Document()
        self.chapter = 0
        self.fig = 0
        self.tab = 0
        self._setup_styles()

    # ---------------------------------------------------------------- styles
    def _setup_styles(self):
        st = self.doc.styles
        for style in st:
            if hasattr(style, "font"):
                style_font(style, BODY_PT)
        normal = st["Normal"]
        style_font(normal, BODY_PT)
        pf = normal.paragraph_format
        pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
        pf.line_spacing = 1.3
        pf.space_before = Pt(0)
        pf.space_after = Pt(6)

        h1 = st["Heading 1"]
        style_font(h1, 16, bold=True)
        h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        h1.paragraph_format.space_before = Pt(0)
        h1.paragraph_format.space_after = Pt(6)
        h1.paragraph_format.page_break_before = True
        h1.paragraph_format.keep_with_next = True
        h1.paragraph_format.line_spacing = 1.3

        h2 = st["Heading 2"]
        style_font(h2, 14, bold=True)
        h2.paragraph_format.space_before = Pt(0)
        h2.paragraph_format.space_after = Pt(6)
        h2.paragraph_format.keep_with_next = True
        h2.paragraph_format.line_spacing = 1.3

        h3 = st["Heading 3"]
        style_font(h3, 13, bold=True, italic=True)
        h3.paragraph_format.space_before = Pt(0)
        h3.paragraph_format.space_after = Pt(6)
        h3.paragraph_format.keep_with_next = True
        h3.paragraph_format.line_spacing = 1.3

        for name in ("List Bullet", "List Number"):
            s = st[name]
            style_font(s, BODY_PT)
            s.paragraph_format.line_spacing = 1.3
            s.paragraph_format.space_after = Pt(6)

        for i in (1, 2, 3):
            s = st[f"TOC {i}"] if f"TOC {i}" in [x.name for x in st] else st.add_style(f"TOC {i}", 1)
            style_font(s, BODY_PT, bold=(i == 1))
            s.paragraph_format.left_indent = Cm(0.6 * (i - 1))
            s.paragraph_format.space_after = Pt(2)

    # ---------------------------------------------------------------- page setup
    @staticmethod
    def _margins(section):
        # add_section() sao chép sectPr của phần trước (kể cả khung viền trang bìa) -> bỏ đi
        old = section._sectPr.find(qn("w:pgBorders"))
        if old is not None:
            section._sectPr.remove(old)
        section.page_height = Cm(29.7)
        section.page_width = Cm(21.0)
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(3)
        section.right_margin = Cm(1.5)
        section.header_distance = Cm(1.0)
        section.footer_distance = Cm(1.0)

    def _page_number(self, section):
        section.header.is_linked_to_previous = False
        p = section.header.paragraphs[0]
        p.text = ""
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_field(p, "PAGE")

    # ---------------------------------------------------------------- building blocks
    def para(self, text="", bold=False, italic=False, align=WD_ALIGN_PARAGRAPH.JUSTIFY,
             indent=True, size=None, space_after=None, keep_next=False):
        p = self.doc.add_paragraph()
        p.alignment = align
        if indent:
            p.paragraph_format.first_line_indent = Cm(1.27)
        if space_after is not None:
            p.paragraph_format.space_after = Pt(space_after)
        if keep_next:
            p.paragraph_format.keep_with_next = True
        self._rich(p, text, bold=bold, italic=italic, size=size)
        return p

    def _rich(self, p, text, bold=False, italic=False, size=None):
        """**đậm** và `mã` trong một đoạn."""
        import re
        parts = re.split(r"(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)", text)
        for part in parts:
            if not part:
                continue
            if part.startswith("**"):
                r = p.add_run(part[2:-2])
                set_run_font(r, size=size or BODY_PT, bold=True, italic=italic)
            elif part.startswith("*") and part.endswith("*") and len(part) > 2:
                r = p.add_run(part[1:-1])
                set_run_font(r, size=size or BODY_PT, bold=bold, italic=True)
            elif part.startswith("`"):
                r = p.add_run(part[1:-1])
                set_run_font(r, size=size or BODY_PT, bold=bold, italic=italic)
            else:
                r = p.add_run(part)
                set_run_font(r, size=size or BODY_PT, bold=bold, italic=italic)

    def bullets(self, items, style="List Bullet"):
        for it in items:
            p = self.doc.add_paragraph(style=style)
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            self._rich(p, it)

    def h1(self, title):
        self.chapter += 1
        self.fig = 0
        self.tab = 0
        p = self.doc.add_paragraph(style="Heading 1")
        r = p.add_run(f"CHƯƠNG {self.chapter}")
        set_run_font(r, size=16, bold=True)
        r.add_break(WD_BREAK.LINE)
        r2 = p.add_run(title.upper())
        set_run_font(r2, size=16, bold=True)
        self.sec = 0

    def h1_plain(self, title):
        p = self.doc.add_paragraph(style="Heading 1")
        r = p.add_run(title.upper())
        set_run_font(r, size=16, bold=True)

    def h2(self, title):
        self.sec += 1
        self.sub = 0
        p = self.doc.add_paragraph(style="Heading 2")
        r = p.add_run(f"{self.chapter}.{self.sec}. {title}")
        set_run_font(r, size=14, bold=True)

    def h3(self, title):
        self.sub += 1
        p = self.doc.add_paragraph(style="Heading 3")
        r = p.add_run(f"{self.chapter}.{self.sec}.{self.sub}. {title}")
        set_run_font(r, size=13, bold=True, italic=True)

    def caption(self, kind, text):
        if kind == "Bảng":
            self.tab += 1
            n = self.tab
        else:
            self.fig += 1
            n = self.fig
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(6)
        if kind == "Bảng":
            p.paragraph_format.keep_with_next = True
        r = p.add_run(f"{kind} {self.chapter}.{n}: ")
        set_run_font(r, size=13, bold=True, italic=True)
        r2 = p.add_run(text)
        set_run_font(r2, size=13, italic=True)

    def figure(self, path, caption, width_cm=TEXT_WIDTH_CM):
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.line_spacing = 1.0
        p.add_run().add_picture(path, width=Cm(width_cm))
        self.caption("Hình", caption)

    def table(self, header, rows, widths_cm, caption=None, align=None, font_size=TABLE_PT, bold_first_col=False):
        font_size = max(BODY_PT, font_size)
        if caption:
            self.caption("Bảng", caption)
        t = self.doc.add_table(rows=1, cols=len(header))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        set_table_borders(t)
        set_cell_margins(t)
        hdr = t.rows[0]
        repeat_header(hdr)
        for i, h in enumerate(header):
            c = hdr.cells[i]
            c.width = Cm(widths_cm[i])
            shade_cell(c, HEADER_FILL)
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.line_spacing = 1.3
            p.paragraph_format.space_after = Pt(6)
            r = p.add_run(h)
            set_run_font(r, size=font_size, bold=True)
        for row in rows:
            cells = t.add_row().cells
            keep_row_together(t.rows[-1])
            for i, val in enumerate(row):
                c = cells[i]
                c.width = Cm(widths_cm[i])
                c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                p = c.paragraphs[0]
                p.paragraph_format.line_spacing = 1.3
                p.paragraph_format.space_after = Pt(6)
                p.alignment = (align[i] if align else WD_ALIGN_PARAGRAPH.LEFT)
                self._rich(p, str(val), bold=(bold_first_col and i == 0), size=font_size)
        # độ rộng cột ở cấp lưới bảng (Word + LibreOffice đều đọc)
        grid = t._tbl.tblGrid
        for i, gc in enumerate(grid.findall(qn("w:gridCol"))):
            gc.set(qn("w:w"), str(int(widths_cm[i] * 567)))
        if len(rows) <= 5:  # bảng nhỏ: giữ trọn trên một trang
            for row in t.rows[:-1]:
                for c in row.cells:
                    for p in c.paragraphs:
                        p.paragraph_format.keep_with_next = True
        spacer = self.doc.add_paragraph()
        spacer.paragraph_format.space_after = Pt(4)
        spacer.paragraph_format.line_spacing = 1.0
        return t

    def side_by_side(self, images):
        t = self.doc.add_table(rows=1, cols=len(images))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for i, (path, w) in enumerate(images):
            c = t.rows[0].cells[i]
            c.width = Cm(w + 0.4)
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next = True
            p.paragraph_format.line_spacing = 1.0
            p.add_run().add_picture(path, width=Cm(w))
        grid = t._tbl.tblGrid
        for i, gc in enumerate(grid.findall(qn("w:gridCol"))):
            gc.set(qn("w:w"), str(int((images[i][1] + 0.4) * 567)))

    def code(self, lines):
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(t, sz=4, color="94A3B8")
        set_cell_margins(t, 100, 100, 160, 160)
        c = t.rows[0].cells[0]
        c.width = Cm(TEXT_WIDTH_CM)
        keep_row_together(t.rows[0])
        shade_cell(c, "F1F5F9")
        c.paragraphs[0].text = ""
        for i, line in enumerate(lines):
            p = c.paragraphs[0] if i == 0 else c.add_paragraph()
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(line if line else " ")
            set_run_font(r, size=13)
        sp = self.doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(2)

    def page_break(self):
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    def save(self):
        enable_update_fields(self.doc)
        self.doc.save(OUT)


# ============================================================================ NỘI DUNG


def cover(R: Report):
    s = R.doc.sections[0]
    Report._margins(s)
    set_page_border(s)

    def line(text, size=13, bold=False, italic=False, after=0, before=0, color=None):
        p = R.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(after)
        p.paragraph_format.space_before = Pt(before)
        p.paragraph_format.line_spacing = 1.15
        r = p.add_run(text)
        set_run_font(r, size=size, bold=bold, italic=italic, color=color)
        return p

    line(D.UNIVERSITY_PARENT, 13)
    line(D.UNIVERSITY, 13, bold=True)
    line(D.FACULTY, 13, bold=True, after=4)
    line("───────── ✦ ─────────", 12, color="0F766E", after=40)
    line(D.REPORT_KIND, 20, bold=True, after=18, color="0F172A")
    line("ĐỀ TÀI", 13, bold=True, after=6)
    line(D.TITLE, 18, bold=True, after=34, color="0F766E")

    info = [("Giảng viên hướng dẫn (PO)", D.ADVISOR), ("Lớp học phần", D.CLASS_CODE),
            ("Nhóm thực hiện", f"{D.TEAM} – {len(D.MEMBERS)} thành viên")]
    t = R.doc.add_table(rows=0, cols=2)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for k, v in info:
        cells = t.add_row().cells
        cells[0].width, cells[1].width = Cm(6.2), Cm(8.0)
        for c, txt, b in ((cells[0], k + ":", False), (cells[1], v, True)):
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(txt)
            set_run_font(r, size=13, bold=b)
    R.doc.add_paragraph().paragraph_format.space_after = Pt(4)

    p = R.doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Sinh viên thực hiện")
    set_run_font(r, size=13, bold=True)

    t = R.doc.add_table(rows=1, cols=3)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t, sz=4, color="64748B")
    set_cell_margins(t, 20, 20, 90, 90)
    widths = [1.2, 7.0, 4.0]
    for i, h in enumerate(("STT", "Họ và tên", "MSSV")):
        c = t.rows[0].cells[i]
        c.width = Cm(widths[i])
        shade_cell(c, HEADER_FILL)
        pp = c.paragraphs[0]
        pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pp.paragraph_format.space_after = Pt(0)
        pp.paragraph_format.line_spacing = 1.0
        set_run_font(pp.add_run(h), size=13, bold=True)
    for i, m in enumerate(D.MEMBERS, 1):
        cells = t.add_row().cells
        for j, (txt, al) in enumerate(((str(i), WD_ALIGN_PARAGRAPH.CENTER), (m["name"], WD_ALIGN_PARAGRAPH.LEFT),
                                       (m["mssv"] or "…………………", WD_ALIGN_PARAGRAPH.CENTER))):
            c = cells[j]
            c.width = Cm(widths[j])
            pp = c.paragraphs[0]
            pp.alignment = al
            pp.paragraph_format.space_after = Pt(0)
            pp.paragraph_format.line_spacing = 1.0
            set_run_font(pp.add_run(txt), size=13)
    grid = t._tbl.tblGrid
    for i, gc in enumerate(grid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths[i] * 567)))

    line(D.PLACE_DATE, 13, bold=True, italic=True, before=110)


def front_matter(R: Report):
    s = R.doc.add_section(WD_SECTION.NEW_PAGE)
    Report._margins(s)
    set_page_number_format(s, "lowerRoman", 1)
    R._page_number(s)

    R.h1_plain("Lời cảm ơn")
    R.para(f"Nhóm 3 xin gửi lời cảm ơn chân thành tới **{D.ADVISOR}** – giảng viên hướng dẫn, đồng thời đảm nhận "
           "vai trò Product Owner của dự án. Thầy đã định hướng Product Backlog, trực tiếp nghiệm thu từng Sprint và "
           "đưa ra những phản hồi cụ thể giúp nhóm hoàn thiện sản phẩm theo đúng nhu cầu vận hành thực tế của một salon.")
    R.para("Nhóm cũng cảm ơn Trường Đại học Công nghệ Thông tin và Truyền thông đã tạo điều kiện để nhóm được thực hành quy trình "
           "Scrum trên một dự án phần mềm hoàn chỉnh, từ phân tích yêu cầu, thiết kế, lập trình, kiểm thử đến triển khai.")
    R.para("Trong quá trình thực hiện, dù đã cố gắng, báo cáo khó tránh khỏi thiếu sót. Nhóm rất mong nhận được "
           "góp ý của thầy cô để tiếp tục hoàn thiện hệ thống.")
    p = R.para("Nhóm sinh viên thực hiện", italic=True, align=WD_ALIGN_PARAGRAPH.RIGHT, indent=False)
    p.paragraph_format.space_before = Pt(12)

    R.h1_plain("Mục lục")
    p = R.doc.add_paragraph()
    add_field(p, 'TOC \\o "1-3" \\h \\z \\u',
              "Nhấn chuột phải vào đây → Update Field (hoặc F9) để hiển thị mục lục và số trang.")

    R.h1_plain("Danh mục từ viết tắt")
    R.table(["Viết tắt", "Ý nghĩa"], [
        ("API", "Application Programming Interface – giao diện lập trình ứng dụng"),
        ("CSDL", "Cơ sở dữ liệu"),
        ("CRM", "Customer Relationship Management – quản lý quan hệ khách hàng"),
        ("CSV", "Comma-Separated Values – tệp dữ liệu phân tách bằng dấu phẩy"),
        ("DoD", "Definition of Done – định nghĩa hoàn thành"),
        ("DTO", "Data Transfer Object – đối tượng truyền dữ liệu"),
        ("E2E", "End-to-End – kiểm thử đầu cuối"),
        ("JWT", "JSON Web Token – mã thông báo xác thực"),
        ("ORM", "Object-Relational Mapping – ánh xạ đối tượng – quan hệ"),
        ("PO", "Product Owner – chủ sản phẩm"),
        ("RBAC", "Role-Based Access Control – phân quyền theo vai trò"),
        ("SPA", "Single Page Application – ứng dụng web một trang"),
        ("SĐT", "Số điện thoại"),
        ("UI / UX", "User Interface / User Experience – giao diện / trải nghiệm người dùng"),
    ], [3.0, 13.0])


def chapter1(R: Report):
    s = R.doc.add_section(WD_SECTION.NEW_PAGE)
    Report._margins(s)
    set_page_number_format(s, "decimal", 1)
    R._page_number(s)

    R.h1("Tổng quan đề tài và bài toán thực tế")
    R.h2("Lý do chọn đề tài")
    R.para("Làm đẹp là một trong những ngành dịch vụ tăng trưởng nhanh tại Việt Nam, với rất nhiều salon tóc và spa "
           "quy mô vừa và nhỏ hoạt động ở các đô thị. Phần lớn các cơ sở này vẫn quản lý lịch hẹn bằng sổ tay, bảng "
           "tính hoặc tin nhắn Zalo, Facebook. Cách làm đó đủ dùng khi tiệm chỉ có một vài thợ, nhưng nhanh chóng quá tải "
           "khi số thợ, số dịch vụ và lượng khách tăng lên.")
    R.para("Đề tài **“Xây dựng Hệ thống Đặt lịch và Quản lý Vận hành Salon - Spa”** được lựa chọn vì vừa có bài toán "
           "nghiệp vụ rõ ràng, gần gũi, vừa chứa những thách thức kỹ thuật đáng giá: tính khung giờ trống theo ca làm của "
           "từng thợ, chống hai khách đặt trùng một khung giờ khi thao tác đồng thời, phân quyền cho nhiều vai trò và "
           "bảo đảm tính minh bạch của doanh thu. Đây cũng là môi trường phù hợp để nhóm thực hành trọn vẹn quy trình "
           "Scrum trong bốn Sprint.")

    R.h2("Mô hình salon – spa quy mô vừa")
    R.para("Đối tượng phục vụ của hệ thống là một salon – spa quy mô vừa, có từ **6 đến 8 thợ**, cung cấp khoảng 10–15 "
           "dịch vụ thuộc các nhóm tóc, gội – dưỡng, chăm sóc da, trang điểm và móng; thời lượng mỗi dịch vụ từ 30 đến "
           "120 phút. Tiệm mở cửa cả tuần, cuối tuần đông khách hơn ngày thường. Mỗi thợ có ca làm riêng, nghỉ giữa ca và "
           "một ngày nghỉ cố định trong tuần.")
    R.para("Quy trình phục vụ điển hình gồm các bước:", keep_next=True)
    R.bullets([
        "Khách liên hệ đặt lịch (gọi điện, nhắn tin) hoặc đến thẳng tiệm (khách vãng lai).",
        "Lễ tân kiểm tra thợ nào còn trống, ghi lịch và xác nhận với khách.",
        "Khi khách đến, lễ tân check-in và chuyển khách cho thợ; thợ thực hiện dịch vụ.",
        "Kết thúc lượt, lễ tân lập phiếu, áp dụng ưu đãi nếu có và thu tiền mặt hoặc chuyển khoản.",
        "Chủ tiệm tổng hợp doanh thu theo thợ, theo dịch vụ để tính hoa hồng và ra quyết định kinh doanh.",
    ])

    R.h2("Những khó khăn khi quản lý thủ công")
    R.para("Qua khảo sát cách vận hành bằng sổ tay và tin nhắn, nhóm tổng hợp các vấn đề chính trong Bảng 1.1.")
    R.table(["Vấn đề", "Biểu hiện trong thực tế", "Hậu quả"], [
        ("**Chồng lịch**", "Hai người cùng nhận lịch cho một thợ vào cùng khung giờ; không ai biết dịch vụ 120 phút sẽ lấn sang lịch kế tiếp",
         "Khách phải chờ lâu hoặc bị huỷ, mất uy tín"),
        ("**Mất khách**", "Tin nhắn đặt lịch ngoài giờ hoặc giờ cao điểm không được trả lời kịp",
         "Khách chuyển sang tiệm khác"),
        ("**Khách không đến (no-show)**", "Không có nhắc lịch; không lưu lịch sử khách hay lỡ hẹn",
         "Thợ ngồi chơi, khung giờ bị lãng phí"),
        ("**Gian lận, thất thoát doanh thu**", "Thu tiền mặt không ghi phiếu, sửa sổ sau khi thu, áp ưu đãi tuỳ tiện",
         "Chủ tiệm không kiểm soát được doanh thu thật"),
        ("**Thiếu dữ liệu khách hàng**", "Không biết khách đã làm dịch vụ gì, dùng sản phẩm nào, thích thợ nào",
         "Tư vấn kém, khó chăm sóc khách quen"),
        ("**Báo cáo chậm, thiếu chính xác**", "Cuối tháng mới cộng sổ để tính doanh thu và hoa hồng",
         "Quyết định kinh doanh dựa trên cảm tính"),
    ], [3.6, 7.2, 5.2], caption="Các vấn đề của cách quản lý thủ công")

    R.h2("Mục tiêu của phần mềm")
    R.para("Từ các vấn đề trên, hệ thống đặt ra những mục tiêu có thể kiểm chứng được:", keep_next=True)
    R.bullets([
        "Khách **tự đặt lịch trực tuyến 24/7** qua 4 bước (dịch vụ → khung giờ → thợ → xác nhận), không cần tài khoản, chỉ thấy những khung giờ thợ thực sự rảnh.",
        "**Không bao giờ chồng lịch**: kể cả khi nhiều khách cùng bấm đặt một khung giờ tại cùng thời điểm, chỉ đúng một yêu cầu thành công.",
        "Lễ tân có **lịch ngày trực quan** theo cột thợ, trục 15 phút; check-in, dời lịch, chuyển thợ hàng loạt chỉ với vài thao tác.",
        "**Giảm no-show** nhờ email xác nhận, nhắc lịch trước 24 giờ, lưu số lần không đến trong hồ sơ khách.",
        "**Minh bạch doanh thu**: phiếu tính tiền khoá sau khi đóng, chỉ điều chỉnh bằng phiếu điều chỉnh; mọi thao tác quan trọng ghi vào nhật ký chỉ đọc.",
        "Chủ tiệm xem **doanh thu theo thợ / dịch vụ**, tỉ lệ không đến và phân bố khung giờ, xuất CSV mở được bằng Excel.",
        "Triển khai **một chạm**: sao chép dự án sang máy bất kỳ, bật Docker Desktop, nhấp đúp `run_project.bat` là toàn bộ hệ thống chạy.",
    ])

    R.h2("Đối tượng sử dụng và phạm vi")
    R.table(["Vai trò", "Nhu cầu chính", "Phạm vi trong hệ thống"], [
        ("Khách hàng", "Đặt lịch nhanh, tra cứu, huỷ lịch, đánh giá", "Trang công khai, không cần đăng nhập; tra cứu bằng mã 8 ký tự hoặc SĐT"),
        ("Lễ tân", "Điều phối lịch trong ngày, tiếp khách, thu tiền", "Lịch ngày, chờ xác nhận, khách vãng lai, chuyển lịch hàng loạt, phiếu tính tiền, hồ sơ khách"),
        ("Thợ", "Biết hôm nay làm cho ai, dịch vụ gì", "Lịch của tôi, bắt đầu / hoàn tất, ghi chú kỹ thuật; SĐT khách bị che"),
        ("Chủ tiệm", "Nắm doanh thu, cấu hình dịch vụ và ca làm", "Tổng quan, doanh thu, phân bố khung giờ, dịch vụ, hồ sơ thợ, ca làm, giờ mở cửa, mã giảm giá"),
        ("Quản trị hệ thống", "Quản lý tài khoản, kiểm soát an toàn", "Tài khoản nhân sự, nhật ký hoạt động, bảng phân quyền"),
    ], [3.0, 5.0, 8.0], caption="Bốn vai trò nhân sự và khách trên trang công khai")
    R.para("Ngoài phạm vi của phiên bản hiện tại: thanh toán trực tuyến qua cổng thanh toán, ứng dụng di động gốc, quản lý "
           "nhiều chi nhánh và quản lý kho mỹ phẩm.")

    R.h2("Công nghệ sử dụng")
    R.table(["Thành phần", "Công nghệ", "Lý do lựa chọn"], [
        ("Backend", "NestJS 10, TypeScript", "Kiến trúc module rõ ràng, Dependency Injection, Guard/Interceptor cho phân quyền và nhật ký"),
        ("Truy cập dữ liệu", "TypeORM 0.3", "Ánh xạ entity, giao dịch với mức cô lập tuỳ chọn (SERIALIZABLE)"),
        ("Cơ sở dữ liệu", "PostgreSQL 15", "Kiểu khoảng thời gian (tstzrange), ràng buộc EXCLUDE USING gist, trigger, múi giờ"),
        ("Frontend", "React 18, Vite 5, Tailwind CSS 3.4", "SPA nhanh, khởi động dev < 1 giây, thiết kế nhất quán theo phong cách Fresha"),
        ("Biểu đồ, biểu tượng", "Recharts, Lucide Icons", "Biểu đồ doanh thu, phân bố khung giờ; bộ icon gọn nhẹ"),
        ("Email", "Nodemailer + Maildev", "Hàng đợi email có thử lại; hộp thư ảo để kiểm thử"),
        ("Hạ tầng", "Docker Compose, PgAdmin", "Dựng CSDL và dịch vụ phụ trợ bằng một lệnh trên mọi máy"),
        ("Kiểm thử", "Jest, Supertest, Playwright", "Kiểm thử đơn vị, E2E qua HTTP và kiểm thử giao diện tự động"),
        ("Quản lý dự án", "Jira, GitHub (Git Flow)", "Quản lý Backlog – Sprint; nhánh feature/fix → develop → main, gắn tag phát hành"),
    ], [3.2, 4.3, 8.5], caption="Công nghệ sử dụng trong dự án")


def chapter2(R: Report):
    R.h1("Phân tích yêu cầu và quy trình Scrum")
    R.h2("Quy trình Scrum áp dụng")
    R.para(f"Dự án được thực hiện theo khung Scrum với bốn Sprint. **{D.ADVISOR}** đóng vai trò Product Owner: sở hữu "
           "Product Backlog, quyết định thứ tự ưu tiên và nghiệm thu Increment cuối mỗi Sprint. Nhóm phát triển gồm "
           f"{len(D.MEMBERS)} thành viên, tự tổ chức và liên chức năng (backend, frontend, kiểm thử, tài liệu).")
    R.table(["Sự kiện / công cụ", "Cách nhóm thực hiện"], [
        ("Sprint Planning", "Chọn user story từ Product Backlog theo độ ưu tiên (Must / Should), thống nhất Sprint Goal, ước lượng Story Point bằng Planning Poker"),
        ("Daily Scrum", "Trao đổi 15 phút mỗi ngày: đã làm gì, sẽ làm gì, vướng mắc gì; cập nhật trạng thái ticket trên Jira"),
        ("Sprint Review", "Demo trên môi trường staging theo docs/DEMO-SCRIPT.md, PO nghiệm thu và ghi nhận lỗi (ví dụ: 15 + 8 lỗi ở Sprint 1)"),
        ("Sprint Retrospective", "Rút kinh nghiệm theo Start – Stop – Continue, đưa hành động cải tiến vào Sprint kế tiếp"),
        ("Quản lý mã nguồn", "GitHub theo Git Flow: nhánh `feature/…`, `fix/…` → develop → main, mỗi bản phát hành gắn tag (v1.1.0 … v1.2.5)"),
    ], [4.0, 12.0], caption="Các sự kiện Scrum và công cụ của nhóm")
    R.para("**Định nghĩa Hoàn thành (DoD)** của nhóm: mã được review và merge vào develop; `npm run build` và "
           "`npm run lint` của cả backend lẫn frontend đạt 0 lỗi, 0 cảnh báo; kiểm thử đơn vị và E2E đều đạt; "
           "story được đối chiếu trong `docs/BACKLOG-MAPPING.md`; chức năng chạy được trên staging dựng bằng một lệnh.")

    R.h2("Product Backlog: 6 Epic, 39 User Story, 165 Story Point")
    total_s = sum(e[2] for e in D.EPICS)
    total_p = sum(e[3] for e in D.EPICS)
    R.table(["Mã", "Epic", "Số story", "Story Point", "Tỉ trọng"],
            [(e[0], e[1], e[2], e[3], f"{e[3] / total_p * 100:.1f}%".replace(".", ",")) for e in D.EPICS]
            + [("", "**Tổng cộng**", f"**{total_s}**", f"**{total_p}**", "**100%**")],
            [1.8, 8.2, 2.0, 2.2, 1.8], caption="Phân rã Product Backlog theo Epic",
            align=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER,
                   WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER])
    R.para("Epic lớn nhất là EP-04 *Vận hành lịch hẹn hằng ngày* (39 point, 23,6%) – phản ánh đúng thực tế: phần việc "
           "của lễ tân trong ngày là nơi phần mềm tạo ra nhiều giá trị nhất. EP-03 *Đặt lịch công khai* đứng thứ hai, "
           "chứa hai story kỹ thuật khó nhất là bộ tính khung giờ trống (S2-05) và chống đặt trùng (S2-08).")

    R.h3("Danh sách 39 User Story")
    R.table(["Mã", "Epic", "Point", "Nội dung chính (tiêu chí chấp nhận tóm tắt)"],
            [(s[0], s[1], D.STORY_POINTS[s[0]], s[2]) for s in D.STORIES], [1.8, 1.8, 1.4, 11.0],
            caption="Danh sách user story theo Sprint",
            align=[WD_ALIGN_PARAGRAPH.CENTER] * 3 + [WD_ALIGN_PARAGRAPH.LEFT])
    R.para("Tiền tố mã story cho biết Sprint thực hiện (S1 … S4). Story S4-10 thuộc EP-01 nhưng được đặt ở Sprint cuối "
           "vì là bước rà soát phân quyền tổng thể sau khi mọi màn hình đã hoàn thành.")

    R.h2("Kế hoạch bốn Sprint")
    R.table(["Sprint", "Chủ đề", "Trọng tâm", "Story", "Point"],
                [(s[0], s[1], s[2], s[3], s[4]) for s in D.SPRINTS] + [("**Tổng**", "", "", "**39**", "**165**")],
                [2.0, 3.6, 7.6, 1.3, 1.5], caption="Phân công user story vào bốn Sprint",
                align=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT,
                       WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER])
    R.para("Đối chiếu sheet Product Backlog và Sprint Plan của đề tài gốc: Sprint 1 có 10 story / 40 point; "
           "Sprint 2 có 9 story / 42 point; Sprint 3 có 10 story / 42 point; Sprint 4 có 10 story / 41 point. "
           "Tổng cộng 39 story và 165 point, không gộp điểm hai Sprint cuối.")

    R.h2("Ma trận phân công 10 thành viên")
    R.table(["TT", "Thành viên", "Vai trò", "Nhiệm vụ chính", "Sản phẩm bàn giao"],
            [(i, m["name"], m["role"], m["task"], m["output"]) for i, m in enumerate(D.MEMBERS, 1)],
            [1.0, 3.0, 2.8, 5.8, 3.4], caption="Phân công nhiệm vụ theo thành viên",
            align=[WD_ALIGN_PARAGRAPH.CENTER] + [WD_ALIGN_PARAGRAPH.LEFT] * 4, font_size=10.5)
    mark = {"C": "●", "H": "○", "": ""}
    R.table(["Thành viên"] + [a[1] for a in D.AREAS],
            [[m["name"]] + [mark[m["areas"][a[0]]] for a in D.AREAS] for m in D.MEMBERS],
            [3.7] + [2.05] * 6, caption="Ma trận trách nhiệm theo mảng công việc (● phụ trách chính, ○ hỗ trợ)",
            align=[WD_ALIGN_PARAGRAPH.LEFT] + [WD_ALIGN_PARAGRAPH.CENTER] * 6, font_size=10.5)


def chapter3(R: Report):
    R.h1("Thiết kế kiến trúc và cơ sở dữ liệu")
    R.h2("Kiến trúc tổng thể")
    R.table(["Tầng", "Công nghệ", "Trách nhiệm"], D.ARCHITECTURE, [3.0, 4.5, 8.5],
            caption="Kiến trúc bốn tầng của hệ thống")
    R.para("Hệ thống tổ chức theo dạng **monorepo**: một kho mã chứa cả backend, frontend, lược đồ CSDL, tài liệu và "
           "các script khởi động. Hai ứng dụng giao tiếp qua REST/JSON; ở môi trường phát triển, Vite làm proxy "
           "chuyển `/api`, `/uploads`, `/health` sang NestJS nên trình duyệt chỉ làm việc với một địa chỉ duy nhất.")
    R.code([
        "du_an/",
        "├── HoYoSalon.bat       Điểm vào 1-Click duy nhất (Launcher)",
        "├── backend/            NestJS – API, service, repository, SSE",
        "│   └── database/       schema.sql (migration gốc), seed.sql",
        "├── frontend/           React 18 + Vite – pages, api, contexts",
        "├── deploy/             docker/ (Compose), cloudflared/",
        "├── docs/               reports/, presentations/, requirements/, …",
        "├── scripts/            launcher.mjs, update.mjs, backup.mjs, hoyo/",
        "└── tests/              kịch bản AI e2e, kết quả kiểm thử AI",
    ])

    R.h3("Backend phân tầng Controller – Service – Repository")
    R.para("Mỗi module NestJS gồm ba tầng. **Controller** nhận yêu cầu HTTP, kiểm tra dữ liệu vào bằng DTO và "
           "class-validator. **Service** chứa toàn bộ quy tắc nghiệp vụ và quản lý giao dịch. **Repository** (TypeORM) "
           "đọc ghi CSDL. Các mối quan tâm xuyên suốt được đặt ở tầng toàn cục để không lặp lại trong từng module:")
    R.bullets([
        "`JwtAuthGuard` – mặc định **mọi** endpoint đều yêu cầu đăng nhập; endpoint công khai phải khai báo `@Public()`.",
        "`RolesGuard` – so khớp vai trò với ma trận phân quyền, trả 403 nếu không đủ quyền.",
        "`MustChangePasswordGuard` – tài khoản dùng mật khẩu tạm bị buộc đổi mật khẩu trước khi thao tác.",
        "`ValidationPipe` – gom lỗi thành thông điệp tiếng Việt kèm tên trường để giao diện đánh dấu đúng ô nhập.",
        "`TransformInterceptor` – bọc mọi phản hồi thành `{ success, data }`; `AuditLogInterceptor` ghi nhật ký thao tác.",
        "`AllExceptionsFilter` – ánh xạ lỗi CSDL (ví dụ `23P01` vi phạm EXCLUDE, `40001` xung đột tuần tự hoá) thành mã HTTP 409 có thông điệp dễ hiểu.",
    ])

    R.h3("Frontend React SPA theo phong cách Fresha")
    R.para("Giao diện lấy cảm hứng từ Fresha và GlossGenius theo phong cách *Light Luxury*: màu chủ đạo teal `#0D9488`, "
           "chữ Slate-900, nền sáng, góc bo mềm và bóng đổ nhẹ. Ứng dụng chia thành hai bố cục: trang công khai cho "
           "khách (tối ưu cho màn hình 360 px, thanh điều hướng dưới cùng) và khu quản lý với menu trái sinh theo vai trò.")
    R.bullets([
        "`api/client.ts` gắn JWT vào mọi yêu cầu, tự làm mới access token khi hết hạn và chỉ gọi refresh một lần cho nhiều yêu cầu song song.",
        "`AuthContext`, `BookingContext`, `ToastContext` quản lý phiên đăng nhập, trạng thái đặt lịch 4 bước và thông báo.",
        "Tuyến đường được bảo vệ theo vai trò; sau đăng nhập, người dùng được đưa thẳng tới trang phù hợp (`ROLE_LANDING`).",
        "Ảnh dịch vụ có cơ chế dự phòng: khi ảnh lỗi hoặc mất mạng, thành phần `SmartImage` hiển thị nền gradient theo chủ đề thay vì khung ảnh vỡ.",
    ])

    R.h3("Bảo mật và phân quyền")
    R.table(["Cơ chế", "Cài đặt"], [
        ("Xác thực", "JWT: access token 30 phút, refresh token 7 ngày (lưu dạng băm trong `refresh_tokens`); mật khẩu băm bcrypt"),
        ("Chống dò mật khẩu", "Khoá tài khoản 15 phút sau 5 lần đăng nhập sai liên tiếp"),
        ("Thu hồi phiên", "`sessions_valid_from`: ngưng hoạt động hoặc đổi mật khẩu làm mọi phiên cũ mất hiệu lực ngay"),
        ("Phân quyền RBAC", "4 vai trò nhân sự: Thợ, Lễ tân, Chủ tiệm, Quản trị; Khách hàng dùng trang công khai; ma trận quyền F / W / R / – cho 9 nhóm chức năng"),
        ("Giới hạn tần suất", "Đặt lịch 5 lần/IP/giờ; tra cứu chặn 30 phút sau 10 lần sai; email khôi phục 3 lần/giờ"),
        ("Bảo vệ dữ liệu khách", "Thợ chỉ thấy SĐT đã che (`098***1234`); ghi chú kỹ thuật chỉ nhân sự nội bộ xem"),
    ], [4.0, 12.0], caption="Các cơ chế bảo mật")

    R.h2("Thiết kế cơ sở dữ liệu PostgreSQL")
    R.para("Lược đồ gồm **26 bảng** (24 bảng nghiệp vụ gốc + `shift_requests`, `slot_holds` từ v1.4.0) chia thành sáu nhóm nghiệp vụ, với 38 khoá ngoại, 10 kiểu ENUM, 22 ràng buộc CHECK "
           "và 3 ràng buộc EXCLUDE. Nguyên tắc thiết kế: **mọi quy tắc toàn vẹn quan trọng đều được cài ở tầng CSDL**, "
           "không chỉ ở tầng ứng dụng, vì vậy dữ liệu vẫn đúng ngay cả khi có công cụ khác ghi thẳng vào bảng. Do đó "
           "TypeORM để `synchronize: false`; lược đồ được quản lý bằng migration có phiên bản trong "
           "`backend/src/database/migrations`. `schema.sql` là nguồn cho migration nền, không chạy lại trực tiếp "
           "mỗi lần khởi động. Migration dùng khoá để tránh hai tiến trình nâng cấp cùng lúc; bước lỗi được rollback.")
    R.figure(os.path.join(DIAGRAMS, "erd.png"), "Sơ đồ CSDL rút gọn theo nhóm nghiệp vụ (24 bảng gốc)")
    R.table(["Nhóm", "Bảng", "Vai trò"], [
        ("Tài khoản & bảo mật", "users, refresh_tokens, password_reset_tokens, audit_logs, rate_limits", "Đăng nhập, phiên, khôi phục mật khẩu, nhật ký chỉ đọc, chống spam"),
        ("Danh mục dịch vụ", "service_categories, services", "Nhóm dịch vụ, thời lượng, giá"),
        ("Thợ & lịch làm việc", "stylists, stylist_services, stylist_shifts, stylist_time_off, salon_working_hours, salon_holidays", "Hồ sơ thợ, kỹ năng, ca làm, nghỉ riêng, giờ mở cửa, ngày nghỉ của tiệm"),
        ("Lịch hẹn", "customers, appointments, appointment_services, appointment_changes, service_notes", "Hồ sơ khách theo SĐT, lịch hẹn, dịch vụ trong lịch (lưu snapshot giá), lịch sử thay đổi, ghi chú kỹ thuật"),
        ("Thanh toán & phản hồi", "invoices, invoice_items, vouchers, reviews", "Phiếu tính tiền, mã giảm giá, đánh giá sau dịch vụ"),
        ("Thông báo", "notifications, email_queue", "Chuông thông báo trong ứng dụng, hàng đợi email có thử lại"),
    ], [3.4, 6.4, 6.2], caption="Nhóm bảng trong cơ sở dữ liệu")

    R.h3("Ràng buộc toàn vẹn")
    R.table(["Ràng buộc", "Bảng", "Ý nghĩa nghiệp vụ"], [
        ("`appointments_no_overlap` – EXCLUDE USING gist", "appointments", "Một thợ không thể có hai lịch đang hiệu lực chồng lên nhau"),
        ("`stylist_shifts_no_overlap` – EXCLUDE", "stylist_shifts", "Ca làm của cùng một thợ trong một ngày không chồng lấn"),
        ("`salon_holidays_no_overlap` – EXCLUDE", "salon_holidays", "Các kỳ nghỉ của tiệm không trùng khoảng ngày"),
        ("CHECK thời lượng, giá", "services", "Thời lượng là bội số của 15 phút (15–240), giá không vượt 20.000.000 đ"),
        ("CHECK `swh_min_60m`", "salon_working_hours", "Giờ đóng cửa cách giờ mở cửa tối thiểu 60 phút"),
        ("CHECK giờ nghỉ trong ca", "stylist_shifts", "Giờ nghỉ giữa ca phải nằm trọn trong ca"),
        ("CHECK giá trị giảm", "vouchers", "Giảm theo phần trăm không vượt 100%"),
        ("UNIQUE", "users, customers, appointments, vouchers", "Email không phân biệt hoa thường; SĐT khách; mã tra cứu; mã giảm giá"),
    ], [6.2, 3.4, 6.4], caption="Một số ràng buộc toàn vẹn tiêu biểu", font_size=10.5)
    R.para("Ràng buộc chống chồng lịch được viết trên kiểu khoảng thời gian `tstzrange` với toán tử giao `&&` và chỉ áp "
           "dụng cho các trạng thái còn hiệu lực, nên lịch đã huỷ hoặc khách không đến không chiếm chỗ:", keep_next=True)
    R.code([
        "CONSTRAINT appointments_no_overlap EXCLUDE USING gist (",
        "  stylist_id WITH =,",
        "  tstzrange(start_at, end_at, '[)') WITH &&",
        ") WHERE (status IN ('pending','confirmed','arrived','in_progress'))",
    ])

    R.h3("Trigger")
    R.para("Trigger `set_updated_at` tự cập nhật cột `updated_at` trên các bảng chính. Trigger **audit_logs_readonly** "
           "biến bảng nhật ký thành *chỉ ghi thêm*: mọi lệnh UPDATE hoặc DELETE đều bị CSDL từ chối, kể cả khi thực hiện "
           "bằng tài khoản quản trị trong PgAdmin. Nhờ vậy dấu vết thao tác (ai, lúc nào, từ IP nào) không thể bị xoá "
           "để che giấu gian lận.", keep_next=True)
    R.code([
        "CREATE OR REPLACE FUNCTION audit_logs_readonly() RETURNS trigger LANGUAGE plpgsql AS $$",
        "BEGIN",
        "  RAISE EXCEPTION 'Nhật ký hoạt động chỉ đọc, không được sửa hoặc xoá';",
        "END $$;",
        "CREATE TRIGGER trg_audit_readonly BEFORE UPDATE OR DELETE ON audit_logs",
        "  FOR EACH ROW EXECUTE FUNCTION audit_logs_readonly();",
    ])
    R.para("Toàn bộ mốc thời gian lưu kiểu `TIMESTAMPTZ`; mỗi phiên kết nối đặt `timezone = Asia/Ho_Chi_Minh` để phép "
           "tính theo ngày (doanh thu hôm nay, lịch ngày) luôn đúng giờ Việt Nam.")

    R.h2("Giải thuật tính khung giờ trống 15 phút")
    R.para("Bộ tính khung giờ (`slot-calculator.ts`) được viết thành **hàm thuần**: không phụ thuộc CSDL hay múi giờ, "
           "mọi mốc thời gian là số phút tính từ 00:00 của ngày đang xét. Cách làm này giúp kiểm thử đơn vị dễ dàng "
           "(35 ca kiểm thử). Với một thợ, một ngày và tổng thời lượng D của các dịch vụ đã chọn, giải thuật gồm:",
           keep_next=True)
    R.bullets([
        "**Bước 1 – Khoảng làm việc:** giao các ca làm của thợ với giờ mở cửa của tiệm hôm đó.",
        "**Bước 2 – Trừ khoảng bận:** loại giờ nghỉ giữa ca, các lịch hẹn đang hiệu lực, ngày nghỉ của tiệm và nghỉ riêng của thợ; thu được danh sách khoảng rảnh nửa mở [start, end).",
        "**Bước 3 – Sinh ứng viên:** duyệt các mốc canh theo lưới đồng hồ 15 phút (09:00, 09:15, 09:30 …); nhận mốc t nếu [t, t + D) nằm **trọn** trong một khoảng rảnh.",
        "**Bước 4 – Lọc thời điểm:** bỏ các mốc trong quá khứ hoặc cách hiện tại dưới 60 phút (lễ tân tạo lịch vãng lai được bỏ qua ràng buộc này).",
        "**Bước 5 – Gộp theo thợ:** khi khách chọn “thợ bất kỳ”, hệ thống hợp khung giờ của mọi thợ làm được **tất cả** dịch vụ đã chọn và ưu tiên thợ có ít lịch nhất trong ngày; nếu ngày đã kín, gợi ý 2 ngày gần nhất còn chỗ.",
    ], style="List Number")
    R.para("Với n khoảng bận trong ngày, bước 2 có độ phức tạp O(n log n) do sắp xếp; bước 3 duyệt tối đa 96 mốc/ngày, "
           "nên thời gian tính cho cả tiệm 8 thợ chỉ vài mili giây.")

    R.h2("Giải thuật chống đặt trùng lịch (Overbooking)")
    R.para("Đây là rủi ro kỹ thuật lớn nhất của đề tài: hai khách cùng thấy khung 10:00 còn trống và cùng bấm “Chốt lịch” "
           "trong cùng một khoảnh khắc. Nếu chỉ kiểm tra rồi ghi (check-then-insert), cả hai yêu cầu đều thấy khung giờ "
           "trống và đều ghi thành công. Nhóm thiết kế **ba lớp bảo vệ độc lập** trong `booking.service.ts`:", keep_next=True)
    R.bullets([
        "**Lớp 1 – Giao dịch SERIALIZABLE:** mức cô lập cao nhất của PostgreSQL; nếu hai giao dịch tạo ra kết quả không tương đương với một thứ tự tuần tự, CSDL huỷ một bên với mã `40001`; dịch vụ tự thực hiện lại giao dịch, tối đa 3 lần.",
        "**Lớp 2 – Khoá dòng SELECT … FOR UPDATE** (`SELECT … FROM stylists WHERE id = $1 FOR UPDATE`): mọi yêu cầu cho cùng một thợ phải xếp hàng tại đây; bước kiểm tra lại khung giờ `isRangeFree` chạy bên trong khoá nên không thể bị chen ngang.",
        "**Lớp 3 – Ràng buộc EXCLUDE USING gist:** chốt chặn cuối cùng ở tầng CSDL, đúng cả khi có tiến trình khác bỏ qua ứng dụng và ghi thẳng vào bảng; lỗi `23P01` được ánh xạ thành HTTP 409.",
    ])
    R.figure(os.path.join(DIAGRAMS, "lock.png"), "Luồng xử lý 20 yêu cầu đặt cùng một khung giờ")
    R.code([
        "const result = await this.dataSource.transaction('SERIALIZABLE', async (manager) => {",
        "  // (2) Khoá dòng thợ: các yêu cầu cho cùng một thợ xếp hàng tại đây",
        "  await manager.query('SELECT id, is_active FROM stylists WHERE id = $1 FOR UPDATE', [stylistId]);",
        "  // Kiểm tra lại khung giờ NGAY TRONG khoá",
        "  if (!(await this.isRangeFree(manager, stylistId, startAt, endAt)))",
        "    throw new ConflictException(MSG.SLOT_TAKEN);   // 409",
        "  … ghi appointments + appointment_services …",
        "});",
    ])
    R.para("Kiểm thử E2E `booking-concurrency.e2e-spec.ts` bắn **20 yêu cầu đồng thời** vào cùng khung giờ của cùng một "
           "thợ: kết quả luôn là **đúng 1 yêu cầu thành công (201) và 19 yêu cầu nhận 409** với thông điệp “Khung giờ "
           "vừa có người đặt, vui lòng chọn khung giờ khác”. Một ca kiểm thử khác ghi thẳng vào bảng để chứng minh "
           "ràng buộc EXCLUDE chặn được cả trường hợp bỏ qua tầng ứng dụng.")


def chapter4(R: Report):
    R.h1("Cài đặt và hiện thực hệ thống")
    R.h2("Tổng quan mã nguồn")
    R.table(["Chỉ số", "Giá trị"], D.STATS, [9.0, 7.0], caption=f"Phạm vi và kiểm định hệ thống ngày {D.QUALITY_DATE}",
            align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER])
    R.para("Tài liệu API sinh tự động bằng Swagger tại địa chỉ `/api/docs` của backend; danh mục endpoint kèm vai trò "
           "được phép nằm trong `docs/API.md`.")

    R.h2("Phân hệ Khách hàng – đặt lịch trực tuyến")
    R.para("Trang chủ giới thiệu tiệm và danh mục dịch vụ theo nhóm; chỉ dịch vụ đã có ít nhất một thợ làm được mới "
           "hiển thị. Ô tìm kiếm hỗ trợ **gõ không dấu** (nhờ hàm `f_unaccent` và chỉ mục trigram trong CSDL).")
    R.figure(os.path.join(SCREENS, "01_home.jpg"), "Trang chủ công khai theo phong cách Fresha")
    R.para("Luồng đặt lịch gồm **4 bước**: (1) chọn tối đa 5 dịch vụ – thanh dưới cùng cộng dồn thời lượng và tiền tạm "
           "tính; (2) chọn khung giờ – chỉ hiện những mốc có thợ rảnh liên tục đủ tổng thời lượng; (3) chọn đích danh thợ "
           "hoặc “thợ bất kỳ”; (4) nhập họ tên, SĐT (kiểm tra đúng 10 chữ số) rồi chốt lịch. Khách nhận **mã tra cứu 8 ký tự** "
           "và email xác nhận trong vòng 2 phút.")
    R.figure(os.path.join(SCREENS, "02_booking_step1.jpg"), "Bước 1 – chọn dịch vụ, tự cộng thời lượng và tiền tạm tính")
    R.side_by_side([(os.path.join(SCREENS, "03_booking_mobile.jpg"), 5.0), (os.path.join(SCREENS, "20_lookup.jpg"), 10.2)])
    R.caption("Hình", "Giao diện đặt lịch trên điện thoại (trái) và trang tra cứu lịch hẹn (phải)")
    R.para("Trang **Tra cứu** cho phép khách tìm lịch bằng mã hoặc SĐT, tự huỷ khi còn ít nhất 120 phút; sau 10 lần tra "
           "sai trong một giờ, IP bị chặn 30 phút. Sau khi dịch vụ hoàn tất, khách nhận liên kết **đánh giá 1–5 sao** dùng "
           "một lần, hiệu lực 7 ngày.")

    R.h2("Phân hệ Lễ tân – điều phối trong ngày")
    R.h3("Lịch ngày dạng timeline 15 phút")
    R.para("Màn hình trung tâm của lễ tân: mỗi thợ là một cột, trục dọc chia 15 phút, vạch đỏ đánh dấu giờ hiện tại, vùng "
           "ngoài ca được tô sọc. Mỗi lịch hẹn là một khối màu theo trạng thái; bấm vào để mở ngăn chi tiết với các thao tác "
           "xác nhận, check-in, đổi thợ / dời giờ, đánh dấu không đến.")
    R.figure(os.path.join(SCREENS, "05_timeline.jpg"), "Lịch hẹn trong ngày dạng cột theo thợ")
    R.h3("Chờ xác nhận, khách vãng lai và check-in")
    R.bullets([
        "**Chờ xác nhận:** danh sách lịch đặt online; từ chối bắt buộc chọn lý do; lịch chờ quá 12 giờ được đánh dấu quá hạn.",
        "**Khách vãng lai:** gõ SĐT là tự điền tên và hiện các lượt gần nhất; lịch tại quầy vào thẳng trạng thái *Đã xác nhận*, bỏ qua ràng buộc đặt trước 60 phút. SĐT mới luôn khởi tạo 0 lượt đến.",
        "**Check-in** trong cửa sổ ±60 phút quanh giờ hẹn, đánh dấu *đến muộn* nếu trễ hơn 15 phút và gửi thông báo cho thợ.",
        "**Đánh dấu không đến** sau 30 phút, cộng vào hồ sơ khách, cho phép hoàn tác trong 15 phút.",
    ])
    R.figure(os.path.join(SCREENS, "07_walkin.jpg"), "Tạo lịch cho khách vãng lai tại quầy")
    R.h3("Chuyển lịch hàng loạt (Bulk Reassign)")
    R.para("Khi một thợ nghỉ đột xuất, lễ tân chọn thợ và ngày; hệ thống lập danh sách lịch bị ảnh hưởng, **gợi ý thợ thay "
           "thế đủ kỹ năng và còn trống**, hoặc phương án dời giờ. Mỗi lịch được xử lý độc lập – một lịch lỗi không làm "
           "hỏng cả lô; lịch sử thay đổi ghi vào `appointment_changes` và khách nhận email thông báo.")
    R.figure(os.path.join(SCREENS, "08_bulk.jpg"), "Chuyển lịch hàng loạt khi thợ nghỉ đột xuất")
    R.h3("Phiếu tính tiền và hồ sơ khách")
    R.para("Phiếu tự nạp dịch vụ kèm **đơn giá tại thời điểm hẹn** (snapshot), cho phép thêm dịch vụ phát sinh, áp dụng "
           "**một** mã giảm giá (phần trăm hoặc số tiền) và lưu đủ ba con số: tạm tính, giảm giá, thành tiền. Thanh toán "
           "chuyển khoản bắt buộc ghi chú đối soát; phiếu đã đóng bị khoá, chỉ sửa bằng phiếu điều chỉnh – đây là cơ chế "
           "chính để chống gian lận doanh thu. Hồ sơ khách gộp theo SĐT, hiển thị 10 lượt gần nhất và ghi chú kỹ thuật.")
    R.figure(os.path.join(SCREENS, "09_invoices.jpg"), "Danh sách phiếu tính tiền")

    R.h2("Phân hệ Thợ – lịch cá nhân và bảo mật thông tin khách")
    R.para("Thợ chỉ thấy lịch của chính mình trong ngày, bấm **Bắt đầu** / **Hoàn tất** cho từng lượt; hệ thống cảnh báo "
           "khi lượt làm vượt thời lượng dự kiến quá 20 phút. Số điện thoại khách **luôn được che** (ví dụ `098***1234`) "
           "bằng hàm `maskPhone` ở backend, nên dữ liệu gốc không bao giờ được gửi xuống trình duyệt của thợ. Thợ ghi "
           "chú kỹ thuật (tối đa 500 ký tự: sản phẩm đã dùng, thời gian ủ…) để lần sau phục vụ khách tốt hơn.")
    R.figure(os.path.join(SCREENS, "11_stylist.jpg"), "Lịch làm việc cá nhân của thợ")

    R.h2("Phân hệ Chủ tiệm – báo cáo và cấu hình")
    R.bullets([
        "**Tổng quan hôm nay:** doanh thu đã thu, số thợ theo ca, lịch hẹn theo 7 trạng thái; tự làm mới mỗi 60 giây; bấm vào trạng thái để mở danh sách.",
        "**Doanh thu:** theo ngày, theo thợ và theo dịch vụ trong khoảng tối đa 365 ngày; **xuất CSV UTF-8 có BOM** để Excel trên Windows hiển thị đúng tiếng Việt.",
        "**Phân bố khung giờ & no-show:** tỉ lệ không đến / huỷ (một chữ số thập phân), biểu đồ so sánh ngày thường và cuối tuần.",
        "**Cấu hình:** dịch vụ và bảng giá (dịch vụ đã có lịch hẹn chỉ được chuyển *Ngừng kinh doanh*, không xoá cứng), hồ sơ thợ, bảng ca làm theo tuần (sao chép sang tuần sau), giờ mở cửa, ngày nghỉ, mã giảm giá.",
    ])
    R.figure(os.path.join(SCREENS, "13_revenue.jpg"), "Báo cáo doanh thu theo ngày, theo thợ và theo dịch vụ")
    R.figure(os.path.join(SCREENS, "16_shifts.jpg"), "Bảng ca làm theo tuần của các thợ")

    R.h2("Phân hệ Quản trị hệ thống")
    R.bullets([
        "**Tài khoản nhân sự:** tạo tài khoản sinh **mật khẩu tạm ngẫu nhiên** hiển thị trong hộp thoại có nút *Sao chép mật khẩu* và gửi qua email; lần đăng nhập đầu bắt buộc đổi mật khẩu; không cho ngưng hoạt động quản trị viên cuối cùng.",
        "**Nhật ký hoạt động:** lọc theo ngày, tài khoản, hành động; 50 dòng/trang; ghi người thực hiện, thời điểm, IP; không thể sửa hoặc xoá (trigger chỉ đọc).",
        "**Bảng phân quyền:** ma trận lấy thẳng từ máy chủ – cùng một nguồn với guard chặn API, nên giao diện và thực thi luôn khớp nhau.",
    ])
    R.figure(os.path.join(SCREENS, "18_audit.jpg"), "Nhật ký hoạt động chỉ đọc")
    R.figure(os.path.join(SCREENS, "19_rbac.jpg"), "Phân quyền bốn vai trò nhân sự và khách công khai")

    R.h2("Hạ tầng tự động một chạm")
    R.para("Mục tiêu: sao chép dự án sang **bất kỳ máy Windows, macOS hay Linux** nào, chỉ cần bật Docker Desktop và nhấp "
           "đúp `HoYoSalon.bat` rồi bấm **BẮT ĐẦU** (hoặc `npm run launcher`) là toàn bộ hệ thống hoạt động, không cần cấu hình tay.")
    R.figure(os.path.join(DIAGRAMS, "launcher.png"), "Luồng khởi động một chạm và bộ giám sát tự phục hồi")
    R.h3("Docker Compose và dữ liệu mẫu an toàn")
    R.bullets([
        "`deploy/docker/docker-compose.yml` dựng PostgreSQL 15, PgAdmin và Maildev (chạy với `--project-directory` gốc dự án để giữ nguyên tên volume dữ liệu). Healthcheck kiểm tra qua **TCP** (`pg_isready -h 127.0.0.1`) chứ không qua Unix socket, tránh báo “sẵn sàng” quá sớm khi container còn chạy script khởi tạo.",
        "`run-seed.ts` áp dụng migration còn thiếu rồi nạp `seed.sql` cho môi trường phát triển / QA; không dùng seed cho máy vận hành thật.",
        "`seed.sql` chạy lại an toàn (**idempotent**): `ON CONFLICT DO NOTHING` cho mọi khoá duy nhất; bỏ qua khung giờ mẫu đã trùng lịch thật; đưa 8 tài khoản mẫu về đúng mật khẩu và mở khoá mỗi lần chạy.",
        "Endpoint `/health` trả **200** khi API truy vấn được CSDL và **503** khi chưa, làm căn cứ để launcher quyết định mở trình duyệt.",
    ])
    R.h3("Real-time SSE và cập nhật một chạm")
    R.para("Backend phát sự kiện Server-Sent Events (SSE) sau khi giao dịch ghi dữ liệu thành công. "
           "Frontend nhận sự kiện để tải lại lịch và dữ liệu liên quan; kiểm tra quyền vẫn thực hiện ở API. "
           "Kết nối có cơ chế nối lại và làm mới dữ liệu để đồng bộ khi chuyển mạng.")
    R.para("Máy vận hành chọn chế độ *Máy chủ cửa hàng* trong Launcher để chạy migration và bootstrap, không nạp dữ liệu mẫu. "
           "Nút **CẬP NHẬT** (lõi `scripts/launcher.mjs update`) cập nhật một chạm: lấy mã bằng fast-forward, cài gói, build bản mới, dừng bản cũ, "
           "sao lưu trước migration, khởi động lại và kiểm tra sức khoẻ. Nếu cập nhật lỗi, launcher bật lại bản build cũ; "
           "migration đang lỗi được rollback, migration đã hoàn tất vẫn phải tương thích với bản cũ. "
           "GitHub Actions đã có cổng kiểm tra; triển khai vẫn do người vận hành chủ động khởi chạy.")
    R.h3("Bộ giám sát Supervisor tự phục hồi (v1.2.5)")
    R.para("Trên Windows, tiến trình Vite đôi khi kết thúc với mã **3221226505** (`0xC0000409`) – Node.js tự huỷ ở tầng "
           "native, không bắt được bằng JavaScript. Khi chạy qua `concurrently`, dịch vụ chết chỉ được báo mã lỗi rồi bỏ "
           "mặc. Phiên bản v1.2.5 thay bằng bộ giám sát `scripts/launcher.mjs run`:", keep_next=True)
    R.bullets([
        "Chạy thẳng `node nest.js` và `node vite.js`, bỏ chuỗi trung gian cmd → npm → npm → cmd.",
        "Chờ `/health = 200` và Vite phản hồi rồi mới mở trình duyệt – trình duyệt không bao giờ mở khi API chưa sẵn sàng.",
        "Dịch vụ sập được giải mã lỗi và **tự khởi động lại** sau 2, 4, 6… giây (tối đa 5 lần trong 10 phút).",
        "Ctrl+C hoặc đóng cửa sổ dừng **cả cây tiến trình** (`taskkill /T` trên Windows, nhóm tiến trình trên macOS/Linux), giải phóng cổng 3000 và 5173.",
    ])
    R.h3("HoYoSalon Launcher (v1.4.0)")
    R.para("Từ v1.4.0, mọi thao tác vận hành gom về **một cửa sổ Launcher** theo phong cách game launcher (nền tối kính mờ): "
           "nút lớn **BẮT ĐẦU** chạy toàn bộ hệ thống và tự mở ứng dụng khi `/health` = 200; khi GitHub có thẻ phiên bản "
           "mới, nút đổi thành **CẬP NHẬT vX.Y.Z** với thanh tiến trình theo từng bước. Giao diện chỉ là lớp vỏ: máy chủ "
           "cục bộ `scripts/hoyo/launcher-ui.mjs` (chỉ nghe 127.0.0.1, mã phiên ngẫu nhiên chống CSRF) gọi đúng lõi "
           "`scripts/launcher.mjs` nên mọi cơ chế an toàn cũ (sao lưu trước migration, tự quay về bản cũ) được giữ nguyên.")
    R.figure(os.path.join(SCREENS, "22_launcher.jpg"), "Màn hình chính HoYoSalon Launcher – hệ thống đang chạy", width_cm=14.5)
    R.bullets([
        "**Thông tin phiên bản**: mã phiên bản, commit, nhánh, trạng thái kết nối kho mã, nút *Kiểm tra phiên bản mới nhất*.",
        "**Nhật ký cập nhật**: đọc `CHANGELOG.md` theo từng phiên bản.",
        "**Log Client / Server / CSDL**: xem trực tiếp nhật ký giao diện Vite, API NestJS, PostgreSQL, tiến trình cập nhật.",
        "**Xuất `system_logs.zip`**: gói nhật ký, cấu hình `.env` đã ẩn mật khẩu/khoá, thông tin Git và Docker để gửi hỗ trợ.",
        "**Sao chép thông tin thiết bị**: hệ điều hành, CPU/RAM, Node.js, npm, Git, Docker, trạng thái 5 cổng dịch vụ.",
    ])
    R.side_by_side([(os.path.join(SCREENS, "23_launcher_logs.jpg"), 7.6), (os.path.join(SCREENS, "24_launcher_device.jpg"), 7.6)])
    R.caption("Hình", "Bảng Thông tin & Chẩn đoán: log Client/Server và chẩn đoán thiết bị")

    R.table(["Ngày", "Phiên bản", "Nội dung chính"], D.RELEASES, [2.6, 2.8, 10.6],
            caption="Lịch sử phát hành trên nhánh main",
            align=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT])
    R.h3("Tài khoản mẫu")
    R.table(["Vai trò", "Email", "Mật khẩu"], D.DEMO_ACCOUNTS, [4.2, 7.3, 4.5],
            caption="Tài khoản mẫu sau khi nạp dữ liệu",
            align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER])
    R.para("Trang đăng nhập có khối **Đăng nhập nhanh**: bấm một vai trò là điền đúng email + mật khẩu ở bảng trên, đăng "
           "nhập và chuyển thẳng tới trang đích của vai trò đó (Quản trị → Tài khoản nhân sự; Chủ tiệm → Tổng quan; "
           "Lễ tân → Lịch ngày; Thợ → Lịch của tôi).")

    R.h2("Cải tiến theo góp ý Mentor Sprint 2 (v1.4.0)")
    R.para("Buổi review Sprint 2 ngày 06/10/2026, Mentor đưa ra 11 góp ý. Mỗi góp ý được làm trên một nhánh riêng theo mô hình "
           "nhánh mới, có kiểm thử tự động và hợp nhất `--no-ff` vào `develop` trước khi phát hành v1.4.0 lên `main`.", keep_next=True)
    R.table(["#", "Góp ý", "Cách xử lý", "Nhánh"], D.MENTOR_ITEMS, [0.8, 3.6, 7.6, 4.0],
            caption="Tổng hợp xử lý 11 góp ý của Mentor",
            align=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT])
    R.h3("Thợ tự đăng ký ca, quản lý duyệt và cảnh báo khung giờ thiếu thợ")
    R.para("Thợ đăng ký lịch rảnh cả tuần (ca làm theo giờ 24 giờ hoặc xin nghỉ); yêu cầu hiện thành viên viền đứt trên Bảng ca. "
           "Quản lý duyệt (có thể chỉnh giờ), từ chối kèm lý do hoặc duyệt tất cả. Việc duyệt *giữ chỗ* yêu cầu bằng một câu "
           "UPDATE có điều kiện nên hai quản lý bấm cùng lúc chỉ một người thắng, sau đó tạo ca qua đúng các luật cũ của bảng ca. "
           "Hộp **Độ phủ ca** đếm số thợ có mặt ở từng ô 15 phút giờ mở cửa (trừ nghỉ giữa ca, nghỉ phép), tô đỏ khoảng trống "
           "và gợi ý thợ rảnh có ít giờ làm nhất tuần để cân bằng phân bổ; khoảng trống do mọi thợ nghỉ trưa cùng lúc được "
           "gợi ý so le giờ nghỉ.")
    R.figure(os.path.join(SCREENS, "25_shift_board.jpg"), "Bảng ca mới: yêu cầu chờ duyệt, độ phủ ca và lưới thợ × ngày", width_cm=15.5)
    R.figure(os.path.join(SCREENS, "26_shift_registration.jpg"), "Thợ tự đăng ký lịch làm cả tuần", width_cm=14.5)
    R.h3("Trợ lý AI xếp lịch và AI sinh ngày lễ")
    R.para("Trợ lý xếp lịch nằm ngay trong màn hình tạo lịch của lễ tân: duyệt mọi khung giờ hợp lệ của mọi thợ trong 1/3/7 ngày "
           "(qua bộ tính khung giờ nên tôn trọng ca, nghỉ, ngày lễ, lịch hẹn và chỗ đang giữ), chấm điểm theo ba tiêu chí "
           "*sớm*, *vừa khít* (không để khoảng lẻ dưới 30 phút) và *cân bằng thợ*, kèm lý do bằng tiếng Việt. Trợ lý ngày lễ "
           "tính Tết Nguyên Đán và Giỗ Tổ Hùng Vương bằng thuật toán âm lịch thiên văn múi giờ +7 (đã kiểm thử Tết 1985–2028), "
           "cộng các ngày lễ dương lịch theo Bộ luật Lao động và Ngày Văn hoá Việt Nam 24/11; ngày đang có lịch hẹn của khách "
           "được bỏ chọn sẵn. Cả hai là trợ lý dựa trên thuật toán: kết quả tất định, giải thích được, chạy ngoại tuyến.")
    R.side_by_side([(os.path.join(SCREENS, "27_ai_slot_assistant.jpg"), 7.6), (os.path.join(SCREENS, "28_ai_holidays.jpg"), 7.6)])
    R.caption("Hình", "Trợ lý AI xếp lịch tại quầy và trợ lý sinh ngày lễ cả năm")
    R.h3("Giữ chỗ 10 phút, email xác nhận và trang công khai")
    R.para("Khi khách tới bước Xác nhận, hệ thống giữ khung giờ 10 phút (cấu hình 5–15) trong giao dịch có khoá dòng thợ; khung "
           "đang giữ biến mất với khách khác và bị chặn ở mọi luồng đặt lịch, tạo lịch tại quầy và dời lịch. Kiểm thử 10 khách "
           "giữ cùng một khung trong một lúc cho đúng 1 người thành công. Email xác nhận gửi ngay sau khi đặt, có trạng thái, chỉ "
           "đường, hotline và liên kết thêm vào Google Calendar; khách chưa nhập email vẫn gửi được từ màn hình thành công. "
           "Trang chủ dùng lưới 4 cột liền mạch hiển thị 2 hàng, chân trang nền tối đủ Facebook, Zalo, địa chỉ, giờ mở cửa và "
           "đội ngũ chuyên viên.")
    R.side_by_side([(os.path.join(SCREENS, "29_slot_hold.jpg"), 7.6), (os.path.join(SCREENS, "30_home_footer.jpg"), 7.6)])
    R.caption("Hình", "Đồng hồ giữ chỗ ở bước Xác nhận và trang chủ với chân trang mới")

    R.h2("Triển khai hạ tầng đám mây 24/7 (v2.2.1)")
    R.para("Để phục vụ nghiệm thu thực tế và người dùng truy cập mọi lúc mọi nơi mà không cần duy trì máy chủ cục bộ, "
           "hệ thống đã được thiết lập kiến trúc triển khai đám mây hoàn chỉnh 24/7, kết hợp các thành phần dịch vụ hiện đại:")
    R.bullets([
        "**Cloudflare Pages (Giao diện Frontend)**: Triển khai bản dựng tĩnh React 18 + Vite lên mạng lưới CDN toàn cầu tại "
        "địa chỉ `https://huongsen-salon.pages.dev`, tối ưu tốc độ tải trang dưới 1 giây, tự động kích hoạt triển khai khi đẩy mã nguồn.",
        "**Render Web Service (Máy chủ Backend API)**: Vận hành NestJS 10 REST API tại `https://salon-spa-api-93d7.onrender.com`, "
        "kết nối cơ sở dữ liệu qua biến môi trường an toàn, cung cấp đầy đủ các cổng dịch vụ nghiệp vụ, xác thực JWT và kiểm tra sức khoẻ (/health/live).",
        "**Supabase Database (PostgreSQL 17.11)**: Cơ sở dữ liệu đám mây tại vùng Sydney (ap-southeast-2), quản trị 32 bảng, "
        "sử dụng Session Pooler bảo đảm khả năng chịu tải kết nối ổn định.",
        "**Cloudflare Worker Keepalive (Bộ duy trì trực tuyến)**: Vận hành kịch bản cron định kỳ 10 phút/lần gọi tự động vào "
        "endpoint kiểm tra sức khoẻ của Render, loại bỏ hoàn toàn độ trễ khởi động nguội (cold start), đảm bảo hệ thống phản hồi tức thì 24/7.",
        "**Tích hợp MCP Servers (Model Context Protocol)**: Thiết lập cấu hình Render MCP và Cloudflare MCP cho phép trợ lý "
        "giám sát, kiểm tra tài nguyên và nhật ký hệ thống trực tiếp từ môi trường IDE.",
    ])


def chapter5(R: Report):
    R.h1("Kiểm thử, đánh giá và kết luận")
    R.h2("Chiến lược kiểm thử")
    R.table(["Mức kiểm thử", "Công cụ", "Phạm vi"], [
        ("Kiểm tra tĩnh", "TypeScript (tsc), ESLint `--max-warnings 0`", "Toàn bộ backend và frontend; build thất bại nếu có lỗi kiểu hoặc cảnh báo lint"),
        ("Đơn vị", "Jest, node:test", "Bộ tính khung giờ, âm lịch & ngày lễ, độ phủ ca, trợ lý xếp lịch, DTO; thư viện Launcher (semver, CHANGELOG, ZIP, ẩn bí mật)"),
        ("Tích hợp / E2E", "Jest + Supertest trên PostgreSQL thật", "Phân quyền 17 endpoint × 4 vai trò, khoá 15 phút; 20 yêu cầu đồng thời; vòng đời lịch hẹn đầy đủ"),
        ("Giao diện tự động", "Playwright (Chromium)", "Đăng nhập nhanh 4 vai trò → đúng trang đích; chụp ảnh các màn hình chính"),
        ("Nghiệm thu thủ công", "docs/DEMO-SCRIPT.md", "5 phần A–E theo Sprint, mỗi bước ghi rõ tài khoản và điều cần chỉ ra"),
    ], [3.2, 5.0, 7.8], caption="Các mức kiểm thử")

    R.h2("Kết quả kiểm thử")
    R.table(["Hạng mục", "Kết quả", "Ghi chú"], [
        ("Kiểm thử đơn vị", f"**{D.UNIT_TESTS} / {D.UNIT_TESTS} đạt**", "11 bộ: khung giờ, âm lịch & ngày lễ, độ phủ ca, trợ lý xếp lịch, sự kiện, bảo mật"),
        ("Kiểm thử E2E", f"**{D.E2E_TESTS} / {D.E2E_TESTS} đạt**", f"{D.E2E_SUITES} bộ trên PostgreSQL; RBAC, đồng thời, migration, SSE và hồi quy QA"),
        ("Kiểm thử Demo + Launcher", f"**{D.DEMO_TESTS + D.LAUNCHER_TESTS} / {D.DEMO_TESTS + D.LAUNCHER_TESTS} đạt**", "frontend/test, scripts/lib/test (node --test)"),
        ("Giữ chỗ đồng thời", "1 thành công / 9 nhận 409", "10 khách giữ cùng một khung giờ, cùng thợ trong một lúc"),
        ("Chống đặt trùng", "1 thành công / 19 nhận 409", "20 yêu cầu đồng thời vào cùng khung giờ, cùng thợ"),
        ("Build frontend / typecheck backend", "0 lỗi", "`tsc -b && vite build`; `tsc --noEmit`"),
        ("npm run lint (backend, frontend)", "0 cảnh báo", "`--max-warnings 0`"),
    ], [5.4, 4.6, 6.0], caption="Tổng hợp kết quả kiểm thử")
    R.para(f"Snapshot kiểm định ngày {D.QUALITY_DATE}. E2E tự tạo và xoá CSDL riêng có hậu tố `_test`, "
           "từ chối kết nối CSDL vận hành. Không cần reset hoặc seed lại dữ liệu thật để chạy test. "
           "Ca 20 yêu cầu đồng thời tìm ngày có khung giờ thực sự khả dụng, tránh phụ thuộc ngày nghỉ tuần của ca mẫu.")
    R.para("Kịch bản vòng đời chọn dịch vụ seed cố định và ca mẫu còn trống; đồng hồ tạo Date được cố định "
           "trong giai đoạn check-in / bắt đầu / hoàn tất, trong khi JWT và timer mạng dùng thời gian thật. "
           "Test chạy trọn đến thanh toán, đóng phiếu, đánh giá và đối chiếu doanh thu; không trả về sớm "
           "khi chạy ngoài giờ mở cửa. AC về bố cục di động, thao tác UI và thời hạn email vẫn cần tester "
           "ghi Pass/Fail theo DEMO-SCRIPT trước khi nghiệm thu.")

    R.h2("Kết quả đối chiếu User Story")
    R.table(["Epic", "Story", "Point", "Trạng thái"],
            [(f"{e[0]} {e[1]}", e[2], e[3], "Đã đối chiếu") for e in D.EPICS] + [("**Tổng**", "**39**", "**165**", "**39 / 39**")],
            [9.0, 2.0, 2.0, 3.0], caption="Kết quả đối chiếu theo Epic",
            align=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER])
    R.para("Bảng đối chiếu `docs/BACKLOG-MAPPING.md` chỉ rõ tệp cài đặt backend và màn hình frontend cho từng story, được "
           "dùng làm căn cứ khi PO nghiệm thu và khi cập nhật trạng thái ticket trên Jira. "
           "Đối chiếu mã nguồn và test tự động không thay thế biên bản nghiệm thu thủ công của PO. "
           "Các mốc khắc phục lỗi đã ghi nhận:", keep_next=True)
    R.bullets([
        "Sprint 2 Review với Mentor (06/10): **11 góp ý** về quy trình nhánh, bảng ca, giờ 24h, trợ lý AI, đăng ký ca, giữ chỗ, email, chân trang và mật độ hiển thị → **v1.4.0**.",
        "Sprint 1 Review: **15 lỗi** kiểm thử về xác thực, đồng bộ hồ sơ thợ và logic hệ thống (26/09) và **8 lỗi** vòng hai – ảnh giao diện, tài khoản mẫu không khớp, mật khẩu tạm cho nhân sự mới, khách vãng lai, chặn xoá dịch vụ đã có lịch, nút Quay lại (27/09) → **v1.2.0**.",
        "Rà soát với máy chủ thật: 6 lỗi tích hợp (phân trang TypeORM, giới hạn 200 dòng, lệch múi giờ…) → **v1.2.1**.",
        "Gia cố khởi động trên nhiều máy và bộ giám sát tự phục hồi → **v1.2.3 – v1.2.5**.",
    ])

    R.h2("Đánh giá")
    R.h3("Ưu điểm")
    R.bullets([
        "Đối chiếu đủ phạm vi Product Backlog: 39 story / 165 point trong 4 Sprint.",
        "Tính đúng đắn dữ liệu được bảo vệ ở tầng CSDL (EXCLUDE, CHECK, trigger chỉ đọc), không phụ thuộc hoàn toàn vào ứng dụng.",
        "Chống đặt trùng đã được chứng minh bằng kiểm thử đồng thời tự động.",
        "Giao diện hiện đại, nhất quán, dùng tốt trên điện thoại 360 px; thông điệp lỗi tiếng Việt rõ ràng.",
        "Triển khai một chạm qua HoYoSalon Launcher: khởi động, cập nhật có sao lưu và tự quay về bản cũ, chẩn đoán tại chỗ.",
        "Xử lý trọn 11 góp ý Mentor Sprint 2 với kiểm thử tự động cho từng mục.",
    ])
    R.h3("Hạn chế")
    R.bullets([
        "Chưa tích hợp thanh toán trực tuyến (VNPay, MoMo) và gửi SMS/Zalo nhắc lịch; email mới kiểm thử qua Maildev.",
        "Chỉ phục vụ một chi nhánh; chưa quản lý kho mỹ phẩm và hoa hồng thợ tự động.",
        "Kiểm thử E2E cần PostgreSQL đang chạy và tài khoản có quyền tạo CSDL kiểm thử riêng.",
        "Chưa có quy trình CI/CD tự động triển khai lên máy chủ thật.",
        "Trợ lý AI dùng thuật toán chấm điểm, chưa dùng mô hình ngôn ngữ để trò chuyện / giải thích tự do.",
    ])

    R.h2("Hướng phát triển")
    R.bullets([
        "Tích hợp cổng thanh toán và đặt cọc giữ chỗ để giảm tỉ lệ khách không đến.",
        "Nhắc lịch qua Zalo OA / SMS; chương trình khách hàng thân thiết và tích điểm.",
        "Mở rộng đa chi nhánh, báo cáo hợp nhất; quản lý kho và tính hoa hồng thợ.",
        "Ứng dụng di động cho thợ (thông báo đẩy khi có lịch mới hoặc khách check-in).",
        "Mở rộng GitHub Actions từ kiểm tra chất lượng sang triển khai có kiểm soát, sao lưu và kiểm tra sức khoẻ.",
    ])

    R.h2("Kết luận")
    R.para("Qua bốn Sprint, Nhóm 3 đã xây dựng hoàn chỉnh **Hệ thống Đặt lịch và Quản lý Vận hành Salon - Spa** đáp ứng "
           "phạm vi 39 user story trong đề tài gốc. Hệ thống giải quyết trực tiếp những vấn đề của cách quản lý thủ "
           "công: khách tự đặt lịch 24/7 theo đúng khung giờ thợ rảnh, không còn chồng lịch nhờ ba lớp bảo vệ đồng thời, "
           "lễ tân điều phối trực quan, doanh thu minh bạch và có nhật ký không thể xoá.")
    R.para("Về quy trình, nhóm đã vận dụng Scrum một cách thực chất: Product Backlog có tiêu chí chấp nhận rõ ràng, mỗi "
           "Sprint kết thúc bằng Increment chạy được, phản hồi của PO được xử lý và phát hành thành phiên bản có tag theo "
           "Git Flow. Đây là nền tảng tốt để nhóm tiếp tục phát triển các tính năng mở rộng trong tương lai.")

    R.h1_plain("Tài liệu tham khảo")
    refs = [
        "Chính phủ, Nghị định số 30/2020/NĐ-CP ngày 05/03/2020, Phụ lục I – thể thức và kỹ thuật trình bày văn bản hành chính, https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-30-2020-nd-cp-30858.htm",
        "K. Schwaber, J. Sutherland, *The Scrum Guide – The Definitive Guide to Scrum: The Rules of the Game*, 2020.",
        "NestJS, *Documentation – Guards, Interceptors, Exception filters*, https://docs.nestjs.com",
        "TypeORM, *Documentation – Transactions, Entities*, https://typeorm.io",
        "The PostgreSQL Global Development Group, *PostgreSQL 15 Documentation – Range Types, Exclusion Constraints, Transaction Isolation*, https://www.postgresql.org/docs/15/",
        "Meta Open Source, *React Documentation*, https://react.dev",
        "Vite, *Guide – Server Options (proxy)*, https://vitejs.dev",
        "Tailwind Labs, *Tailwind CSS Documentation v3.4*, https://tailwindcss.com/docs",
        "Docker Inc., *Docker Compose – Healthcheck and depends_on*, https://docs.docker.com/compose/",
        f"Nhóm 3 – {D.CLASS_CODE}, *Mã nguồn và tài liệu dự án*, {D.REPO_URL}",
    ]
    for i, r in enumerate(refs, 1):
        p = R.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.left_indent = Cm(0.9)
        p.paragraph_format.first_line_indent = Cm(-0.9)
        R._rich(p, f"[{i}]\t" + r.replace("*", ""))


def main():
    R = Report()
    cover(R)
    front_matter(R)
    chapter1(R)
    chapter2(R)
    chapter3(R)
    chapter4(R)
    chapter5(R)
    R.save()
    try:
        print("Đã tạo:", OUT)
    except Exception:
        print("[OK] Da tao thanh cong:", OUT)


if __name__ == "__main__":
    main()
