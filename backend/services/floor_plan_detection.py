"""Floor-plan contour detection & OCR-based matching.

Design goals (intentionally narrow for this package):
- Practical, CPU-only, no external paid AI.
- Accept either a PNG/JPG URL or a PDF URL (rasterise page 1).
- Return bounding-box *suggestions* with a confidence score and an optional
  property match. Never write to the database.
- Graceful degrade: if OCR labels are unreadable, still return contour
  suggestions with a confidence reflecting the uncertainty.
"""
from __future__ import annotations

import io
import math
import re
from typing import Iterable, Optional
from urllib.parse import urlparse

import cv2
import fitz  # PyMuPDF
import numpy as np
import pytesseract
import requests
from PIL import Image


# ---------- IO ----------
def _download_bytes(url: str, timeout: int = 20) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Невалиден URL (само http/https)")
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def _is_pdf(blob: bytes, url: str) -> bool:
    return blob[:4] == b"%PDF" or url.lower().split("?")[0].endswith(".pdf")


def _rasterise(blob: bytes, url: str, dpi: int = 180) -> np.ndarray:
    """Return a numpy BGR image of the plan (page 1 for PDFs)."""
    if _is_pdf(blob, url):
        doc = fitz.open(stream=blob, filetype="pdf")
        try:
            page = doc.load_page(0)
            zoom = dpi / 72.0
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            elif pix.n == 3:
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            else:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            return img
        finally:
            doc.close()
    # Raster formats (png/jpg/webp) via Pillow → numpy BGR
    pil = Image.open(io.BytesIO(blob)).convert("RGB")
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


# ---------- Detection ----------
def _detect_rooms(
    bgr: np.ndarray,
    min_area_ratio: float = 0.01,
    max_area_ratio: float = 0.45,
) -> list[dict]:
    """Find large closed regions that plausibly represent rooms/apartments.

    Pipeline: binarise walls → dilate so walls fully partition the plan →
    connected components on the *interior* → filter by area and aspect ratio.
    Returns bounding boxes in image pixel coordinates.
    """
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # Use a plain threshold for wall pixels — adaptive threshold bleeds on
    # clean printed plans. Black lines on white paper threshold cleanly.
    _, walls_raw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    # Dilate so small gaps in the wall network become fully sealed.
    dilate_k = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    walls = cv2.dilate(walls_raw, dilate_k, iterations=1)
    interior = cv2.bitwise_not(walls)

    num, _labels, stats, _centroids = cv2.connectedComponentsWithStats(interior, connectivity=8)
    img_area = float(w * h)
    suggestions: list[dict] = []
    for i in range(1, num):  # skip label 0 (background after inversion)
        x, y, cw, ch, area = stats[i]
        area_ratio = area / img_area
        if area_ratio < min_area_ratio or area_ratio > max_area_ratio:
            continue
        aspect = cw / max(ch, 1)
        if aspect > 6 or aspect < 1 / 6:
            continue
        if cw > w * 0.94 or ch > h * 0.94:
            continue  # likely the outer canvas
        fill = area / max(cw * ch, 1)
        if fill < 0.35:
            continue
        suggestions.append(
            {
                "x": int(x),
                "y": int(y),
                "width": int(cw),
                "height": int(ch),
                "fill_ratio": float(fill),
                "contour_area": float(area),
            }
        )
    suggestions.sort(key=lambda b: (b["y"] // 40, b["x"]))
    return suggestions


# ---------- OCR & matching ----------
_LABEL_RE = re.compile(r"[A-ZА-ЯЁЙ]{0,3}[\s\.\-]*\d{1,4}", re.UNICODE)


def _normalise_label(s: str) -> str:
    s = (s or "").strip().upper()
    s = s.replace("АП.", "").replace("АП ", "").replace("АП", "")
    s = s.replace("APT.", "").replace("APT", "")
    s = re.sub(r"\s+", "", s)
    # normalise hyphens/dashes
    s = s.replace("—", "-").replace("–", "-")
    return s


def _ocr_box(
    gray: np.ndarray, box: dict, pad: int = 4
) -> tuple[Optional[str], float]:
    x, y, w, h = box["x"], box["y"], box["width"], box["height"]
    H, W = gray.shape[:2]
    x0, y0 = max(x - pad, 0), max(y - pad, 0)
    x1, y1 = min(x + w + pad, W), min(y + h + pad, H)
    crop = gray[y0:y1, x0:x1]
    if crop.size == 0:
        return None, 0.0
    try:
        data = pytesseract.image_to_data(
            crop,
            lang="bul+eng",
            config="--psm 11 -c tessedit_char_whitelist=0123456789АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЮЯabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.- ",
            output_type=pytesseract.Output.DICT,
        )
    except pytesseract.TesseractError:
        return None, 0.0
    best_text: Optional[str] = None
    best_conf = -1.0
    for txt, conf in zip(data.get("text", []), data.get("conf", [])):
        txt = (txt or "").strip()
        if not txt:
            continue
        try:
            c = float(conf)
        except Exception:
            continue
        if c < 40:
            continue
        if not _LABEL_RE.search(txt):
            continue
        if c > best_conf:
            best_conf = c
            best_text = txt
    if best_text is None:
        return None, 0.0
    return _normalise_label(best_text), best_conf / 100.0


def _match_label_to_properties(
    label: Optional[str], properties: list[dict]
) -> tuple[Optional[dict], float, str]:
    """Return (property, match_confidence, reason) for an OCR label."""
    if not label:
        return None, 0.0, "няма OCR етикет"
    label_n = _normalise_label(label)
    if not label_n:
        return None, 0.0, "етикетът не се нормализира"
    # exact code match (case/space-insensitive)
    for p in properties:
        if _normalise_label(p.get("code") or "") == label_n:
            return p, 1.0, f"точно съвпадение с код {p['code']}"
    # suffix match (e.g. OCR reads "А101" but code is "101")
    digits = re.findall(r"\d+", label_n)
    if digits:
        last = digits[-1]
        candidates = [p for p in properties if _normalise_label(p.get("code") or "").endswith(last)]
        if len(candidates) == 1:
            return candidates[0], 0.75, f"опашка '{last}' уникално съвпада с {candidates[0]['code']}"
    return None, 0.0, f"не е намерен имот за етикет '{label}'"


# ---------- Public API ----------
def suggest_contours(image_url: str, properties: list[dict]) -> dict:
    """Orchestrator called by the route handler.

    ``properties`` must already be filtered to the target (project, floor).
    """
    warnings: list[str] = []
    blob = _download_bytes(image_url)
    try:
        bgr = _rasterise(blob, image_url)
    except Exception as e:
        raise ValueError(f"Неуспешен rasterise на файла: {e}")

    raw = _detect_rooms(bgr)
    if not raw:
        warnings.append(
            "Не са открити достатъчно ясни контури. Опитайте с по-чиста схема или map-вайте ръчно."
        )

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    suggestions: list[dict] = []
    used_property_ids: set[str] = set()

    for idx, box in enumerate(raw):
        label, ocr_conf = _ocr_box(gray, box)
        matched, match_conf, reason = (None, 0.0, "")
        if label:
            # Exclude already-used properties so we don't double-assign
            pool = [p for p in properties if p["id"] not in used_property_ids]
            matched, match_conf, reason = _match_label_to_properties(label, pool)

        # Composite confidence: rooms with a trusted OCR label get the boost
        shape_conf = min(1.0, 0.4 + 0.6 * box["fill_ratio"])
        if label and matched:
            confidence = round(min(1.0, 0.35 + 0.5 * match_conf + 0.15 * ocr_conf), 2)
        elif label:
            confidence = round(min(0.65, 0.25 + 0.4 * ocr_conf), 2)
        else:
            confidence = round(shape_conf * 0.5, 2)  # no OCR → capped at 0.5

        if matched:
            used_property_ids.add(matched["id"])

        # Label anchor: centre of the box (floor plans tend to label centrally)
        label_x = box["x"] + box["width"] // 2
        label_y = box["y"] + box["height"] // 2

        suggestions.append(
            {
                "suggestion_id": f"s{idx + 1}",
                "x": box["x"],
                "y": box["y"],
                "width": box["width"],
                "height": box["height"],
                "label_x": label_x,
                "label_y": label_y,
                "confidence": confidence,
                "ocr_label": label,
                "ocr_confidence": round(ocr_conf, 2),
                "suggested_property_id": matched["id"] if matched else None,
                "suggested_code": matched["code"] if matched else None,
                "reason": reason or ("OCR етикет не е намерен" if not label else ""),
            }
        )

    unmatched = [p for p in properties if p["id"] not in used_property_ids]
    if unmatched:
        warnings.append(
            f"{len(unmatched)} имот(а) от този етаж не са автоматично разпознати — свържете ги ръчно."
        )
    if any(s["confidence"] < 0.45 for s in suggestions):
        warnings.append(
            "Някои предложения са с ниска сигурност — прегледайте ги преди запис."
        )

    h, w = bgr.shape[:2]
    return {
        "plan_width": int(w),
        "plan_height": int(h),
        "suggestions": suggestions,
        "unmatched_property_ids": [p["id"] for p in unmatched],
        "unmatched_property_codes": [p.get("code") for p in unmatched if p.get("code")],
        "warnings": warnings,
    }


def pair_suggestions_with_properties(
    suggestions: Iterable[dict], properties_by_id: dict
) -> list[dict]:
    """Helper used by tests — attach the full property dict to each suggestion."""
    out = []
    for s in suggestions:
        p = properties_by_id.get(s.get("suggested_property_id"))
        out.append({**s, "property": p})
    return out


__all__ = ["suggest_contours"]
