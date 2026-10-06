# -*- coding: utf-8 -*-
"""
Sinh slide thuyết trình (.pptx) cho dự án Hệ thống Đặt lịch Salon - Spa.

    pip install python-pptx pillow
    python docs/tools/build_slides_pptx.py

Kết quả: docs/presentations/Slide_Bao_Cao_He_Thong_Dat_Lich_Salon_Spa.pptx (15 slide, 16:9)
Tông màu Fresha Light Luxury: Teal #0D9488 · Slate #0F172A · nền #F8FAFC, thẻ bo góc.
Mỗi slide có ghi chú thuyết trình (Speaker Notes).
"""
import os
import sys

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import report_data as D  # noqa: E402

A = os.path.join(DOCS, "assets")
SCREEN = lambda n: os.path.join(A, "screens", n)  # noqa: E731
DIAG = lambda n: os.path.join(A, "diagrams", n)  # noqa: E731
ICON = lambda n, c="w": os.path.join(A, "icons", f"{n}_{c}.png")  # noqa: E731
OUT = os.path.join(DOCS, "presentations", "Slide_Bao_Cao_He_Thong_Dat_Lich_Salon_Spa.pptx")

TEAL = "0D9488"
TEAL_DARK = "0F766E"
TEAL_TINT = "CCFBF1"
TEAL_BG = "F0FDFA"
SLATE = "0F172A"
SLATE_2 = "1E293B"
MUTED = "475569"
MUTED_2 = "94A3B8"
LINE = "E2E8F0"
BG = "F8FAFC"
WHITE = "FFFFFF"
ROSE = "E11D48"
FONT = "Calibri"

W, H = Inches(13.333), Inches(7.5)
M = Inches(0.6)
TOTAL = 13


def rgb(h):
    return RGBColor.from_string(h)


# ============================================================================ primitives


def set_bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb(color)


def soft_shadow(shape, blur=12, dist=3, alpha=14):
    sppr = shape._element.spPr
    eff = etree.SubElement(sppr, qn("a:effectLst"))
    sh = etree.SubElement(eff, qn("a:outerShdw"), blurRad=str(Pt(blur)), dist=str(Pt(dist)), dir="5400000",
                          algn="t", rotWithShape="0")
    clr = etree.SubElement(sh, qn("a:srgbClr"), val=SLATE)
    etree.SubElement(clr, qn("a:alpha"), val=str(alpha * 1000))


def round_rect(slide, x, y, w, h, fill=WHITE, line=None, radius=0.08, shadow=True):
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    s.adjustments[0] = radius
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(fill)
    if line:
        s.line.color.rgb = rgb(line)
        s.line.width = Pt(1)
    else:
        s.line.fill.background()
    if shadow:
        soft_shadow(s)
    s.text_frame.text = ""
    return s


def text(slide, x, y, w, h, paras, size=16, color=SLATE, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, font=FONT, spacing_after=4, line_spacing=1.08):
    """paras: str | list[str | list[(text, {opts})]]"""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    if isinstance(paras, str):
        paras = [paras]
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(spacing_after)
        p.line_spacing = line_spacing
        runs = para if isinstance(para, list) else [(para, {})]
        for t, o in runs:
            r = p.add_run()
            r.text = t
            f = r.font
            f.name = o.get("font", font)
            f.size = Pt(o.get("size", size))
            f.bold = o.get("bold", bold)
            f.italic = o.get("italic", False)
            f.color.rgb = rgb(o.get("color", color))
    return tb


def bullets(slide, x, y, w, h, items, size=16, color=SLATE, bullet_color=TEAL, gap=8):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        p.line_spacing = 1.05
        ppr = p._p.get_or_add_pPr()
        ppr.set("marL", str(Inches(0.28)))
        ppr.set("indent", str(-Inches(0.28)))
        bu_clr = etree.SubElement(ppr, qn("a:buClr"))
        etree.SubElement(bu_clr, qn("a:srgbClr"), val=bullet_color)
        etree.SubElement(ppr, qn("a:buFont"), typeface="Arial")
        etree.SubElement(ppr, qn("a:buChar"), char="•")
        runs = it if isinstance(it, list) else [(it, {})]
        for t, o in runs:
            r = p.add_run()
            r.text = t
            r.font.name = FONT
            r.font.size = Pt(o.get("size", size))
            r.font.bold = o.get("bold", False)
            r.font.color.rgb = rgb(o.get("color", color))
    return tb


def icon_circle(slide, name, x, y, d=Inches(0.62), fill=TEAL, variant="w"):
    c = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, y, d, d)
    c.fill.solid()
    c.fill.fore_color.rgb = rgb(fill)
    c.line.fill.background()
    pad = int(d * 0.24)
    slide.shapes.add_picture(ICON(name, variant), x + pad, y + pad, d - 2 * pad, d - 2 * pad)
    return c


def picture_fit(slide, path, x, y, w, h, anchor="top", radius=0.035, border=LINE, shadow=True, halign="center"):
    """Chèn ảnh lấp đầy khung (cắt phần thừa), bo góc, viền mảnh."""
    iw, ih = Image.open(path).size
    box_ratio = w / h
    img_ratio = iw / ih
    pic = slide.shapes.add_picture(path, x, y, w, h)
    if img_ratio > box_ratio:  # ảnh rộng hơn -> cắt hai bên
        keep = box_ratio / img_ratio
        frac = {"left": 0.0, "center": 0.5, "right": 1.0}.get(halign, halign)  # hoặc số 0..1
        pic.crop_left = (1 - keep) * frac
        pic.crop_right = (1 - keep) * (1 - frac)
    else:  # ảnh cao hơn -> cắt dưới (hoặc giữa)
        keep = img_ratio / box_ratio
        if anchor == "top":
            pic.crop_bottom = 1 - keep
        else:
            pic.crop_top = pic.crop_bottom = (1 - keep) / 2
    pic.auto_shape_type = MSO_SHAPE.ROUNDED_RECTANGLE
    geom = pic._element.spPr.find(qn("a:prstGeom"))
    av = geom.find(qn("a:avLst"))
    if av is None:
        av = etree.SubElement(geom, qn("a:avLst"))
    etree.SubElement(av, qn("a:gd"), name="adj", fmla=f"val {int(radius * 100000)}")
    if border:
        pic.line.color.rgb = rgb(border)
        pic.line.width = Pt(1)
    if shadow:
        soft_shadow(pic, blur=16, dist=4, alpha=16)
    return pic


def picture_contain(slide, path, x, y, w, h):
    """Chèn ảnh giữ nguyên tỉ lệ, căn giữa trong khung."""
    iw, ih = Image.open(path).size
    scale = min(w / iw, h / ih)
    pw, ph = int(iw * scale), int(ih * scale)
    return slide.shapes.add_picture(path, x + (w - pw) // 2, y + (h - ph) // 2, pw, ph)


def header(slide, num, kicker, title, dark=False):
    text(slide, M, Inches(0.42), Inches(9), Inches(0.3),
         [[(f"{num:02d}  ·  {kicker.upper()}", {"bold": True})]], size=12,
         color=TEAL if not dark else "5EEAD4")
    text(slide, M, Inches(0.72), Inches(12.1), Inches(0.8), title, size=32, bold=True,
         color=SLATE if not dark else WHITE)


def footer(slide, num, dark=False):
    c = MUTED_2 if not dark else "64748B"
    text(slide, M, Inches(7.05), Inches(8), Inches(0.25),
         f"{D.TEAM} · {D.CLASS_CODE} · {D.TITLE_SHORT}", size=10, color=c)
    text(slide, W - M - Inches(1.5), Inches(7.05), Inches(1.5), Inches(0.25),
         f"{num} / {TOTAL}", size=10, color=c, align=PP_ALIGN.RIGHT)


def stat(slide, x, y, w, value, label, vcolor=TEAL, lcolor=MUTED, vsize=40, lsize=13):
    text(slide, x, y, w, Inches(0.7), [[(value, {"bold": True})]], size=vsize, color=vcolor)
    text(slide, x, y + Inches(0.72), w, Inches(0.5), label, size=lsize, color=lcolor)


def new_slide(prs, bg=BG):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_bg(s, bg)
    return s


# ============================================================================ slides


def s01_title(prs):
    s = new_slide(prs, SLATE)
    text(s, M, Inches(0.55), Inches(8), Inches(0.3), D.UNIVERSITY, size=12, color="5EEAD4", bold=True)
    text(s, M, Inches(0.85), Inches(8), Inches(0.3), f"{D.REPORT_KIND.capitalize()} · Lớp {D.CLASS_CODE}",
         size=12, color=MUTED_2)
    text(s, M, Inches(1.55), Inches(7.2), Inches(2.3),
         [[("Hệ thống Đặt lịch", {})], [("& Quản lý Vận hành", {})], [("Salon - Spa", {"color": "5EEAD4"})]],
         size=42, bold=True, color=WHITE, spacing_after=0, line_spacing=1.0)
    text(s, M, Inches(3.95), Inches(6.8), Inches(0.9),
         "Đặt lịch trực tuyến 24/7, không bao giờ chồng lịch, vận hành minh bạch từ quầy lễ tân đến báo cáo doanh thu.",
         size=16, color="CBD5E1")
    # Nhóm
    round_rect(s, M, Inches(4.95), Inches(6.9), Inches(1.85), fill=SLATE_2, shadow=False)
    text(s, M + Inches(0.3), Inches(5.08), Inches(6.4), Inches(0.3),
         [[(f"{D.TEAM.upper()}  ·  GVHD / PO: {D.ADVISOR}", {"bold": True})]], size=12, color="5EEAD4")
    names = [m["name"] for m in D.MEMBERS]
    col = [names[:5], names[5:]]
    for i, group in enumerate(col):
        text(s, M + Inches(0.3 + 3.25 * i), Inches(5.42), Inches(3.2), Inches(1.35),
             [[(n, {})] for n in group], size=12.5, color="E2E8F0", spacing_after=1)
    picture_fit(s, SCREEN("01_home.jpg"), Inches(7.95), Inches(1.35), Inches(4.8), Inches(3.0),
                border="334155", shadow=False)
    picture_fit(s, SCREEN("05_timeline.jpg"), Inches(8.75), Inches(3.9), Inches(4.0), Inches(2.5),
                border="334155", shadow=False)
    s.notes_slide.notes_text_frame.text = (
        "Kính chào thầy và các bạn. Nhóm 3 xin trình bày đề tài Xây dựng Hệ thống Đặt lịch và Quản lý Vận hành "
        "Salon - Spa, do thầy Cấn Tuấn Anh hướng dẫn, đồng thời là Product Owner. Nhóm gồm 10 thành viên, thực hiện "
        "theo Scrum qua 4 Sprint.")


def s02_problem(prs):
    s = new_slide(prs)
    header(s, 2, "Bối cảnh", "Salon 6–8 thợ vẫn quản lý lịch bằng sổ tay và Zalo")
    cards = [
        ("overlap", "Chồng lịch", "Hai người cùng nhận lịch cho một thợ; dịch vụ 120 phút lấn sang lịch kế tiếp."),
        ("lost", "Mất khách", "Tin nhắn ngoài giờ, giờ cao điểm không ai trả lời kịp — khách sang tiệm khác."),
        ("noshow", "Khách không đến", "Không nhắc lịch, không lưu lịch sử lỡ hẹn — thợ ngồi chờ, khung giờ bỏ phí."),
        ("fraud", "Thất thoát doanh thu", "Thu tiền mặt không ghi phiếu, sửa sổ sau khi thu, áp ưu đãi tuỳ tiện."),
        ("data", "Không có dữ liệu khách", "Không biết khách từng làm gì, dùng sản phẩm nào, thích thợ nào."),
        ("report", "Báo cáo chậm", "Cuối tháng mới cộng sổ; quyết định kinh doanh dựa trên cảm tính."),
    ]
    cw, ch = Inches(3.86), Inches(2.3)
    gx, gy = Inches(0.26), Inches(0.28)
    for i, (ic, t, d) in enumerate(cards):
        x = M + (cw + gx) * (i % 3)
        y = Inches(1.75) + (ch + gy) * (i // 3)
        round_rect(s, x, y, cw, ch)
        icon_circle(s, ic, x + Inches(0.3), y + Inches(0.3), fill=ROSE if i < 1 else TEAL)
        text(s, x + Inches(0.3), y + Inches(1.05), cw - Inches(0.6), Inches(0.4), t, size=18, bold=True)
        text(s, x + Inches(0.3), y + Inches(1.45), cw - Inches(0.6), Inches(0.8), d, size=13.5, color=MUTED)
    footer(s, 2)
    s.notes_slide.notes_text_frame.text = (
        "Đối tượng là salon quy mô vừa 6–8 thợ, 10–15 dịch vụ. Khảo sát cho thấy 6 vấn đề: chồng lịch, mất khách, "
        "no-show, gian lận doanh thu, thiếu dữ liệu khách và báo cáo chậm. Chồng lịch là vấn đề nặng nhất và cũng "
        "là thách thức kỹ thuật chính của đề tài.")


def s03_solution(prs):
    s = new_slide(prs)
    header(s, 3, "Giải pháp", "4 tầng: React Vite ⇄ API ⇄ Nghiệp vụ ⇄ TypeORM / PostgreSQL")
    round_rect(s, M, Inches(1.7), Inches(7.9), Inches(5.1))
    for i, (layer, technology, responsibility) in enumerate(D.ARCHITECTURE):
        y = Inches(1.92 + i * 1.13)
        round_rect(s, M + Inches(0.25), y, Inches(7.25), Inches(1.0), fill=TEAL_BG, shadow=False)
        text(s, M + Inches(0.45), y + Inches(0.1), Inches(2.3), Inches(0.35), layer, size=16, bold=True)
        text(s, M + Inches(2.8), y + Inches(0.08), Inches(4.3), Inches(0.35), technology, size=14, bold=True)
        text(s, M + Inches(0.45), y + Inches(0.48), Inches(6.8), Inches(0.4), responsibility, size=13, color=MUTED)
    text(s, M + Inches(0.45), Inches(6.45), Inches(7), Inches(0.3),
         "SSE sau commit · Migration có phiên bản · cập nhật một chạm", size=13, color=TEAL_DARK)
    x = Inches(8.85)
    items = [
        ("layers", "Controller – Service – Repository", "API và nghiệp vụ NestJS 10; TypeORM Migration; Swagger /api/docs"),
        ("shield", "Guard toàn cục", "JWT + RBAC 4 vai trò nhân sự; khách dùng API công khai"),
        ("server", "Ràng buộc ở tầng CSDL", "24 bảng, EXCLUDE, CHECK, trigger nhật ký chỉ đọc"),
        ("calendar", "Giao diện Fresha", "36 màn hình, tối ưu 360 px, thông điệp tiếng Việt"),
    ]
    for i, (ic, t, d) in enumerate(items):
        y = Inches(1.75) + Inches(1.27) * i
        icon_circle(s, ic, x, y, d=Inches(0.56))
        text(s, x + Inches(0.75), y - Inches(0.02), Inches(3.3), Inches(0.35), t, size=16, bold=True)
        text(s, x + Inches(0.75), y + Inches(0.36), Inches(3.3), Inches(0.75), d, size=13, color=MUTED)
    footer(s, 3)
    s.notes_slide.notes_text_frame.text = (
        "Kiến trúc monorepo: frontend React 18 + Vite + Tailwind, backend NestJS phân tầng Controller–Service–"
        "Repository, CSDL PostgreSQL 15. Điểm quan trọng: các quy tắc toàn vẹn cốt lõi được cài ngay trong CSDL, "
        "không chỉ ở tầng ứng dụng.")


def s04_scrum(prs):
    s = new_slide(prs)
    header(s, 4, "Quy trình Scrum", "4 Sprint · 39 User Story · 165 Story Point")
    # KPI
    kpis = [("6", "Epic"), ("39", "User Story"), ("165", "Story Point"), ("4", "Sprint")]
    for i, (v, l) in enumerate(kpis):
        x = M + Inches(1.55) * i
        stat(s, x, Inches(1.6), Inches(1.5), v, l, vsize=36)
    # Sprints timeline
    y0 = Inches(3.0)
    sw = Inches(1.47)
    for i, sp in enumerate(D.SPRINTS):
        y = y0 + Inches(0.98) * i
        round_rect(s, M, y, Inches(6.05), Inches(0.84), fill=WHITE)
        c = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, M + Inches(0.14), y + Inches(0.14), Inches(1.15), Inches(0.56))
        c.adjustments[0] = 0.3
        c.fill.solid()
        c.fill.fore_color.rgb = rgb(TEAL if i % 2 == 0 else TEAL_DARK)
        c.line.fill.background()
        tf = c.text_frame
        tf.margin_left = tf.margin_right = 0
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = sp[0]
        r.font.size, r.font.bold, r.font.name = Pt(13), True, FONT
        r.font.color.rgb = rgb(WHITE)
        text(s, M + Inches(1.45), y + Inches(0.1), Inches(3.3), Inches(0.3), sp[1], size=14.5, bold=True)
        text(s, M + Inches(1.45), y + Inches(0.44), Inches(3.3), Inches(0.35), f"{sp[3]} story", size=12, color=MUTED)
        pts = f"{sp[4]} pt"
        text(s, M + Inches(4.75), y + Inches(0.22), Inches(1.15), Inches(0.4), [[(pts, {"bold": True})]],
             size=16, color=TEAL_DARK, align=PP_ALIGN.RIGHT)
    del sw
    # Chart: points per epic
    round_rect(s, Inches(7.05), Inches(1.6), Inches(5.68), Inches(5.2))
    cd = CategoryChartData()
    cd.categories = [f"{e[0]}  {e[1]}" for e in D.EPICS][::-1]
    cd.add_series("Story Point", [e[3] for e in D.EPICS][::-1])
    gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(7.25), Inches(2.1), Inches(5.3), Inches(4.55), cd)
    ch = gf.chart
    # OOXML axis IDs là unsignedInt; python-pptx mặc định sinh ID âm.
    for element in ch._chartSpace.iter():
        if element.tag in (qn("c:axId"), qn("c:crossAx")):
            element.set("val", str(int(element.get("val")) % (1 << 32)))
    ch.has_title = False
    ch.has_legend = False
    plot = ch.plots[0]
    plot.gap_width = 55
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.font.size = Pt(12)
    dl.font.bold = True
    dl.font.color.rgb = rgb(SLATE)
    dl.position = XL_LABEL_POSITION.OUTSIDE_END
    ser = plot.series[0]
    ser.format.fill.solid()
    ser.format.fill.fore_color.rgb = rgb(TEAL)
    va = ch.value_axis
    va.visible = False
    va.has_major_gridlines = False
    va.maximum_scale = 46
    ca = ch.category_axis
    ca.tick_labels.font.size = Pt(11)
    ca.tick_labels.font.color.rgb = rgb(MUTED)
    ca.format.line.color.rgb = rgb(LINE)
    ca.has_major_gridlines = False
    text(s, Inches(7.35), Inches(1.75), Inches(5), Inches(0.35), "Story Point theo Epic", size=15, bold=True)
    footer(s, 4)
    s.notes_slide.notes_text_frame.text = (
        "Thầy Cấn Tuấn Anh là Product Owner. Backlog có 6 epic, 39 story, 165 point. Sprint 1: 10 story 40 point, "
        "nền tảng tài khoản và danh mục. Sprint 2: 9 story 42 point, ca làm và đặt lịch công khai. Sprint 3: "
        "10 story 42 point; Sprint 4: 10 story 41 point, theo Excel gốc. EP-04 Vận hành lịch hẹn là epic "
        "lớn nhất. Mỗi Sprint kết thúc bằng Review có demo và PO nghiệm thu.")


def s05_booking(prs):
    s = new_slide(prs)
    header(s, 5, "Điểm sáng công nghệ 1", "Đặt lịch 4 bước & bộ tính khung giờ trống 15 phút")
    picture_fit(s, SCREEN("02_booking_step1.jpg"), M, Inches(1.7), Inches(4.9), Inches(5.1), halign=0.28)
    picture_fit(s, SCREEN("03_booking_mobile.jpg"), Inches(5.7), Inches(1.7), Inches(2.25), Inches(5.1))
    x = Inches(8.3)
    text(s, x, Inches(1.7), Inches(4.4), Inches(0.4), "Giải thuật (hàm thuần, 35 ca kiểm thử)", size=16, bold=True)
    steps = [
        ("Khoảng làm việc", "Giao ca làm của thợ với giờ mở cửa"),
        ("Trừ khoảng bận", "Nghỉ giữa ca, lịch đã có, ngày nghỉ tiệm / thợ"),
        ("Sinh mốc 15 phút", "Nhận t nếu [t, t + D) nằm trọn trong khoảng rảnh"),
        ("Lọc thời điểm", "Bỏ quá khứ và mốc cách hiện tại < 60 phút"),
        ("Thợ bất kỳ", "Hợp thợ đủ kỹ năng, ưu tiên thợ ít lịch; gợi ý 2 ngày còn chỗ"),
    ]
    for i, (t, d) in enumerate(steps):
        y = Inches(2.2) + Inches(0.9) * i
        c = s.shapes.add_shape(MSO_SHAPE.OVAL, x, y, Inches(0.46), Inches(0.46))
        c.fill.solid()
        c.fill.fore_color.rgb = rgb(TEAL)
        c.line.fill.background()
        tf = c.text_frame
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = str(i + 1)
        r.font.size, r.font.bold, r.font.name = Pt(14), True, FONT
        r.font.color.rgb = rgb(WHITE)
        text(s, x + Inches(0.65), y - Inches(0.03), Inches(3.75), Inches(0.3), t, size=14.5, bold=True)
        text(s, x + Inches(0.65), y + Inches(0.3), Inches(3.75), Inches(0.55), d, size=12.5, color=MUTED)
    footer(s, 5)
    s.notes_slide.notes_text_frame.text = (
        "Khách chọn tối đa 5 dịch vụ, hệ thống cộng dồn thời lượng và tiền. Bước khung giờ chỉ hiện những mốc mà "
        "thợ rảnh liên tục đủ tổng thời lượng. Bộ tính được viết thành hàm thuần, tính bằng phút từ 00:00, nên kiểm "
        "thử đơn vị dễ và nhanh: 35 ca, tất cả đạt. Giao diện tối ưu cho điện thoại 360 px.")


def s06_concurrency(prs):
    s = new_slide(prs)
    header(s, 6, "Điểm sáng công nghệ 2", "Chống đặt trùng: SERIALIZABLE + FOR UPDATE + EXCLUDE")
    round_rect(s, M, Inches(1.7), Inches(8.55), Inches(4.35))
    picture_contain(s, DIAG("lock.png"), M + Inches(0.15), Inches(1.82), Inches(8.25), Inches(4.1))
    # Big result card
    x = Inches(9.45)
    round_rect(s, x, Inches(1.7), Inches(3.28), Inches(4.35), fill=SLATE, shadow=True)
    text(s, x + Inches(0.3), Inches(1.95), Inches(2.7), Inches(0.3), "KIỂM THỬ E2E ĐỒNG THỜI", size=11.5,
         bold=True, color="5EEAD4")
    text(s, x + Inches(0.3), Inches(2.3), Inches(2.7), Inches(0.9), [[("20", {"bold": True})]], size=60, color=WHITE)
    text(s, x + Inches(0.3), Inches(3.25), Inches(2.7), Inches(0.4), "yêu cầu cùng khung giờ, cùng thợ", size=13, color="CBD5E1")
    text(s, x + Inches(0.3), Inches(3.9), Inches(2.7), Inches(0.6), [[("1", {"bold": True, "color": "5EEAD4"}), (" thành công (201)", {"size": 14, "color": WHITE})]], size=34)
    text(s, x + Inches(0.3), Inches(4.6), Inches(2.7), Inches(0.6), [[("19", {"bold": True, "color": "FDA4AF"}), (" nhận 409", {"size": 14, "color": WHITE})]], size=34)
    text(s, x + Inches(0.3), Inches(5.35), Inches(2.7), Inches(0.6), "Kết quả ổn định qua mọi lần chạy", size=12, color=MUTED_2)
    # 3 layer chips
    chips = [("lock", "Lớp 1 · SERIALIZABLE", "Xung đột 40001 → tự chạy lại ≤ 3 lần"),
             ("key", "Lớp 2 · FOR UPDATE", "Khoá dòng thợ: yêu cầu xếp hàng"),
             ("shield", "Lớp 3 · EXCLUDE gist", "CSDL chặn cả khi ghi thẳng bảng")]
    for i, (ic, t, d) in enumerate(chips):
        cx = M + Inches(4.12) * i
        round_rect(s, cx, Inches(6.2), Inches(3.9), Inches(0.72), fill=TEAL_BG, line="99F6E4", shadow=False)
        icon_circle(s, ic, cx + Inches(0.14), Inches(6.31), d=Inches(0.5))
        text(s, cx + Inches(0.78), Inches(6.27), Inches(3.05), Inches(0.3), t, size=13.5, bold=True, color=TEAL_DARK)
        text(s, cx + Inches(0.78), Inches(6.55), Inches(3.05), Inches(0.3), d, size=11.5, color=MUTED)
    footer(s, 6)
    s.notes_slide.notes_text_frame.text = (
        "Rủi ro lớn nhất: hai khách cùng bấm chốt một khung giờ. Nhóm dùng ba lớp độc lập: giao dịch SERIALIZABLE, "
        "khoá dòng thợ bằng SELECT FOR UPDATE để các yêu cầu xếp hàng, và ràng buộc EXCLUDE USING gist trên khoảng "
        "thời gian ở tầng CSDL. Kiểm thử bắn 20 yêu cầu đồng thời: luôn đúng 1 thành công, 19 nhận 409.")


def s07_reception(prs):
    s = new_slide(prs)
    header(s, 7, "Nghiệp vụ Lễ tân", "Lịch ngày trực quan, check-in 1 chạm, chuyển thợ hàng loạt")
    picture_fit(s, SCREEN("05_timeline.jpg"), M, Inches(1.7), Inches(7.6), Inches(4.75))
    x = Inches(8.55)
    feats = [
        ("timeline", "Timeline 15 phút", "Mỗi thợ một cột, vạch đỏ giờ hiện tại, vùng ngoài ca tô sọc; bấm lịch để thao tác."),
        ("check", "Check-in 1 chạm", "Cửa sổ ±60 phút, tự đánh dấu đến muộn > 15 phút, báo ngay cho thợ."),
        ("users", "Khách vãng lai", "Gõ SĐT tự điền hồ sơ; lịch tại quầy vào thẳng Đã xác nhận."),
        ("swap", "Chuyển lịch hàng loạt", "Thợ nghỉ đột xuất → gợi ý thợ thay thế đủ kỹ năng hoặc dời giờ; lỗi một lịch không hỏng cả lô."),
    ]
    for i, (ic, t, d) in enumerate(feats):
        y = Inches(1.7) + Inches(1.2) * i
        icon_circle(s, ic, x, y, d=Inches(0.54))
        text(s, x + Inches(0.72), y - Inches(0.02), Inches(3.45), Inches(0.3), t, size=15.5, bold=True)
        text(s, x + Inches(0.72), y + Inches(0.32), Inches(3.45), Inches(0.85), d, size=12.5, color=MUTED)
    text(s, M, Inches(6.55), Inches(7.6), Inches(0.3),
         "Màn hình Lịch ngày – trang đích của Lễ tân sau khi đăng nhập", size=11.5, color=MUTED_2)
    footer(s, 7)
    s.notes_slide.notes_text_frame.text = (
        "Lịch ngày là màn hình trung tâm của lễ tân: mỗi thợ một cột, trục 15 phút. Từ đây lễ tân xác nhận, check-in, "
        "đổi thợ hoặc dời giờ, đánh dấu không đến. Khi một thợ nghỉ đột xuất, chức năng chuyển lịch hàng loạt gợi ý "
        "thợ thay thế đủ kỹ năng cho từng lịch.")


def s08_stylist(prs):
    s = new_slide(prs)
    header(s, 8, "Nghiệp vụ Thợ & Khách hàng", "Lịch riêng tư, bảo mật thông tin khách, CRM tích hợp")
    picture_fit(s, SCREEN("11_stylist.jpg"), M, Inches(1.7), Inches(5.95), Inches(3.75))
    picture_fit(s, SCREEN("10_customers.jpg"), Inches(6.78), Inches(1.7), Inches(5.95), Inches(3.75))
    cols = [
        ("scissors", "Lịch của tôi", "Thợ chỉ thấy lịch của mình; Bắt đầu / Hoàn tất; cảnh báo khi vượt 20 phút."),
        ("eye", "SĐT luôn được che", "maskPhone ở backend: 098***1234 — số thật không bao giờ tới trình duyệt của thợ."),
        ("note", "Ghi chú kỹ thuật", "≤ 500 ký tự: sản phẩm, thời gian ủ… chỉ nhân sự nội bộ xem."),
        ("users", "CRM theo SĐT", "Gộp hồ sơ, 10 lượt gần nhất, số lần không đến; SĐT mới luôn 0 lượt."),
    ]
    cw = Inches(2.9)
    for i, (ic, t, d) in enumerate(cols):
        x = M + (cw + Inches(0.183)) * i
        round_rect(s, x, Inches(5.62), cw, Inches(1.3), fill=WHITE)
        icon_circle(s, ic, x + Inches(0.2), Inches(5.78), d=Inches(0.46))
        text(s, x + Inches(0.78), Inches(5.8), cw - Inches(0.9), Inches(0.35), t, size=14, bold=True)
        text(s, x + Inches(0.2), Inches(6.3), cw - Inches(0.4), Inches(0.6), d, size=11, color=MUTED)
    footer(s, 8)
    s.notes_slide.notes_text_frame.text = (
        "Thợ đăng nhập chỉ thấy lịch của chính mình. Số điện thoại khách được che ngay ở backend nên dữ liệu gốc "
        "không bao giờ gửi xuống máy của thợ. Hồ sơ khách gộp theo số điện thoại, có lịch sử 10 lượt và ghi chú kỹ "
        "thuật để phục vụ khách quen tốt hơn.")


def s09_owner(prs):
    s = new_slide(prs)
    header(s, 9, "Nghiệp vụ Chủ tiệm & Quản trị", "Hoá đơn – voucher, doanh thu realtime, 4 vai trò nhân sự + khách")
    picture_fit(s, SCREEN("13_revenue.jpg"), M, Inches(1.7), Inches(6.0), Inches(3.3))
    bullets(s, M, Inches(5.2), Inches(6.0), Inches(1.7), [
        [("Phiếu tính tiền: ", {"bold": True}), ("giá snapshot, dịch vụ phát sinh, 1 mã giảm giá / phiếu; phiếu đóng bị khoá.", {})],
        [("Tổng quan hôm nay ", {"bold": True}), ("tự làm mới 60 giây; doanh thu theo thợ / dịch vụ; CSV UTF-8 mở đúng trên Excel.", {})],
        [("Nhật ký chỉ đọc: ", {"bold": True}), ("trigger CSDL chặn mọi UPDATE / DELETE.", {})],
    ], size=13.5, gap=6)
    # RBAC table
    roles = ["Khách", "Thợ", "Lễ tân", "Chủ tiệm", "Quản trị"]
    rows = [
        ("Tài khoản & phân quyền", ["–", "–", "–", "R", "F"]),
        ("Dịch vụ & bảng giá", ["R", "R", "R", "F", "R"]),
        ("Thợ & ca làm việc", ["R", "R", "W", "F", "R"]),
        ("Đặt lịch công khai", ["W", "–", "F", "F", "R"]),
        ("Lịch hẹn & check-in", ["R", "W", "F", "F", "R"]),
        ("Phiếu tính tiền", ["R", "R", "F", "F", "R"]),
        ("Hồ sơ khách", ["R", "R", "W", "F", "R"]),
        ("Doanh thu & nhật ký", ["–", "–", "R", "F", "F"]),
    ]
    x, y = Inches(6.95), Inches(1.7)
    round_rect(s, x, y, Inches(5.78), Inches(5.2))
    text(s, x + Inches(0.25), y + Inches(0.18), Inches(5.3), Inches(0.35), "Ma trận phân quyền (RBAC)", size=15, bold=True)
    gt = s.shapes.add_table(len(rows) + 1, 6, x + Inches(0.2), y + Inches(0.62), Inches(5.38), Inches(4.1))
    tbl = gt.table
    tbl.columns[0].width = Inches(2.03)
    for j in range(1, 6):
        tbl.columns[j].width = Inches(0.67)
    tblpr = gt._element.graphic.graphicData.tbl.tblPr
    tblpr.set("firstRow", "1")
    tblpr.set("bandRow", "0")
    colors = {"F": (TEAL, WHITE), "W": (TEAL_TINT, TEAL_DARK), "R": ("F1F5F9", MUTED), "–": (WHITE, MUTED_2)}

    def cell(c, t, fill, color, bold=False, size=11, align=PP_ALIGN.CENTER):
        c.fill.solid()
        c.fill.fore_color.rgb = rgb(fill)
        c.margin_left = c.margin_right = Inches(0.05)
        c.margin_top = c.margin_bottom = Inches(0.03)
        c.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = c.text_frame
        tf.text = ""
        p = tf.paragraphs[0]
        p.alignment = align
        r = p.add_run()
        r.text = t
        r.font.size, r.font.bold, r.font.name = Pt(size), bold, FONT
        r.font.color.rgb = rgb(color)

    cell(tbl.cell(0, 0), "Chức năng", SLATE, WHITE, True, 11, PP_ALIGN.LEFT)
    for j, rname in enumerate(roles, 1):
        cell(tbl.cell(0, j), rname, SLATE, WHITE, True, 9.5)
    for i, (name, vals) in enumerate(rows, 1):
        cell(tbl.cell(i, 0), name, WHITE, SLATE, False, 11, PP_ALIGN.LEFT)
        for j, v in enumerate(vals, 1):
            f, c = colors[v]
            cell(tbl.cell(i, j), v, f, c, v == "F", 11.5)
    text(s, x + Inches(0.25), y + Inches(4.8), Inches(5.3), Inches(0.3),
         "F toàn quyền · W ghi trong phạm vi · R chỉ xem · – không truy cập", size=10.5, color=MUTED)
    footer(s, 9)
    s.notes_slide.notes_text_frame.text = (
        "Chủ tiệm có tổng quan tự làm mới 60 giây, doanh thu theo thợ và dịch vụ, xuất CSV. Phiếu tính tiền lưu giá "
        "tại thời điểm hẹn, chỉ một mã giảm giá, phiếu đã đóng bị khoá – đây là cơ chế chống gian lận. Phân quyền "
        "theo 4 vai trò nhân sự và phạm vi khách công khai, cùng nguồn quyền cho giao diện và guard API.")


def s10_infra(prs):
    s = new_slide(prs)
    header(s, 10, "Hạ tầng & tự động hoá", "SSE · TypeORM Migration · cập nhật một chạm")
    steps = [("check", "Kiểm tra", "Node ≥ 20; chờ Docker Desktop ≤ 2 phút, tự mở"),
             ("docker", "Docker Compose", "PostgreSQL 15 (healthcheck TCP), PgAdmin, Maildev"),
             ("layers", "Chuẩn bị", "Tạo .env, cài lại gói khi lockfile đổi, kiểm tra cổng"),
             ("server", "Migration", "Lược đồ có phiên bản; seed chỉ ở máy phát triển / QA"),
             ("refresh", "Supervisor", "Chạy API + WEB, chờ /health = 200 rồi mở trình duyệt")]
    cw = Inches(2.22)
    gap = (W - 2 * M - cw * 5) / 4
    for i, (ic, t, d) in enumerate(steps):
        x = M + int((cw + gap) * i)
        last = i == len(steps) - 1
        round_rect(s, x, Inches(1.65), cw, Inches(2.2), fill=SLATE if last else WHITE)
        icon_circle(s, ic, x + Inches(0.22), Inches(1.85), d=Inches(0.52))
        text(s, x + cw - Inches(0.7), Inches(1.8), Inches(0.5), Inches(0.5), [[(str(i + 1), {"bold": True})]],
             size=26, color="334155" if last else "CCFBF1", align=PP_ALIGN.RIGHT)
        text(s, x + Inches(0.22), Inches(2.52), cw - Inches(0.4), Inches(0.35), t, size=15.5, bold=True,
             color=WHITE if last else SLATE)
        text(s, x + Inches(0.22), Inches(2.9), cw - Inches(0.4), Inches(0.9), d, size=12,
             color="CBD5E1" if last else MUTED)
        if not last:
            text(s, x + cw, Inches(2.5), int(gap), Inches(0.4), "›", size=24, bold=True, color=TEAL, align=PP_ALIGN.CENTER)
    # 3 stat cards
    stats = [("SSE", "phát sự kiện sau commit, giao diện tải lại dữ liệu"),
             ("Migration", "khoá nâng cấp; rollback bước lỗi; synchronize: false"),
             ("1-Click Update", "build mới → sao lưu → migration → healthcheck")]
    for i, (v, l) in enumerate(stats):
        x = M + Inches(4.12) * i
        round_rect(s, x, Inches(4.1), Inches(3.9), Inches(1.45))
        text(s, x + Inches(0.3), Inches(4.25), Inches(3.4), Inches(0.6), [[(v, {"bold": True})]], size=30, color=TEAL)
        text(s, x + Inches(0.3), Inches(4.9), Inches(3.4), Inches(0.6), l, size=12.5, color=MUTED)
    bullets(s, M, Inches(5.8), W - 2 * M, Inches(1.2), [
        [("Máy vận hành: ", {"bold": True}), ("HoYoSalon.bat → chế độ Máy chủ cửa hàng → BẮT ĐẦU / CẬP NHẬT; giữ dữ liệu khách, không nạp seed mẫu.", {})],
        [("/health = 200 ", {"bold": True}), ("chỉ khi API truy vấn được CSDL (503 nếu chưa) — trình duyệt không bao giờ mở trước khi hệ thống sẵn sàng.", {})],
    ], size=13.5, gap=5)
    footer(s, 10)
    s.notes_slide.notes_text_frame.text = (
        "Mục tiêu: sao chép dự án sang bất kỳ máy nào, bật Docker Desktop, nhấp đúp HoYoSalon.bat và bấm BẮT ĐẦU. Launcher kiểm "
        "tra Node, dựng Docker, tạo .env, cài gói khi lockfile đổi, nạp dữ liệu an toàn, rồi bộ giám sát chạy API và "
        "giao diện. Bản v1.2.5 xử lý lỗi Windows 3221226505: dịch vụ sập được tự khởi động lại, Ctrl+C dừng sạch cả "
        "cây tiến trình. SSE phát sau commit; TypeORM migration có phiên bản và rollback bước lỗi. "
        "Nút CẬP NHẬT build bản mới, sao lưu trước migration, healthcheck; lỗi bật lại bản build cũ, "
        "giữ migration đã hoàn tất tương thích. Máy vận hành không seed dữ liệu mẫu.")



def s11_launcher(prs):
    s = new_slide(prs)
    header(s, 11, "Vận hành 1 cú nhấp (v1.4.0)", "HoYoSalon Launcher: BẮT ĐẦU · CẬP NHẬT · Chẩn đoán")
    picture_fit(s, os.path.join(A, "screens", "22_launcher.jpg"), M, Inches(1.6), Inches(7.6), Inches(4.5))
    bullets(s, M + Inches(7.9), Inches(1.65), W - 2 * M - Inches(7.9), Inches(4.6), [
        [("BẮT ĐẦU: ", {"bold": True}), ("Docker → CSDL → gói npm → API + giao diện, thanh % theo từng bước, tự mở ứng dụng.", {})],
        [("CẬP NHẬT vX.Y.Z: ", {"bold": True}), ("thấy thẻ mới trên GitHub là đổi nút; sao lưu CSDL trước migration, lỗi tự quay về bản cũ.", {})],
        [("Chẩn đoán: ", {"bold": True}), ("log Client / Server / CSDL trực tiếp, xuất system_logs.zip (đã ẩn mật khẩu), sao chép thông tin thiết bị.", {})],
        [("An toàn: ", {"bold": True}), ("chỉ nghe 127.0.0.1, mã phiên ngẫu nhiên; đóng Launcher không tắt hệ thống.", {})],
        [("Monorepo gọn: ", {"bold": True}), ("deploy/, docs/{reports,presentations,…}, scripts/{hoyo,lib,windows,unix}.", {})],
    ], size=13.5, gap=7)
    footer(s, 11)
    s.notes_slide.notes_text_frame.text = (
        "Từ v1.4.0 mọi thao tác vận hành gom về một cửa sổ. Người không biết lập trình chỉ cần nhấp đúp HoYoSalon.bat "
        "và bấm BẮT ĐẦU. Khi có phiên bản mới trên GitHub, nút đổi thành CẬP NHẬT. Bảng Thông tin & Chẩn đoán giúp "
        "xem log, xuất gói nhật ký và sao chép cấu hình máy để gửi hỗ trợ kỹ thuật.")


def s12_mentor(prs):
    s = new_slide(prs)
    header(s, 12, "Phản hồi Mentor Sprint 2 · 06/10", "11 góp ý → 11 nhánh → v1.4.0, có kiểm thử từng mục")
    cols = 3
    cw = (W - 2 * M - Inches(0.24) * (cols - 1)) / cols
    ch = Inches(1.15)
    for i, (n, title, how, _branch) in enumerate(D.MENTOR_ITEMS):
        r, c = divmod(i, cols)
        x = M + int((cw + Inches(0.24)) * c)
        y = Inches(1.55) + int((ch + Inches(0.12)) * r)
        round_rect(s, x, y, int(cw), ch, fill=WHITE)
        text(s, x + Inches(0.18), y + Inches(0.1), Inches(0.5), Inches(0.45), [[(n, {"bold": True})]], size=20, color=TEAL)
        text(s, x + Inches(0.68), y + Inches(0.12), int(cw) - Inches(0.85), Inches(0.35), [[(title, {"bold": True})]], size=13)
        text(s, x + Inches(0.68), y + Inches(0.46), int(cw) - Inches(0.85), Inches(0.65), how, size=10.5, color=MUTED)
    footer(s, 12)
    s.notes_slide.notes_text_frame.text = (
        "Mỗi góp ý của Mentor được làm trên một nhánh feature/fix/docs riêng, có kiểm thử tự động và hợp nhất vào develop. "
        "Điểm nhấn: giữ chỗ 10 phút (10 khách tranh một khung chỉ 1 người giữ được), thợ tự đăng ký ca và quản lý duyệt, "
        "cảnh báo khung giờ thiếu thợ, trợ lý xếp lịch và trợ lý sinh ngày lễ bằng âm lịch thiên văn.")

def s11_quality(prs):
    s = new_slide(prs)
    header(s, 13, "Đảm bảo chất lượng", "100% kiểm thử đạt · 0 cảnh báo lint · đồng bộ Backlog")
    tiles = [(f"{D.UNIT_TESTS}/{D.UNIT_TESTS}", "Unit test đạt", "11 bộ + Launcher 4/4"),
             (f"{D.E2E_TESTS}/{D.E2E_TESTS}", "E2E test đạt", f"{D.E2E_SUITES} bộ PostgreSQL · Demo {D.DEMO_TESTS}/{D.DEMO_TESTS}"),
             ("0", "Lỗi build · cảnh báo lint", "tsc -b · ESLint --max-warnings 0"),
             ("39 / 39", "User story đối chiếu", "4 Sprint · 165 Story Point")]
    tw = Inches(2.87)
    for i, (v, l, d) in enumerate(tiles):
        x = M + (tw + Inches(0.21)) * i
        round_rect(s, x, Inches(1.7), tw, Inches(1.95), fill=WHITE)
        text(s, x + Inches(0.28), Inches(1.88), tw - Inches(0.5), Inches(0.8), [[(v, {"bold": True})]], size=40, color=TEAL)
        text(s, x + Inches(0.28), Inches(2.72), tw - Inches(0.5), Inches(0.35), l, size=15, bold=True)
        text(s, x + Inches(0.28), Inches(3.1), tw - Inches(0.5), Inches(0.4), d, size=12, color=MUTED)
    # Release timeline
    text(s, M, Inches(3.95), Inches(8), Inches(0.35), "Vòng phản hồi PO → phát hành có tag (Git Flow)", size=16, bold=True)
    rel = [("25/09", "v1.1.0", "Giao diện Fresha"), ("27/09", "v1.2.0", "15 + 8 lỗi Sprint 1"),
           ("28/09", "v1.2.5", "Supervisor"), ("02/10", "v1.3.0", "23 lỗi QA Sprint 2"), ("05/10", "v1.3.6", "Số liệu khách"),
           ("06/10", "v1.4.0", "11 góp ý Mentor")]
    y = Inches(4.95)
    ln = s.shapes.add_connector(1, M + Inches(0.6), y, W - M - Inches(0.6), y)
    ln.line.color.rgb = rgb("99F6E4")
    ln.line.width = Pt(3)
    step = (W - 2 * M - Inches(1.2)) / (len(rel) - 1)
    for i, (d, v, t) in enumerate(rel):
        cx = M + Inches(0.6) + int(step * i)
        dot = s.shapes.add_shape(MSO_SHAPE.OVAL, cx - Inches(0.14), y - Inches(0.14), Inches(0.28), Inches(0.28))
        dot.fill.solid()
        dot.fill.fore_color.rgb = rgb(TEAL if i < len(rel) - 1 else SLATE)
        dot.line.color.rgb = rgb(WHITE)
        dot.line.width = Pt(2)
        text(s, cx - Inches(1.1), y - Inches(0.6), Inches(2.2), Inches(0.3), d, size=12, color=MUTED, align=PP_ALIGN.CENTER)
        text(s, cx - Inches(1.1), y + Inches(0.27), Inches(2.2), Inches(0.35), [[(v, {"bold": True})]], size=16,
             color=SLATE, align=PP_ALIGN.CENTER)
        text(s, cx - Inches(1.1), y + Inches(0.62), Inches(2.2), Inches(0.3), t, size=12, color=MUTED, align=PP_ALIGN.CENTER)
    round_rect(s, M, Inches(6.08), W - 2 * M, Inches(0.8), fill=TEAL_BG, line="99F6E4", shadow=False)
    icon_circle(s, "check", M + Inches(0.18), Inches(6.21), d=Inches(0.54))
    text(s, M + Inches(0.9), Inches(6.2), W - 2 * M - Inches(1.1), Inches(0.6),
         "Định nghĩa Hoàn thành: review + merge vào develop · build & lint sạch · test đạt · story đối chiếu trong "
         "BACKLOG-MAPPING · chạy được trên staging dựng bằng một lệnh.", size=13, color=TEAL_DARK, anchor=MSO_ANCHOR.MIDDLE)
    s.notes_slide.notes_text_frame.text = (
        f"Kiểm định {D.QUALITY_DATE}: {D.UNIT_TESTS} unit test, {D.E2E_TESTS} E2E trong {D.E2E_SUITES} bộ, "
        f"{D.DEMO_TESTS} test Demo đạt. Build và lint sạch. 39 story / 165 point đối chiếu Excel gốc và "
        "BACKLOG-MAPPING; test tự động không thay thế biên bản nghiệm thu thủ công của PO.")


def s12_demo(prs):
    s = new_slide(prs)
    header(s, 14, "Demo trực tiếp", "Kịch bản 6 bước — mỗi bước một vai trò")
    steps = [
        ("phone", "Khách đặt lịch", "Cửa sổ ẩn danh · /dat-lich", "Cắt tóc nam + Nhuộm → khung giờ 150 phút → mã 8 ký tự, email ở Maildev"),
        ("lock", "Chống đặt trùng", "Terminal", "npm run test:e2e -- booking-concurrency → 1 thành công / 19 nhận 409"),
        ("calendar", "Lễ tân điều phối", "reception@salon.vn", "Xác nhận lịch vừa đặt, tạo khách vãng lai, check-in trên Lịch ngày"),
        ("scissors", "Thợ phục vụ", "stylist1@salon.vn", "Bắt đầu → Hoàn tất; SĐT khách hiển thị 098***1234; ghi chú kỹ thuật"),
        ("receipt", "Thu tiền", "reception@salon.vn", "Lập phiếu, mã NGAYTHUONG10 → 963.000 đ, đóng phiếu → email đánh giá"),
        ("chart", "Báo cáo & kiểm soát", "owner@ · admin@", "Doanh thu cộng đúng thợ, xuất CSV; Nhật ký ghi mọi thao tác"),
    ]
    cw, ch = Inches(3.86), Inches(2.4)
    for i, (ic, t, acc, d) in enumerate(steps):
        x = M + (cw + Inches(0.26)) * (i % 3)
        y = Inches(1.7) + (ch + Inches(0.25)) * (i // 3)
        round_rect(s, x, y, cw, ch)
        icon_circle(s, ic, x + Inches(0.28), y + Inches(0.28), d=Inches(0.58))
        text(s, x + cw - Inches(0.95), y + Inches(0.2), Inches(0.7), Inches(0.7), [[(f"{i + 1}", {"bold": True})]],
             size=36, color="CCFBF1", align=PP_ALIGN.RIGHT)
        text(s, x + Inches(0.28), y + Inches(1.0), cw - Inches(0.5), Inches(0.35), t, size=17, bold=True)
        text(s, x + Inches(0.28), y + Inches(1.36), cw - Inches(0.5), Inches(0.3), acc, size=12, bold=True, color=TEAL_DARK)
        text(s, x + Inches(0.28), y + Inches(1.68), cw - Inches(0.5), Inches(0.7), d, size=12.5, color=MUTED)
    footer(s, 14)
    s.notes_slide.notes_text_frame.text = (
        "Chuẩn bị: chạy run_project.bat, mở sẵn giao diện 5173, Maildev 1080, Swagger và một cửa sổ ẩn danh. "
        "Bước 1 bạn đóng vai khách đặt lịch. Bước 2 chạy kiểm thử đồng thời. Bước 3 lễ tân xác nhận, vãng lai, "
        "check-in. Bước 4 thợ hoàn tất và ghi chú. Bước 5 lễ tân lập phiếu với mã giảm giá. Bước 6 chủ tiệm xem "
        "doanh thu, quản trị xem nhật ký. Chi tiết trong docs/DEMO-SCRIPT.md.")


def s13_end(prs):
    s = new_slide(prs, SLATE)
    text(s, M, Inches(0.6), Inches(8), Inches(0.3), "13  ·  KẾT LUẬN", size=12, bold=True, color="5EEAD4")
    text(s, M, Inches(0.95), Inches(7.4), Inches(1.4), "Từ sổ tay đến một hệ thống vận hành trọn vẹn",
         size=36, bold=True, color=WHITE, line_spacing=1.0)
    results = [
        ("39 / 39 story · 165 point", "Đối chiếu đủ Product Backlog trong 4 Sprint"),
        ("Không chồng lịch", "Ba lớp bảo vệ, chứng minh bằng 20 yêu cầu đồng thời"),
        ("Minh bạch doanh thu", "Phiếu khoá, nhật ký chỉ đọc, RBAC 4 vai trò nhân sự + khách"),
        ("Triển khai 1 chạm", "Tự phục hồi trên Windows, macOS, Linux"),
    ]
    for i, (t, d) in enumerate(results):
        y = Inches(2.65) + Inches(0.95) * i
        c = s.shapes.add_shape(MSO_SHAPE.OVAL, M, y + Inches(0.05), Inches(0.42), Inches(0.42))
        c.fill.solid()
        c.fill.fore_color.rgb = rgb(TEAL)
        c.line.fill.background()
        s.shapes.add_picture(ICON("check", "w"), M + Inches(0.09), y + Inches(0.14), Inches(0.24), Inches(0.24))
        text(s, M + Inches(0.65), y, Inches(6.6), Inches(0.35), t, size=18, bold=True, color=WHITE)
        text(s, M + Inches(0.65), y + Inches(0.38), Inches(6.6), Inches(0.35), d, size=13.5, color="CBD5E1")
    text(s, M, Inches(6.55), Inches(7.5), Inches(0.3),
         "Hướng phát triển: thanh toán & đặt cọc online · nhắc lịch Zalo/SMS · đa chi nhánh · CI/CD",
         size=12.5, color=MUTED_2)
    # Q&A panel
    x = Inches(8.35)
    round_rect(s, x, Inches(0.6), Inches(4.38), Inches(6.3), fill=SLATE_2, shadow=False)
    icon_circle(s, "help", x + Inches(1.64), Inches(1.4), d=Inches(1.1))
    text(s, x, Inches(2.75), Inches(4.38), Inches(1.0), [[("Q & A", {"bold": True})]], size=54, color=WHITE,
         align=PP_ALIGN.CENTER)
    text(s, x + Inches(0.4), Inches(3.9), Inches(3.58), Inches(0.8), "Cảm ơn thầy và các bạn đã lắng nghe!",
         size=16, color="CBD5E1", align=PP_ALIGN.CENTER)
    text(s, x + Inches(0.4), Inches(5.2), Inches(3.58), Inches(1.4),
         [[(f"{D.TEAM} · {D.CLASS_CODE}", {"bold": True, "color": "5EEAD4"})],
          [(f"GVHD / PO: {D.ADVISOR}", {})],
          [("github.com/steveprovip/thucTap_HeThongDatLichSPA", {"size": 11})]],
         size=13, color=MUTED_2, align=PP_ALIGN.CENTER, spacing_after=3)
    s.notes_slide.notes_text_frame.text = (
        "Nhóm đã đối chiếu 39/39 story với phạm vi đề tài, giải quyết các vấn đề của cách quản lý thủ công. "
        "Hướng phát triển: thanh toán và đặt cọc trực tuyến, nhắc lịch qua Zalo/SMS, đa chi nhánh và CI/CD. "
        "Nhóm xin cảm ơn và sẵn sàng trả lời câu hỏi.")


def main():
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    for fn in (s01_title, s02_problem, s03_solution, s04_scrum, s05_booking, s06_concurrency, s07_reception,
               s08_stylist, s09_owner, s10_infra, s11_launcher, s12_mentor, s11_quality, s12_demo, s13_end):
        fn(prs)
    prs.core_properties.title = D.TITLE_SHORT
    prs.core_properties.author = f"{D.TEAM} – {D.CLASS_CODE}"
    prs.save(OUT)
    print("Đã tạo:", OUT)


if __name__ == "__main__":
    main()
