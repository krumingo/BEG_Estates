"""PDF generation for Quote Builder using reportlab.

Uses Liberation Sans (system font, supports full Cyrillic).
Layout: A4 portrait with vertical logo header, items table, totals, terms, footer.
"""
import io
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


_FONT_REGISTERED = False
_FONT_NAME = "LiberationSans"
_FONT_BOLD = "LiberationSans-Bold"


def _register_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    base = Path("/usr/share/fonts/truetype/liberation")
    pdfmetrics.registerFont(TTFont(_FONT_NAME, str(base / "LiberationSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(_FONT_BOLD, str(base / "LiberationSans-Bold.ttf")))
    _FONT_REGISTERED = True


def _fmt_money(v: float) -> str:
    if v is None:
        return "—"
    s = f"{v:,.2f}".replace(",", " ").replace(".00", "")
    return f"{s} €"


def _fmt_area(v) -> str:
    if v is None or v == "":
        return "—"
    try:
        return f"{float(v):.2f} м²".rstrip("0").rstrip(".") + (" м²" if "м²" not in str(v) else "")
    except Exception:
        return str(v)


def _fmt_date_iso(iso: str) -> str:
    if not iso:
        return "—"
    try:
        if "T" in iso:
            d = datetime.fromisoformat(iso.replace("Z", "+00:00")).date()
        else:
            d = datetime.fromisoformat(iso).date()
        return d.strftime("%d.%m.%Y")
    except Exception:
        return iso


def _parse_date_to_bg(iso: Optional[str]) -> str:
    """For schedule milestones: short BG month/year, e.g. „Юли 2026"."""
    from services.payment_schemes import fmt_bg_month_year
    if not iso:
        return "—"
    try:
        if "T" in iso:
            d = datetime.fromisoformat(iso.replace("Z", "+00:00")).date()
        else:
            d = datetime.fromisoformat(iso).date()
        return fmt_bg_month_year(d)
    except Exception:
        return iso


def build_quote_pdf(quote: dict) -> bytes:
    _register_fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=f"Оферта {quote.get('quote_number','')}",
    )

    styles = getSampleStyleSheet()
    base_style = ParagraphStyle(
        "Base", parent=styles["Normal"], fontName=_FONT_NAME,
        fontSize=10, leading=14, textColor=colors.HexColor("#0f172a"),
    )
    h1 = ParagraphStyle(
        "H1", parent=base_style, fontName=_FONT_BOLD, fontSize=22, leading=26,
        textColor=colors.HexColor("#0f172a"),
    )
    h2 = ParagraphStyle(
        "H2", parent=base_style, fontName=_FONT_BOLD, fontSize=12, leading=16,
        textColor=colors.HexColor("#475569"), spaceBefore=8, spaceAfter=4,
    )
    small = ParagraphStyle(
        "Small", parent=base_style, fontSize=8, leading=11,
        textColor=colors.HexColor("#64748b"),
    )
    muted = ParagraphStyle(
        "Muted", parent=base_style, fontSize=9, leading=12,
        textColor=colors.HexColor("#475569"),
    )

    story = []

    # ---- Header: BEG ESTATES brand on left, OFFER number/date on right ----
    brand_p = Paragraph(
        '<font name="LiberationSans-Bold" size="20" color="#0f172a">BEG</font> '
        '<font name="LiberationSans" size="9" color="#64748b">ESTATES</font><br/>'
        '<font name="LiberationSans" size="7" color="#94a3b8">BUILDING EXPRESS GROUP</font>',
        base_style,
    )
    info_lines = [
        f'<para align="right"><font name="LiberationSans-Bold" size="18" color="#0f172a">ОФЕРТА</font></para>',
        f'<para align="right"><font name="LiberationSans-Bold" size="11">№ {quote.get("quote_number","")}</font></para>',
        f'<para align="right"><font name="LiberationSans" size="9" color="#64748b">Дата: {_fmt_date_iso(quote.get("created_at",""))}</font></para>',
        f'<para align="right"><font name="LiberationSans" size="9" color="#64748b">Валидна до: {_fmt_date_iso(quote.get("valid_until",""))}</font></para>',
    ]
    right_block = [Paragraph(s, base_style) for s in info_lines]

    header_tbl = Table(
        [[brand_p, right_block]],
        colWidths=[80 * mm, 90 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 6 * mm))

    # ---- Client block ----
    story.append(Paragraph("ДО", h2))
    client_lines = [f'<font name="LiberationSans-Bold">{quote.get("client_name") or "—"}</font>']
    if quote.get("client_email"):
        client_lines.append(f"Email: {quote['client_email']}")
    if quote.get("client_phone"):
        client_lines.append(f"Телефон: {quote['client_phone']}")
    story.append(Paragraph("<br/>".join(client_lines), base_style))
    story.append(Spacer(1, 6 * mm))

    # ---- Items table ----
    story.append(Paragraph("ОБЕКТИ", h2))
    items = quote.get("items", []) or []
    head = [
        Paragraph('<font name="LiberationSans-Bold" size="9">Код</font>', base_style),
        Paragraph('<font name="LiberationSans-Bold" size="9">Описание</font>', base_style),
        Paragraph('<font name="LiberationSans-Bold" size="9">F1</font>', base_style),
        Paragraph('<font name="LiberationSans-Bold" size="9">F1+F2</font>', base_style),
        Paragraph('<font name="LiberationSans-Bold" size="9">Листова</font>', base_style),
        Paragraph('<font name="LiberationSans-Bold" size="9">Отстъпка</font>', base_style),
        Paragraph('<font name="LiberationSans-Bold" size="9">Сума</font>', base_style),
    ]
    rows = [head]
    for it in items:
        price = float(it.get("custom_price") or 0)
        disc_pct = float(it.get("discount_percent") or 0)
        line_total = price * (1 - disc_pct / 100.0)
        rows.append([
            Paragraph(it.get("property_code") or "—", base_style),
            Paragraph(it.get("property_label") or "—" + (
                f"<br/><font size='7' color='#64748b'>{it.get('notes')}</font>"
                if it.get("notes") else ""
            ), base_style),
            Paragraph(_fmt_area(it.get("f1_area")), base_style),
            Paragraph(_fmt_area(it.get("total_area") or it.get("f2_area")), base_style),
            Paragraph(_fmt_money(it.get("list_price")), base_style),
            Paragraph(f"{disc_pct:.0f}%" if disc_pct else "—", base_style),
            Paragraph(_fmt_money(line_total), base_style),
        ])

    items_tbl = Table(rows, colWidths=[18 * mm, 50 * mm, 18 * mm, 22 * mm, 22 * mm, 18 * mm, 26 * mm])
    items_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), _FONT_NAME, 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#cbd5e1")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 1), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 6 * mm))

    # ---- Totals ----
    subtotal = float(quote.get("subtotal") or 0)
    discount = float(quote.get("discount_amount") or 0)
    vat_amount = float(quote.get("vat_amount") or 0)
    vat_rate = float(quote.get("vat_rate") or 20)
    total = float(quote.get("total") or 0)
    vat_mode = quote.get("vat_mode") or "with_vat"

    totals_rows = [
        ["Subtotal:", _fmt_money(subtotal)],
    ]
    if discount > 0:
        totals_rows.append([f"Допълнителна отстъпка:", f"-{_fmt_money(discount)}"])
    if vat_mode == "with_vat":
        totals_rows.append([f"ДДС ({vat_rate:.0f}%):", _fmt_money(vat_amount)])
    totals_rows.append([
        Paragraph('<font name="LiberationSans-Bold" size="12">ОБЩО ЗА ПЛАЩАНЕ:</font>', base_style),
        Paragraph(f'<font name="LiberationSans-Bold" size="12">{_fmt_money(total)}</font>', base_style),
    ])
    totals_tbl = Table(totals_rows, colWidths=[120 * mm, 50 * mm])
    totals_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), _FONT_NAME, 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.HexColor("#0f172a")),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_tbl)
    story.append(Spacer(1, 8 * mm))

    # ---- Terms ----
    if quote.get("payment_terms"):
        story.append(Paragraph("УСЛОВИЯ НА ПЛАЩАНЕ", h2))
        for line in (quote["payment_terms"] or "").split("\n"):
            story.append(Paragraph(line or "&nbsp;", muted))
        story.append(Spacer(1, 4 * mm))
    if quote.get("delivery_terms"):
        story.append(Paragraph("СРОК И ПРЕДАВАНЕ", h2))
        for line in (quote["delivery_terms"] or "").split("\n"):
            story.append(Paragraph(line or "&nbsp;", muted))
        story.append(Spacer(1, 4 * mm))
    if quote.get("additional_notes"):
        story.append(Paragraph("ДОПЪЛНИТЕЛНИ БЕЛЕЖКИ", h2))
        for line in (quote["additional_notes"] or "").split("\n"):
            story.append(Paragraph(line or "&nbsp;", muted))
        story.append(Spacer(1, 4 * mm))

    # ---- Payment Schedule ----
    sched = quote.get("payment_schedule") or {}
    stages = sched.get("stages") or []
    if stages:
        from services.payment_schemes import fmt_bg_month_year
        scheme_label = {
            "standard": "Стандартна (без банков кредит)",
            "with_bank": "С банков кредит",
            "custom": "Custom",
        }.get(sched.get("scheme_type"), "Custom")
        story.append(Paragraph(f"СХЕМА ЗА ПЛАЩАНЕ — {scheme_label}", h2))
        if sched.get("expected_act_2_date"):
            story.append(Paragraph(
                f"Дата на Акт 2: {_fmt_date_iso(sched['expected_act_2_date'])} · Срок за завършване: ~30 месеца",
                muted,
            ))
        if sched.get("stop_deposit_amount") and float(sched["stop_deposit_amount"]) > 0:
            story.append(Paragraph(
                f"Внесено стоп-капаро: {_fmt_money(float(sched['stop_deposit_amount']))} (приспаднато от долните вноски)",
                muted,
            ))
        story.append(Spacer(1, 2 * mm))
        sch_head = [
            Paragraph('<font name="LiberationSans-Bold" size="9">#</font>', base_style),
            Paragraph('<font name="LiberationSans-Bold" size="9">Етап</font>', base_style),
            Paragraph('<font name="LiberationSans-Bold" size="9">Очаквана дата</font>', base_style),
            Paragraph('<font name="LiberationSans-Bold" size="9">%</font>', base_style),
            Paragraph('<font name="LiberationSans-Bold" size="9">Сума</font>', base_style),
        ]
        sch_rows = [sch_head]
        total_pct = 0.0
        total_amt = 0.0
        for st in stages:
            order = st.get("order")
            label = st.get("label") or "—"
            desc = st.get("description") or ""
            pct = float(st.get("percent") or 0)
            amount = float(st.get("amount") or 0)
            ed = _parse_date_to_bg(st.get("expected_date"))
            total_pct += pct
            total_amt += amount
            label_block = label
            if desc:
                label_block += f"<br/><font size='7' color='#64748b'>{desc}</font>"
            sch_rows.append([
                Paragraph(str(order or "—"), base_style),
                Paragraph(label_block, base_style),
                Paragraph(ed, base_style),
                Paragraph(f"{pct:.0f}%", base_style),
                Paragraph(_fmt_money(amount), base_style),
            ])
        sch_rows.append([
            "",
            Paragraph('<font name="LiberationSans-Bold">ОБЩО</font>', base_style),
            "",
            Paragraph(f'<font name="LiberationSans-Bold">{total_pct:.0f}%</font>', base_style),
            Paragraph(f'<font name="LiberationSans-Bold">{_fmt_money(total_amt)}</font>', base_style),
        ])
        sch_tbl = Table(sch_rows, colWidths=[10 * mm, 70 * mm, 38 * mm, 18 * mm, 28 * mm])
        sch_tbl.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), _FONT_NAME, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#cbd5e1")),
            ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.HexColor("#0f172a")),
            ("INNERGRID", (0, 1), (-1, -2), 0.25, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(sch_tbl)
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(
            "<font color='#64748b'>ВАЖНО: Сроковете са приблизителни. При неспазване на срок неустойка 0.2%/ден. "
            "Капарото е невъзстановимо при отказ от страна на купувача.</font>",
            small,
        ))
        story.append(Spacer(1, 4 * mm))

    # ---- Footer ----
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        f"© {datetime.now().year} Building Express Group · Всички права запазени · София, България",
        small,
    ))

    doc.build(story)
    return buf.getvalue()
