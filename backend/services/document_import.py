"""AI-assisted PDF import: classification + extraction into a review payload.

Practical approach (not a full ETL):
- PyMuPDF extracts native text when the PDF has selectable text.
- OCR (Tesseract bul+eng) is used as a fallback *per page* only when a page
  has no text layer.
- Classification combines filename keywords + content keywords.
- Extraction is regex-based for cells that repeat across BG real-estate
  area schedules / price lists / buyer rosters.

Nothing here writes to the database.
"""
from __future__ import annotations

import io
import re
from collections.abc import Iterable
from typing import Optional

import cv2  # noqa: F401 — imported so ocv dependencies are warmed up
import fitz  # PyMuPDF
import numpy as np
import pytesseract
from PIL import Image


# ---------- classification ----------
# Имена, които явно са архитектурни разпределения / планове.
# Тези файлове не съдържат inventory rows — само размери, callouts, легенди.
_FLOOR_PLAN_FILENAME_PATTERNS = [
    "етаж", "floor", "plan", "планировк", "схема", "разпределен",
    "-ar", "_ar", "sd-ar", "np1", "r05", "r-05", "r06",
]
# Филенейм, който е обобщителна / tablица OBSHTO / summary — да не се извличат units
_SUMMARY_FILENAME_PATTERNS = ["общо", "obsht", "обща", "summary", "total", "swod", "свод"]

_FILENAME_HINTS = [
    ("summary_table", _SUMMARY_FILENAME_PATTERNS),
    ("floor_plan", _FLOOR_PLAN_FILENAME_PATTERNS),
    ("buyers", ["купувач", "buyer", "собствен", "owners", "титуляр", "kupovach"]),
    ("pricing", ["цен", "price", "pric", "списък", "list", "rzp", "рзп", "spis"]),
    ("area_schedule", [
        "квадрат", "площ", "area", "раздел", "таблиц",
        "ploshti", "ploshto", "kvadrat", "razdel",
    ]),
]
_CONTENT_HINTS = [
    ("buyers", ["купувач", "егн", "телефон", "email", "имейл", "@"]),
    ("pricing", ["лв.", "евро", "€", "eur", "цена"]),
    ("area_schedule", ["раздел", "площ", "м²", "кв.м", "rzp", "рзп"]),
]


def classify(filename: str, text: str) -> tuple[str, float]:
    fl = (filename or "").lower()
    tl = (text or "").lower()

    # Strong filename signal first
    for label, keys in _FILENAME_HINTS:
        if any(k in fl for k in keys):
            # Validate with content
            hits = sum(1 for k in sum((kk for _, kk in _CONTENT_HINTS), []) if k in tl)
            confidence = 0.8 if hits else 0.55
            return label, confidence

    # Content signal
    scores: dict[str, int] = {}
    for label, keys in _CONTENT_HINTS:
        scores[label] = sum(1 for k in keys if k in tl)

    if scores:
        top_label, top_score = max(scores.items(), key=lambda kv: kv[1])
        if top_score >= 2:
            return top_label, min(0.9, 0.3 + 0.15 * top_score)

    # Floor-plan pages tend to have very little text relative to image size
    if len(tl.strip()) < 120:
        return "floor_plan", 0.4

    return "unknown", 0.0


# ---------- text extraction ----------
def _extract_text_per_page(blob: bytes) -> list[str]:
    pages: list[str] = []
    with fitz.open(stream=blob, filetype="pdf") as doc:
        for i in range(doc.page_count):
            page = doc.load_page(i)
            txt = page.get_text("text") or ""
            if txt.strip():
                pages.append(txt)
                continue
            # Fallback: OCR the rasterised page
            pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 3:
                pil = Image.fromarray(img[..., ::-1])  # BGR→RGB handled inside OCR
            elif pix.n == 4:
                pil = Image.fromarray(img[..., :3])
            else:
                pil = Image.fromarray(img.squeeze())
            try:
                pages.append(pytesseract.image_to_string(pil, lang="bul+eng") or "")
            except pytesseract.TesseractError:
                pages.append("")
    return pages


def _render_page_thumbnail(blob: bytes, page_index: int, max_width: int = 1200) -> Optional[bytes]:
    """Return a PNG preview of a given page (1-based index in the public API)."""
    try:
        with fitz.open(stream=blob, filetype="pdf") as doc:
            if page_index < 0 or page_index >= doc.page_count:
                return None
            page = doc.load_page(page_index)
            rect = page.rect
            zoom = max_width / max(rect.width, 1)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            buf = io.BytesIO(pix.tobytes("png"))
            return buf.getvalue()
    except Exception:
        return None


# ---------- regexes ----------
# Apartment code: изисква explicit префикс (АП/APT) ИЛИ 3+ цифрен код.
# Това отхвърля 2-цифрени dimension fragments като "76", "19", "02"
# от архитектурните планове и summary таблици.
UNIT_CODE_RE = re.compile(
    r"(?:(?:АП|APT|AP)\.?\s*(\d{2,4}[A-ZА-Я]?)|(?<![A-ZА-Я\d])(\d{3,4}[A-ZА-Я]?))\b",
    re.I | re.UNICODE,
)
PM_CODE_RE = re.compile(
    r"(ПМ|PM|ПАРКОМЯСТО|ГАРАЖ|СКЛАД|МАГАЗИН|SHOP|STORAGE|GARAGE)\s*[-\s№\.]*(\d{1,3})",
    re.I | re.UNICODE,
)
# Изключваме non-sale technical rooms от extraction (реален OCR съдържа много от тях).
EXCLUDED_LINE_RE = re.compile(
    r"(трафопост|резервоар|машинно|стълбищ|асансьор|коридор|helipad|"
    r"технич|абонатн|портиерск|вентилац|"
    r"mashinno|asansyor|tehnichno|tehnich|rezervoar|trafopost)",
    re.I | re.UNICODE,
)
ROOMS_RE = re.compile(r"(\d)\s*[-\s]*(?:ста(?:и|йн|ен)|стая|rooms?)", re.I)
AREA_RE = re.compile(r"(\d{1,4}[.,]\d{1,2}|\d{2,4})\s*(?:м²|кв\.?\s*м|м2|sq\.?\s*m|m²)", re.I)
PRICE_RE = re.compile(r"(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d{4,8})\s*(лв|EUR|€|\$)", re.I)
PHONE_RE = re.compile(r"\+?\d[\d\s\-\(\)]{7,}\d")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Explicit floor hints на архитектурна страница: „Етаж 2", „2 ет.", „2-ри етаж", „floor 3"…
# Изключваме „кота" / „+3.40" — абсолютни денивелационни марки, които НЕ са етажни номера.
FLOOR_EXPLICIT_RE = re.compile(
    r"(?:(?:етаж|ет\.?|floor)\s*[:\-]?\s*(\d{1,2})"
    r"|(\d{1,2})\s*(?:-(?:ти|ри|ви|и|ий|ият)?)?\s*(?:етаж|ет\.?|floor))",
    re.I | re.UNICODE,
)


def _unit_code_from_match(m: "re.Match") -> Optional[str]:
    """Extract normalized unit code from a UNIT_CODE_RE match.

    Group 1 = код с явен префикс (АП.101), group 2 = bare 3-4 цифрен код.
    """
    return (m.group(1) or m.group(2) or "").upper().replace(" ", "").replace(".", "")


def _normalize_code(raw: str) -> str:
    return (raw or "").replace(" ", "").replace(".", "").upper()


def _to_float(s: str) -> Optional[float]:
    s = (s or "").replace(" ", "").replace("\u00a0", "")
    if "," in s and "." in s:
        # European format: 1.234,56 → strip dots, replace comma
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ---------- extraction ----------
def extract_units_from_area_schedule(text: str, source_file_id: str) -> list[dict]:
    """Parse rows that look like 'АП.101 | 2 стаи | 95.5 м² | ...' style entries.

    Hard requirement: редът трябва да съдържа поне един от:
      - area с explicit unit (м²/кв.м)
      - price с валута
      - „N стаи" паттерн
    Инак dimension fragments от планове се превръщат в fake units.
    """
    results: list[dict] = []
    for ln, line in enumerate(text.splitlines()):
        s = line.strip()
        if len(s) < 6:
            continue

        # Technical/non-sale rooms (трафопост, резервоар, машинно…) → skip.
        if EXCLUDED_LINE_RE.search(s):
            continue

        # Gate: без area/price/rooms сигнал пропускаме цялата линия.
        has_area = bool(AREA_RE.search(s))
        has_price = bool(PRICE_RE.search(s))
        has_rooms = bool(ROOMS_RE.search(s))
        if not (has_area or has_price or has_rooms):
            continue

        m_pm = PM_CODE_RE.search(s)
        m_code = UNIT_CODE_RE.search(s)
        code = None
        property_type = None
        if m_pm:
            prefix = m_pm.group(1).upper().replace("Ё", "Е")
            num = m_pm.group(2)
            if prefix.startswith(("ПМ", "PM", "ПАРКО")):
                code = f"ПМ-{int(num):02d}"
                property_type = "parking"
            elif prefix.startswith(("ГАРАЖ", "GARAGE")):
                code = f"Г-{int(num)}"
                property_type = "garage"
            elif prefix.startswith(("СКЛАД", "STORAGE")):
                code = f"Склад {int(num)}"
                property_type = "storage"
            elif prefix.startswith(("МАГАЗИН", "SHOP")):
                code = f"Магазин {int(num)}"
                property_type = "shop"
        elif m_code:
            bare = _unit_code_from_match(m_code)
            # Reject кодове като само 2 цифри (фалшиви dimension fragments).
            # UNIT_CODE_RE вече изисква 3+ цифри за bare codes, но осигуряваме отново.
            if not bare or (bare.isdigit() and len(bare) < 3):
                continue
            code = bare
            property_type = "apartment"
        if not code:
            continue

        rooms = None
        m_rooms = ROOMS_RE.search(s)
        if m_rooms:
            rooms = int(m_rooms.group(1))

        areas: list[float] = []
        for m in AREA_RE.finditer(s):
            v = _to_float(m.group(1))
            if v and 5 < v < 2000:
                areas.append(v)

        area_pure = areas[0] if len(areas) >= 1 else None
        area_common = areas[1] if len(areas) >= 2 else None
        area_total = areas[2] if len(areas) >= 3 else None
        if area_total is None and area_pure and area_common:
            area_total = round(area_pure + area_common, 2)
        raw_area = areas[-1] if len(areas) >= 4 else area_total

        floor = None
        if property_type == "apartment" and code.isdigit():
            try:
                floor = int(code[0]) if len(code) == 3 else int(code[:-2])
            except ValueError:
                floor = None

        prices: list[float] = []
        for m in PRICE_RE.finditer(s):
            v = _to_float(m.group(1))
            if v and v > 100:
                prices.append(v)
        start_price = prices[0] if prices else None
        final_price = prices[1] if len(prices) >= 2 else None

        warnings = []
        if area_pure and area_pure > 500:
            warnings.append("Подозрително голяма чиста площ")
        if prices and prices[0] < 1000:
            warnings.append("Подозрително ниска цена")

        confidence = 0.6
        if rooms and areas and prices:
            confidence = 0.9
        elif areas or prices:
            confidence = 0.75

        results.append({
            "source_file_id": source_file_id,
            "source_ref": f"line:{ln + 1}",
            "code": code,
            "property_type": property_type,
            "floor": floor,
            "rooms": rooms,
            "raw_area": raw_area,
            "area_pure": area_pure,
            "area_common": area_common,
            "area_total": area_total,
            "ideal_parts_area": None,
            "exposure": None,
            "start_price_basis": start_price,
            "final_price_basis": final_price,
            "buyer_name_raw": None,
            "status_guess": "available",
            "confidence": round(confidence, 2),
            "warnings": warnings,
            "approved": confidence >= 0.8,
        })
    return results


def extract_buyers(text: str, source_file_id: str) -> list[dict]:
    results: list[dict] = []
    for ln, line in enumerate(text.splitlines()):
        s = line.strip()
        if len(s) < 5:
            continue
        email_m = EMAIL_RE.search(s)
        phone_m = PHONE_RE.search(s)
        # Strip contact bits *before* looking for a unit code — otherwise the
        # trailing digits of a phone number can falsely mimic a unit code.
        stripped = s
        if phone_m:
            stripped = stripped.replace(phone_m.group(0), " ")
        if email_m:
            stripped = stripped.replace(email_m.group(0), " ")

        unit_m = PM_CODE_RE.search(stripped) or UNIT_CODE_RE.search(stripped)
        if not (email_m or phone_m or unit_m):
            continue

        linked_unit = None
        if unit_m:
            if unit_m.re is PM_CODE_RE:
                prefix = unit_m.group(1).upper()
                num = unit_m.group(2)
                if prefix.startswith(("ПМ", "PM", "ПАРКО")):
                    linked_unit = f"ПМ-{int(num):02d}"
                elif prefix.startswith("ГАРАЖ"):
                    linked_unit = f"Г-{int(num)}"
            else:
                linked_unit = _unit_code_from_match(unit_m)
            stripped = stripped.replace(unit_m.group(0), " ")

        name = re.sub(r"[\|;,\t]+", " ", stripped).strip()
        name = re.sub(r"\s{2,}", " ", name).strip(" -·—.").strip()
        # Keep only name-like tokens (letters + dots/hyphens)
        name_tokens = [t for t in name.split() if re.search(r"[A-Za-zА-Яа-я]", t)]
        name = " ".join(name_tokens).strip()

        if len(name.split()) < 2 and not (email_m or phone_m):
            continue

        confidence = 0.5
        if name and email_m and phone_m and linked_unit:
            confidence = 0.95
        elif name and (email_m or phone_m):
            confidence = 0.8
        elif name and linked_unit:
            confidence = 0.7

        warnings = []
        if not name:
            warnings.append("Липсва разпознато име")

        results.append({
            "source_file_id": source_file_id,
            "source_ref": f"line:{ln + 1}",
            "name": name or "(неизвестен)",
            "phone": phone_m.group(0).strip() if phone_m else None,
            "email": email_m.group(0).strip() if email_m else None,
            "relation": "Купувач",
            "linked_unit_code": linked_unit,
            "confidence": round(confidence, 2),
            "warnings": warnings,
            "approved": confidence >= 0.8,
        })
    return results


# ---------- conflict detection ----------
def _detect_conflicts(units: list[dict], buyers: list[dict]) -> list[dict]:
    conflicts: list[dict] = []
    by_code: dict[str, list[dict]] = {}
    for u in units:
        by_code.setdefault(u["code"], []).append(u)
    for code, rows in by_code.items():
        if len(rows) > 1:
            # Same unit appearing more than once — possibly contradictory values
            areas = {r["area_total"] for r in rows if r.get("area_total") is not None}
            prices = {r["start_price_basis"] for r in rows if r.get("start_price_basis") is not None}
            if len(areas) > 1 or len(prices) > 1:
                conflicts.append({
                    "type": "duplicate_unit_code",
                    "code": code,
                    "description": f"Обект '{code}' се среща в {len(rows)} реда с различни стойности",
                    "severity": "critical",
                })
            else:
                conflicts.append({
                    "type": "duplicate_unit_code",
                    "code": code,
                    "description": f"Обект '{code}' се повтаря",
                    "severity": "warning",
                })

    known_codes = set(by_code.keys())
    for b in buyers:
        if b.get("linked_unit_code") and b["linked_unit_code"] not in known_codes:
            conflicts.append({
                "type": "buyer_unknown_unit",
                "code": b["linked_unit_code"],
                "description": f"Купувач '{b['name']}' е свързан към непознат код '{b['linked_unit_code']}'",
                "severity": "warning",
            })

    unknown_rows = [u for u in units if u["confidence"] < 0.45]
    if unknown_rows:
        conflicts.append({
            "type": "low_confidence_rows",
            "code": None,
            "description": f"{len(unknown_rows)} реда са с ниска увереност",
            "severity": "warning",
        })
    return conflicts


# ---------- orchestrator ----------
ALLOWED_DOCUMENT_TYPES = (
    "area_schedule", "pricing", "buyers",
    "floor_plan", "summary_table", "mixed", "unknown",
)
_UNIT_TYPES = ("apartment", "parking", "garage", "storage", "shop")


def analyze_files(files: list[dict]) -> dict:
    """``files`` is a list of {id, original_name, content: bytes, document_type_override?: str}.

    Ако `document_type_override` е зададен, той има приоритет над AI класификацията.
    Returns the full extracted payload ready for the review screen.
    """
    units: list[dict] = []
    buyers: list[dict] = []
    floor_plans: list[dict] = []
    per_file: list[dict] = []
    warnings: list[str] = []

    for f in files:
        fid = f["id"]
        name = f["original_name"]
        content: bytes = f["content"]
        override = (f.get("document_type_override") or "").strip() or None
        if override and override not in ALLOWED_DOCUMENT_TYPES:
            override = None  # игнорираме невалидни override-и

        try:
            pages = _extract_text_per_page(content)
        except Exception as e:
            warnings.append(f"{name}: неуспешно четене ({e})")
            continue

        full_text = "\n".join(pages)
        ai_type, ai_conf = classify(name, full_text)
        doc_type = override if override else ai_type

        units_before = len(units)
        buyers_before = len(buyers)

        if doc_type in ("area_schedule", "pricing", "mixed"):
            units.extend(extract_units_from_area_schedule(full_text, fid))
        if doc_type in ("buyers", "mixed"):
            buyers.extend(extract_buyers(full_text, fid))
        if doc_type == "summary_table":
            warnings.append(
                f"{name}: обобщаваща таблица — използва се за validation, не генерира units."
            )
        if doc_type == "unknown":
            warnings.append(
                f"{name}: типът не може да бъде разпознат — ръчно укажете document type и пуснете „Разпознай отново“."
            )
        if doc_type in ("floor_plan", "summary_table", "unknown"):
            floor_plans.extend(_extract_floor_plan_pages(fid, pages, doc_type))

        # Per-file breakdown of what this document contributed.
        file_units = units[units_before:]
        file_buyers_count = len(buyers) - buyers_before
        per_file.append({
            "id": fid,
            "pages_count": len(pages),
            "document_type_guess": ai_type,
            "document_type_guess_confidence": ai_conf,
            "document_type_applied": doc_type,
            "document_type_override": override,
            "extracted_units_count": len(file_units),
            "extracted_units_by_type": {
                t: sum(1 for u in file_units if u.get("property_type") == t)
                for t in _UNIT_TYPES
            },
            "extracted_buyers_count": file_buyers_count,
        })

    conflicts = _detect_conflicts(units, buyers)
    by_type_totals = {
        t: sum(1 for u in units if u.get("property_type") == t) for t in _UNIT_TYPES
    }
    sanity_warnings = _diagnose_missing(units, buyers, per_file, by_type_totals)

    # Global match между floor-plan pages и area-schedule units.
    unit_codes_all = {u["code"] for u in units if u.get("code")}
    placed_codes: set = set()
    linked_pages = 0
    for page in floor_plans:
        detected = page.get("detected_unit_codes", [])
        matched = [c for c in detected if c in unit_codes_all]
        unmatched = [c for c in detected if c not in unit_codes_all]
        page["matched_unit_codes"] = matched
        page["unmatched_detected_codes"] = unmatched
        placed_codes.update(matched)
        if page.get("detected_floor_guess") is not None and matched:
            linked_pages += 1
    unplaced_units = sorted(unit_codes_all - placed_codes)

    summary = {
        "files_count": len(files),
        "candidate_units_count": len(units),
        "candidate_buyers_count": len(buyers),
        "candidate_floor_plans_count": len(floor_plans),
        "conflicts_count": len(conflicts),
        "unknown_rows_count": sum(1 for u in units if u["confidence"] < 0.45),
        "by_type": by_type_totals,
        "sanity_warnings": sanity_warnings,
        "floor_plan_pages_total": len(floor_plans),
        "auto_linked_pages": linked_pages,
        "unlinked_pages": len(floor_plans) - linked_pages,
        "unplaced_units": len(unplaced_units),
        "unplaced_unit_codes": unplaced_units[:50],
    }

    return {
        "per_file": per_file,
        "candidate_units": units,
        "candidate_buyers": buyers,
        "candidate_floor_plans": floor_plans,
        "conflicts": conflicts,
        "warnings": warnings,
        "summary": summary,
    }


def _extract_floor_plan_pages(file_id: str, pages: list[str], doc_type: str) -> list[dict]:
    """Page-by-page обработка на архитектурен/план PDF.

    За всяка страница извлича detected unit codes, guessing на етажа (от explicit
    текстов hint или от hundreds-group кластериране на apartment кодовете) и
    подготвя payload за review (review_status='pending').
    """
    out: list[dict] = []
    for idx, page_text in enumerate(pages):
        # Apartment кодове (strict: ≥3 цифри) + specialni
        apt_codes: set[str] = set()
        for m in UNIT_CODE_RE.finditer(page_text):
            bare = _unit_code_from_match(m)
            if bare and bare.isdigit() and 100 <= int(bare) <= 9999:
                apt_codes.add(bare)
        pm_codes: list[str] = []
        for m in PM_CODE_RE.finditer(page_text):
            prefix = m.group(1).upper()
            try:
                num = int(m.group(2))
            except (TypeError, ValueError):
                continue
            if prefix.startswith(("ПМ", "PM", "ПАРКО")):
                pm_codes.append(f"ПМ-{num:02d}")
            elif prefix.startswith(("ГАРАЖ", "GARAGE")):
                pm_codes.append(f"Г-{num}")
            elif prefix.startswith(("СКЛАД", "STORAGE")):
                pm_codes.append(f"Склад {num}")
            elif prefix.startswith(("МАГАЗИН", "SHOP")):
                pm_codes.append(f"Магазин {num}")
        detected = sorted(apt_codes) + sorted(set(pm_codes))

        # Floor guess
        floor_guess = None
        floor_conf = 0.0
        warn: list[str] = []

        # 1) Explicit текст („Етаж 3", „3 ет.")
        explicit: list[int] = []
        for m in FLOOR_EXPLICIT_RE.finditer(page_text):
            g = m.group(1) or m.group(2)
            if g and 0 < int(g) < 50:
                explicit.append(int(g))
        if explicit:
            # Ако се повтаря → още по-сигурно
            from collections import Counter
            top, cnt = Counter(explicit).most_common(1)[0]
            floor_guess = top
            floor_conf = min(0.95, 0.65 + 0.1 * cnt)

        # 2) Fallback: hundreds-group на apartment кодовете
        if floor_guess is None and apt_codes:
            from collections import Counter
            hundreds = [int(c) // 100 for c in apt_codes if 100 <= int(c) <= 9999]
            if hundreds:
                top, cnt = Counter(hundreds).most_common(1)[0]
                ratio = cnt / len(hundreds)
                if cnt >= 2 and ratio >= 0.6:
                    # 1xx → етаж 2 (партер = 1); 2xx → 3; и т.н.
                    floor_guess = top + 1
                    floor_conf = round(min(0.75, 0.35 + 0.08 * cnt), 2)

        if floor_guess is None:
            warn.append("Не може да се определи етажът автоматично")
        elif floor_conf < 0.5:
            warn.append("Етажната оценка е с ниска сигурност")

        excerpt = " ".join(page_text.split())[:180]
        out.append({
            "source_file_id": file_id,
            "page_number": idx + 1,
            "page_text_excerpt": excerpt,
            "detected_unit_codes": detected,
            "detected_floor_guess": floor_guess,
            "floor_guess_confidence": round(floor_conf, 2),
            "warnings": warn,
            "document_type": doc_type,
            # Review-layer props
            "floor": floor_guess,  # reusable override field
            "matched_unit_codes": [],
            "unmatched_detected_codes": [],
            "review_status": "pending",
        })
    return out


def _diagnose_missing(
    units: list[dict],
    buyers: list[dict],
    per_file: list[dict],
    by_type: dict[str, int],
) -> list[str]:
    """Soft sanity warnings за вероятно непълен import."""
    out: list[str] = []
    total = len(units)

    # Практически floor-и: ако видим area_schedule/pricing/mixed, но 0 апартамента → подозрително.
    primary_files = [
        pf for pf in per_file
        if pf.get("document_type_applied") in ("area_schedule", "pricing", "mixed")
    ]
    if primary_files and by_type["apartment"] == 0:
        out.append(
            "Няма разпознати апартаменти в primary документите — проверете document types."
        )
    if primary_files and by_type["parking"] == 0:
        out.append(
            "Не са разпознати паркоместа — възможно липсва отделен списък или PM кодовете са в нестандартен формат."
        )
    if primary_files and by_type["storage"] == 0:
        out.append(
            "Не са разпознати складове — проверете дали в PDF-ите има ред „Склад N“."
        )
    if primary_files and by_type["garage"] == 0:
        out.append(
            "Не са разпознати гаражи — ако проектът няма гаражи, може да игнорирате това предупреждение."
        )

    # Scale sanity: малки проекти ≥15 апартамента, общо ≥45 units е типично за ново строителство.
    if primary_files:
        if by_type["apartment"] < 15:
            out.append(
                f"Разпознати са само {by_type['apartment']} апартамента — очакват се поне 15 за типичен проект."
            )
        if total < 45:
            out.append(
                f"Общо {total} обекта — вероятно import-ът е непълен. Проверете document types и missing categories."
            )

    # Info bits for non-primary files
    for pf in per_file:
        dt = pf.get("document_type_applied")
        if dt == "floor_plan":
            out.append(
                f"„{pf['id'][:8]}…“ е етажен план — не генерира units (expected)."
            )
        elif dt == "summary_table":
            out.append(
                f"„{pf['id'][:8]}…“ е обобщителна таблица — validation only."
            )
    return out


__all__ = ["analyze_files", "classify", "_render_page_thumbnail", "ALLOWED_DOCUMENT_TYPES"]
