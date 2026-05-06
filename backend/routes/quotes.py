"""Quote Builder — generate, edit, send, PDF-export property offers."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from auth.dependencies import require_roles, require_staff
from constants import Role, PropertyStatus, PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS_BG
from db import get_db
from models import QuoteCreate, QuoteUpdate, QuoteStatusUpdate
from routes.audit import log_action
from services.payment_schemes import build_scheme, apply_stop_deposit, recalc_amounts

router = APIRouter(tags=["quotes"])

PAYMENT_TERMS_DEFAULT = (
    "Условия на плащане:\n"
    "1. Капаро 10% от стойността при подписване на предварителен договор — задържа имота за 30 дни.\n"
    "2. Първа вноска 40% при подписване на нотариален акт.\n"
    "3. Окончателно плащане 50% при предаване на имота (Акт 16)."
)
DELIVERY_TERMS_DEFAULT = (
    "Срок и предаване:\n"
    "- Очакван срок за завършване: ___ (попълни според проекта)\n"
    "- Предаването се извършва с протокол + Акт 16.\n"
    "- Купувачът има право на 2 огледа преди приемане."
)
VALIDITY_DEFAULT_DAYS = 14

# A property is offerable only if its status is one of these:
_OFFERABLE_STATUSES = {
    PropertyStatus.AVAILABLE.value,
    PropertyStatus.RESERVED_ZERO_DEPOSIT.value,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _floor_label(floor: Optional[int]) -> str:
    if floor is None:
        return ""
    if floor > 0:
        return f"Етаж {floor}"
    if floor == 0:
        return "Партер"
    return "Сутерен"


def _property_label(prop: dict) -> str:
    type_label = PROPERTY_TYPE_LABELS_BG.get(prop.get("property_type"), "")
    fl = _floor_label(prop.get("floor"))
    parts = [type_label, fl]
    rooms = prop.get("rooms")
    if rooms:
        parts.append(f"{rooms} стаи")
    return ", ".join([p for p in parts if p])


def _build_item_from_property(prop: dict) -> dict:
    list_price = float(prop.get("list_price") or prop.get("base_price") or 0)
    return {
        "property_id": prop["id"],
        "property_code": prop.get("code") or "",
        "property_label": _property_label(prop),
        "property_type": prop.get("property_type"),
        "floor": prop.get("floor"),
        "f1_area": prop.get("raw_area"),
        "f2_area": prop.get("ideal_parts_area"),
        "total_area": prop.get("area_total"),
        "list_price": list_price,
        "custom_price": list_price,
        "discount_percent": 0.0,
        "notes": "",
    }


def _calc_totals(quote: dict) -> dict:
    """Compute subtotal, vat_amount, total based on items + vat_mode + discount_amount."""
    subtotal = 0.0
    for it in quote.get("items", []):
        price = float(it.get("custom_price") or 0)
        disc = float(it.get("discount_percent") or 0)
        line = price * (1 - disc / 100.0)
        subtotal += line
    discount_amount = float(quote.get("discount_amount") or 0)
    base = max(subtotal - discount_amount, 0.0)
    vat_rate = float(quote.get("vat_rate") or 20.0)
    if quote.get("vat_mode") == "with_vat":
        vat_amount = round(base * (vat_rate / 100.0), 2)
        total = round(base + vat_amount, 2)
    else:
        vat_amount = 0.0
        total = round(base, 2)
    quote["subtotal"] = round(subtotal, 2)
    quote["vat_amount"] = vat_amount
    quote["total"] = total
    return quote


async def _next_quote_number(db) -> str:
    year = _now().year
    prefix = f"Q-{year}-"
    # Count existing quotes for current year
    last = await db.quotes.find(
        {"quote_number": {"$regex": f"^{prefix}"}},
        {"_id": 0, "quote_number": 1},
    ).sort("quote_number", -1).limit(1).to_list(1)
    if last:
        try:
            last_num = int(last[0]["quote_number"].split("-")[-1])
        except Exception:
            last_num = 0
    else:
        last_num = 0
    return f"{prefix}{last_num + 1:03d}"


def _public(q: dict) -> dict:
    q.pop("_id", None)
    return q


# ---------- LIST / GET ----------
@router.get("/quotes")
async def list_quotes(
    status: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    _=Depends(require_staff()),
):
    db = get_db()
    q: dict = {}
    if status and status.lower() != "all":
        q["status"] = status
    if client_id:
        q["client_id"] = client_id
    if search:
        s = search.strip()
        if s:
            q["$or"] = [
                {"quote_number": {"$regex": s, "$options": "i"}},
                {"client_name": {"$regex": s, "$options": "i"}},
            ]
    rows = await db.quotes.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.get("/quotes/{quote_id}")
async def get_quote(quote_id: str, _=Depends(require_staff())):
    db = get_db()
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Офертата не е намерена")
    return q


# ---------- CREATE ----------
@router.post("/quotes")
async def create_quote(payload: QuoteCreate, user=Depends(require_staff())):
    db = get_db()
    # Validate client
    client = await db.users.find_one(
        {"id": payload.client_id, "role": "client"},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "is_active": 1},
    )
    if not client:
        raise HTTPException(status_code=400, detail="Клиентът не е намерен")

    # Validate properties
    props = await db.properties.find(
        {"id": {"$in": payload.property_ids}}, {"_id": 0}
    ).to_list(200)
    if len(props) != len(payload.property_ids):
        raise HTTPException(status_code=400, detail="Един или повече имоти не са намерени")
    for p in props:
        if p.get("status") not in _OFFERABLE_STATUSES:
            label = PROPERTY_STATUS_LABELS.get(p.get("status"), p.get("status"))
            raise HTTPException(
                status_code=400,
                detail=f"Имот {p.get('code')} не е свободен (статус: {label})",
            )

    # Build quote
    items = [_build_item_from_property(p) for p in props]
    valid_until = payload.valid_until or (
        (_now() + timedelta(days=VALIDITY_DEFAULT_DAYS)).date().isoformat()
    )
    quote: dict = {
        "id": str(uuid.uuid4()),
        "quote_number": await _next_quote_number(db),
        "client_id": client["id"],
        "client_name": client.get("name") or "",
        "client_email": client.get("email"),
        "client_phone": client.get("phone"),
        "items": items,
        "vat_mode": payload.vat_mode,
        "vat_rate": 20.0,
        "discount_amount": float(payload.discount_amount or 0),
        "valid_until": valid_until,
        "payment_terms": PAYMENT_TERMS_DEFAULT,
        "delivery_terms": DELIVERY_TERMS_DEFAULT,
        "additional_notes": payload.additional_notes or "",
        "status": "draft",
        "created_by": user["id"],
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "sent_at": None,
        "pdf_generated_count": 0,
    }
    _calc_totals(quote)

    # Build payment schedule from chosen scheme + stop deposit
    project = await db.projects.find_one(
        {"id": props[0].get("project_id")} if props else {"id": "__none__"},
        {"_id": 0, "expected_act_2_date": 1, "construction_duration_months": 1},
    ) if props else None
    schedule = build_scheme(payload.scheme_type, quote["total"], project)
    if payload.stop_deposit_amount and payload.stop_deposit_amount > 0:
        apply_stop_deposit(schedule, float(payload.stop_deposit_amount))
    quote["payment_schedule"] = schedule

    await db.quotes.insert_one(quote)
    await log_action(
        user["id"], "quote_create", "quote", quote["id"],
        {"quote_number": quote["quote_number"], "client_id": client["id"], "items": len(items)},
    )
    return _public(quote)


# ---------- UPDATE (draft only) ----------
@router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, payload: QuoteUpdate, user=Depends(require_staff())):
    db = get_db()
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Офертата не е намерена")
    if q.get("status") != "draft":
        raise HTTPException(
            status_code=400,
            detail="Изпратени или финализирани оферти не могат да се редактират.",
        )

    # Apply per-item overrides (merge by property_id)
    if payload.items is not None:
        items_by_id = {it["property_id"]: it for it in q.get("items", [])}
        new_items = []
        for inp in payload.items:
            base = items_by_id.get(inp.property_id)
            if base is None:
                # New item — load property and snapshot
                prop = await db.properties.find_one({"id": inp.property_id}, {"_id": 0})
                if not prop:
                    raise HTTPException(status_code=400, detail=f"Имот {inp.property_id} не е намерен")
                if prop.get("status") not in _OFFERABLE_STATUSES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Имот {prop.get('code')} не е свободен",
                    )
                base = _build_item_from_property(prop)
            if inp.custom_price is not None:
                base["custom_price"] = float(inp.custom_price)
            if inp.discount_percent is not None:
                base["discount_percent"] = float(inp.discount_percent)
            if inp.notes is not None:
                base["notes"] = inp.notes
            new_items.append(base)
        q["items"] = new_items

    for field in ("vat_mode", "vat_rate", "discount_amount", "valid_until",
                  "payment_terms", "delivery_terms", "additional_notes"):
        v = getattr(payload, field)
        if v is not None:
            q[field] = v

    _calc_totals(q)

    # Payment schedule handling
    if payload.reset_schedule_to:
        # Rebuild from template
        first_prop = (q.get("items") or [{}])[0]
        proj_id = None
        if first_prop:
            full = await db.properties.find_one(
                {"id": first_prop.get("property_id")}, {"_id": 0, "project_id": 1}
            )
            proj_id = (full or {}).get("project_id")
        project = await db.projects.find_one(
            {"id": proj_id}, {"_id": 0, "expected_act_2_date": 1}
        ) if proj_id else None
        new_sched = build_scheme(payload.reset_schedule_to, q["total"], project)
        # Preserve existing stop_deposit if not explicitly reset
        if payload.payment_schedule and payload.payment_schedule.stop_deposit_amount is not None:
            apply_stop_deposit(new_sched, float(payload.payment_schedule.stop_deposit_amount))
        q["payment_schedule"] = new_sched
    elif payload.payment_schedule is not None:
        # Manual edits to schedule
        sched = q.get("payment_schedule") or build_scheme("custom", q["total"], None)
        sched_in = payload.payment_schedule
        if sched_in.stages is not None:
            sched["stages"] = [s.model_dump() for s in sched_in.stages]
        if sched_in.expected_act_2_date is not None:
            sched["expected_act_2_date"] = sched_in.expected_act_2_date
        if sched_in.notes is not None:
            sched["notes"] = sched_in.notes
        if sched_in.scheme_type is not None:
            sched["scheme_type"] = sched_in.scheme_type
        # Recalc amounts from total + percents (admin edits percents)
        recalc_amounts(sched, q["total"])
        if sched_in.stop_deposit_amount is not None:
            apply_stop_deposit(sched, float(sched_in.stop_deposit_amount))
        q["payment_schedule"] = sched
    else:
        # Items/total may have changed → recalc existing schedule amounts
        if q.get("payment_schedule"):
            recalc_amounts(q["payment_schedule"], q["total"])

    q["updated_at"] = _now_iso()

    await db.quotes.update_one({"id": quote_id}, {"$set": q})
    await log_action(user["id"], "quote_update", "quote", quote_id, {"quote_number": q.get("quote_number")})
    return _public(q)


# ---------- STATUS TRANSITIONS ----------
_VALID_TRANSITIONS = {
    "draft": {"sent", "rejected"},
    "sent": {"accepted", "rejected", "expired"},
    "accepted": set(),
    "rejected": set(),
    "expired": set(),
}


@router.patch("/quotes/{quote_id}/status")
async def update_quote_status(quote_id: str, payload: QuoteStatusUpdate, user=Depends(require_staff())):
    db = get_db()
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Офертата не е намерена")
    cur = q.get("status") or "draft"
    if payload.status not in _VALID_TRANSITIONS.get(cur, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Невалиден преход: {cur} → {payload.status}",
        )
    changes: dict = {"status": payload.status, "updated_at": _now_iso()}
    if payload.status == "sent":
        changes["sent_at"] = _now_iso()
    await db.quotes.update_one({"id": quote_id}, {"$set": changes})
    await log_action(
        user["id"], "quote_status_change", "quote", quote_id,
        {"from": cur, "to": payload.status, "quote_number": q.get("quote_number")},
    )
    updated = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    return updated


# ---------- DELETE (super_admin, draft only) ----------
@router.delete("/quotes/{quote_id}")
async def delete_quote(
    quote_id: str,
    user=Depends(require_roles(Role.SUPER_ADMIN.value, Role.ADMIN.value)),
):
    db = get_db()
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0, "status": 1, "quote_number": 1})
    if not q:
        raise HTTPException(status_code=404, detail="Офертата не е намерена")
    if q.get("status") != "draft":
        raise HTTPException(
            status_code=400,
            detail="Само чернови оферти могат да бъдат изтрити. Маркирайте като 'отказана'.",
        )
    await db.quotes.delete_one({"id": quote_id})
    await log_action(user["id"], "quote_delete", "quote", quote_id, {"quote_number": q.get("quote_number")})
    return {"ok": True, "id": quote_id}


# ---------- PDF ----------
@router.get("/quotes/{quote_id}/pdf")
async def quote_pdf(quote_id: str, user=Depends(require_staff())):
    db = get_db()
    q = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Офертата не е намерена")

    # Lazy import (heavy)
    from services.quote_pdf import build_quote_pdf
    pdf_bytes = build_quote_pdf(q)

    await db.quotes.update_one(
        {"id": quote_id},
        {"$inc": {"pdf_generated_count": 1}, "$set": {"updated_at": _now_iso()}},
    )
    await log_action(
        user["id"], "quote_pdf_generated", "quote", quote_id,
        {"quote_number": q.get("quote_number")},
    )

    safe_client = (q.get("client_name") or "client")
    # Transliterate to ASCII for Content-Disposition (latin-1 only); use UTF-8 filename* fallback
    import re
    ascii_name = re.sub(r"[^A-Za-z0-9_.-]", "_", safe_client.encode("ascii", "ignore").decode())[:50] or "client"
    filename_ascii = f"oferta-{q.get('quote_number')}-{ascii_name}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_ascii}"'
        },
    )
