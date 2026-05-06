"""Deals — per-client multi-property sale records (super_admin only).

A Deal aggregates one or more properties for one client, with payment
distribution (bank/non-bank/combined), invoice/proforma split, and two
payment schedule buckets.

Replaces the legacy `Sale` model.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from auth.dependencies import require_roles
from constants import Role, PropertyStatus, PROPERTY_TYPE_LABELS_BG
from db import get_db
from models import (
    DealCreate,
    DealUpdate,
    DealRegenerateScheduleRequest,
    DealStagePaymentUpdate,
    DealCancelRequest,
    DealDeleteRequest,
)
from routes.audit import log_action
from services.payment_schemes import build_scheme

router = APIRouter(tags=["deals"])

_OFFERABLE_STATUSES = {
    PropertyStatus.AVAILABLE.value,
    PropertyStatus.RESERVED_ZERO_DEPOSIT.value,
    PropertyStatus.RESERVED_PAID_DEPOSIT.value,
}


def _super_admin_dep():
    return require_roles(Role.SUPER_ADMIN.value)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _floor_label(floor: Optional[int]) -> str:
    if floor is None:
        return ""
    if floor > 0:
        return f"Етаж {floor}"
    if floor == 0:
        return "Партер"
    return "Сутерен"


def _build_property_label(prop: dict) -> str:
    type_label = PROPERTY_TYPE_LABELS_BG.get(prop.get("property_type"), "")
    fl = _floor_label(prop.get("floor"))
    parts = [type_label, fl]
    if prop.get("code"):
        parts.append(prop["code"])
    return ", ".join([p for p in parts if p])


def _serialize(d: dict) -> dict:
    d.pop("_id", None)
    return d


def _calc_totals(items: List[dict], vat_rate: float) -> dict:
    total_with_vat = round(sum(float(i.get("agreed_price") or 0) for i in items), 2)
    rate = float(vat_rate or 20.0)
    if rate > 0:
        total_without_vat = round(total_with_vat / (1 + rate / 100.0), 2)
    else:
        total_without_vat = total_with_vat
    vat_amount = round(total_with_vat - total_without_vat, 2)
    return {
        "total_with_vat": total_with_vat,
        "total_without_vat": total_without_vat,
        "vat_amount": vat_amount,
        "vat_rate": rate,
    }


def _bucket_basis(deal: dict, bucket: str) -> float:
    """Pick the amount basis for a bucket based on payment_mode."""
    pm = deal.get("payment_mode") or {}
    mode = pm.get("mode") or "without_bank"
    total = float(deal.get("total_with_vat") or 0)
    if bucket == "bank":
        if mode == "with_bank":
            return total
        if mode == "combined":
            return float(pm.get("bank_amount") or 0)
        return 0.0
    # non_bank
    if mode == "without_bank":
        return total
    if mode == "combined":
        return float(pm.get("non_bank_amount") or 0)
    return 0.0


def _stages_from_scheme(scheme: dict, bucket: str) -> List[dict]:
    stages: List[dict] = []
    for s in scheme.get("stages") or []:
        stages.append({
            "order": int(s.get("order") or 0),
            "label": s.get("label") or "",
            "percent": float(s.get("percent") or 0),
            "amount": float(s.get("amount") or 0),
            "expected_date": s.get("expected_date"),
            "milestone_type": s.get("milestone_type"),
            "bucket": bucket,
            "is_paid": False,
            "paid_date": None,
            "paid_amount": None,
            "payment_notes": None,
        })
    return stages


async def _next_deal_number(db) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"D-{year}-"
    last = await db.deals.find(
        {"deal_number": {"$regex": f"^{prefix}"}},
        {"_id": 0, "deal_number": 1},
    ).sort("deal_number", -1).limit(1).to_list(1)
    if last:
        try:
            n = int(last[0]["deal_number"].split("-")[-1])
        except Exception:
            n = 0
    else:
        n = 0
    return f"{prefix}{n + 1:03d}"


# ---------- LIST / GET ----------
@router.get("/deals")
async def list_deals(
    status: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    _=Depends(_super_admin_dep()),
):
    db = get_db()
    q: dict = {}
    if status and status.lower() != "all":
        q["status"] = status
    if client_id:
        q["client_id"] = client_id
    if project_id:
        prop_ids = await db.properties.find(
            {"project_id": project_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
        q["items.property_id"] = {"$in": [p["id"] for p in prop_ids]}
    rows = await db.deals.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return rows


@router.get("/deals/by-client/{client_id}")
async def deals_by_client(client_id: str, _=Depends(_super_admin_dep())):
    db = get_db()
    rows = await db.deals.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return rows


@router.get("/deals/{deal_id}")
async def get_deal(deal_id: str, _=Depends(_super_admin_dep())):
    db = get_db()
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Сделката не е намерена")
    return deal


# ---------- CREATE ----------
async def _create_deal_internal(
    db,
    *,
    client_id: str,
    property_ids: List[str],
    agreed_prices: Optional[dict],
    payment_mode_str: str,
    source_quote_id: Optional[str],
    user_id: str,
) -> dict:
    """Shared deal creation helper (used by POST /deals and quote→deal converter)."""
    client = await db.users.find_one(
        {"id": client_id, "role": "client"},
        {"_id": 0, "id": 1, "name": 1, "is_active": 1},
    )
    if not client:
        raise HTTPException(status_code=400, detail="Клиентът не е намерен")
    if client.get("is_active") is False:
        raise HTTPException(status_code=400, detail="Клиентът е деактивиран")

    if not property_ids:
        raise HTTPException(status_code=400, detail="Поне един имот е задължителен")

    props = await db.properties.find(
        {"id": {"$in": property_ids}}, {"_id": 0}
    ).to_list(200)
    if len(props) != len(property_ids):
        raise HTTPException(status_code=400, detail="Един или повече имоти не са намерени")

    # Validate each property: must be offerable AND not in active deal
    for p in props:
        if p.get("status") not in _OFFERABLE_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Имот {p.get('code')} не е свободен (статус: {p.get('status')})",
            )
        existing = await db.deals.find_one(
            {"items.property_id": p["id"], "status": "active"},
            {"_id": 0, "id": 1, "deal_number": 1},
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Имот {p.get('code')} вече е в активна сделка ({existing['deal_number']})",
            )

    items: List[dict] = []
    for p in props:
        list_price = float(p.get("list_price") or p.get("base_price") or 0)
        agreed = list_price
        if agreed_prices and p["id"] in agreed_prices:
            try:
                agreed = float(agreed_prices[p["id"]])
            except Exception:
                agreed = list_price
        items.append({
            "property_id": p["id"],
            "property_code": p.get("code") or "",
            "property_label": _build_property_label(p),
            "property_type": p.get("property_type"),
            "total_area": p.get("area_total"),
            "list_price": list_price,
            "agreed_price": round(agreed, 2),
            "notes": None,
        })

    totals = _calc_totals(items, 20.0)

    # Snapshot project ACT2 from first property
    first_proj_id = props[0].get("project_id") if props else None
    project = await db.projects.find_one(
        {"id": first_proj_id},
        {"_id": 0, "expected_act_2_date": 1, "construction_duration_months": 1},
    ) if first_proj_id else None

    deal: dict = {
        "id": str(uuid.uuid4()),
        "deal_number": await _next_deal_number(db),
        "client_id": client["id"],
        "client_name": client.get("name") or "",
        "items": items,
        **totals,
        "payment_mode": {
            "mode": payment_mode_str,
            "bank_amount": 0.0,
            "non_bank_amount": 0.0,
            "invoice_amount": 0.0,
            "proforma_amount": 0.0,
        },
        "bank_stages": [],
        "non_bank_stages": [],
        "expected_act_2_date": (project or {}).get("expected_act_2_date"),
        "construction_duration_months": int((project or {}).get("construction_duration_months") or 30),
        "status": "active",
        "source_quote_id": source_quote_id,
        "notes": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "created_by": user_id,
        "last_modified_by": None,
        "cancelled_at": None,
        "cancelled_reason": None,
    }
    await db.deals.insert_one(deal)

    # Mark properties as sold + set buyer_id (assign client)
    for p in props:
        await db.properties.update_one(
            {"id": p["id"]},
            {"$set": {"status": "sold", "buyer_id": client["id"]}},
        )
        await db.status_history.insert_one({
            "id": str(uuid.uuid4()),
            "property_id": p["id"],
            "from_status": p.get("status"),
            "to_status": "sold",
            "actor_id": user_id,
            "at": _now_iso(),
            "context": {"deal_id": deal["id"], "deal_number": deal["deal_number"]},
        })

    await log_action(
        user_id, "deal_create", "deal", deal["id"],
        {
            "deal_number": deal["deal_number"],
            "client_name": deal["client_name"],
            "items_count": len(items),
            "total_with_vat": deal["total_with_vat"],
            "payment_mode": payment_mode_str,
            "source_quote_id": source_quote_id,
        },
    )
    return deal


@router.post("/deals")
async def create_deal(payload: DealCreate, user=Depends(_super_admin_dep())):
    db = get_db()
    deal = await _create_deal_internal(
        db,
        client_id=payload.client_id,
        property_ids=payload.property_ids,
        agreed_prices=payload.agreed_prices,
        payment_mode_str=payload.payment_mode,
        source_quote_id=payload.source_quote_id,
        user_id=user["id"],
    )
    return _serialize(deal)


# ---------- UPDATE ----------
@router.put("/deals/{deal_id}")
async def update_deal(deal_id: str, payload: DealUpdate, user=Depends(_super_admin_dep())):
    db = get_db()
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Сделката не е намерена")
    if deal.get("status") != "active":
        raise HTTPException(status_code=400, detail="Само активни сделки могат да се редактират")

    old_snapshot = {
        "total_with_vat": deal.get("total_with_vat"),
        "payment_mode": deal.get("payment_mode"),
    }

    # Apply per-item agreed_price overrides
    if payload.items is not None:
        items_by_id = {it["property_id"]: it for it in deal.get("items", [])}
        for inp in payload.items:
            base = items_by_id.get(inp.property_id)
            if not base:
                raise HTTPException(
                    status_code=400,
                    detail=f"Имот {inp.property_id} не е част от тази сделка",
                )
            if inp.agreed_price is not None:
                base["agreed_price"] = round(float(inp.agreed_price), 2)
            if inp.notes is not None:
                base["notes"] = inp.notes

    # Payment mode changes
    if payload.payment_mode is not None:
        pm = dict(deal.get("payment_mode") or {})
        for f in ("mode", "bank_amount", "non_bank_amount", "invoice_amount", "proforma_amount"):
            v = getattr(payload.payment_mode, f)
            if v is not None:
                pm[f] = v
        deal["payment_mode"] = pm

    # Stages — full replacement per bucket
    if payload.bank_stages is not None:
        deal["bank_stages"] = [
            {**s.model_dump(), "bucket": "bank"} for s in payload.bank_stages
        ]
    if payload.non_bank_stages is not None:
        deal["non_bank_stages"] = [
            {**s.model_dump(), "bucket": "non_bank"} for s in payload.non_bank_stages
        ]

    if payload.notes is not None:
        deal["notes"] = payload.notes
    if payload.expected_act_2_date is not None:
        deal["expected_act_2_date"] = payload.expected_act_2_date
    if payload.construction_duration_months is not None:
        deal["construction_duration_months"] = int(payload.construction_duration_months)

    vat_rate = float(payload.vat_rate) if payload.vat_rate is not None else float(deal.get("vat_rate") or 20.0)
    totals = _calc_totals(deal.get("items") or [], vat_rate)
    deal.update(totals)

    deal["updated_at"] = _now_iso()
    deal["last_modified_by"] = user["id"]

    await db.deals.update_one({"id": deal_id}, {"$set": deal})

    await log_action(
        user["id"], "deal_update", "deal", deal_id,
        {
            "deal_number": deal.get("deal_number"),
            "old": old_snapshot,
            "new_total_with_vat": deal["total_with_vat"],
        },
    )
    return _serialize(deal)


# ---------- REGENERATE SCHEDULE ----------
@router.post("/deals/{deal_id}/regenerate-schedule")
async def regenerate_schedule(
    deal_id: str,
    payload: DealRegenerateScheduleRequest,
    user=Depends(_super_admin_dep()),
):
    db = get_db()
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Сделката не е намерена")
    if deal.get("status") != "active":
        raise HTTPException(status_code=400, detail="Само активни сделки могат да се редактират")

    project = None
    if deal.get("expected_act_2_date"):
        project = {"expected_act_2_date": deal["expected_act_2_date"]}

    def _regen_for(bucket: str) -> List[dict]:
        basis = _bucket_basis(deal, bucket)
        # Preserve paid stages (by order) so admin doesn't lose payment info
        existing = deal.get("bank_stages" if bucket == "bank" else "non_bank_stages") or []
        paid_by_order = {int(s.get("order") or 0): s for s in existing if s.get("is_paid")}
        scheme = build_scheme(payload.preset, basis, project)
        new_stages = _stages_from_scheme(scheme, bucket)
        for s in new_stages:
            paid = paid_by_order.get(int(s.get("order") or 0))
            if paid:
                s["is_paid"] = True
                s["paid_date"] = paid.get("paid_date")
                s["paid_amount"] = paid.get("paid_amount")
                s["payment_notes"] = paid.get("payment_notes")
        return new_stages

    changes: dict = {"updated_at": _now_iso(), "last_modified_by": user["id"]}
    if payload.bucket in ("bank", "both"):
        changes["bank_stages"] = _regen_for("bank")
    if payload.bucket in ("non_bank", "both"):
        changes["non_bank_stages"] = _regen_for("non_bank")

    await db.deals.update_one({"id": deal_id}, {"$set": changes})
    await log_action(
        user["id"], "deal_regenerate_schedule", "deal", deal_id,
        {
            "deal_number": deal.get("deal_number"),
            "bucket": payload.bucket,
            "preset": payload.preset,
        },
    )
    updated = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    return _serialize(updated)


# ---------- STAGE PAYMENT ----------
@router.patch("/deals/{deal_id}/stages/{stage_order}/payment")
async def update_stage_payment(
    deal_id: str,
    stage_order: int,
    payload: DealStagePaymentUpdate,
    user=Depends(_super_admin_dep()),
):
    db = get_db()
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Сделката не е намерена")
    if deal.get("status") != "active":
        raise HTTPException(status_code=400, detail="Само активни сделки могат да се редактират")

    bucket_key = "bank_stages" if payload.bucket == "bank" else "non_bank_stages"
    stages = deal.get(bucket_key) or []
    target = next((s for s in stages if int(s.get("order") or 0) == int(stage_order)), None)
    if not target:
        raise HTTPException(status_code=404, detail="Етапът не е намерен")

    old = {k: target.get(k) for k in ("is_paid", "paid_date", "paid_amount", "payment_notes")}

    if payload.is_paid is not None:
        target["is_paid"] = bool(payload.is_paid)
    if payload.paid_date is not None:
        target["paid_date"] = payload.paid_date
    if payload.paid_amount is not None:
        target["paid_amount"] = round(float(payload.paid_amount), 2)
    if payload.payment_notes is not None:
        target["payment_notes"] = payload.payment_notes

    await db.deals.update_one(
        {"id": deal_id},
        {"$set": {
            bucket_key: stages,
            "updated_at": _now_iso(),
            "last_modified_by": user["id"],
        }},
    )
    await log_action(
        user["id"], "deal_stage_payment_update", "deal", deal_id,
        {
            "deal_number": deal.get("deal_number"),
            "bucket": payload.bucket,
            "stage_order": stage_order,
            "old": old,
            "new": {k: target.get(k) for k in ("is_paid", "paid_date", "paid_amount", "payment_notes")},
        },
    )
    updated = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    return _serialize(updated)


# ---------- CANCEL ----------
@router.post("/deals/{deal_id}/cancel")
async def cancel_deal(
    deal_id: str,
    payload: DealCancelRequest = Body(...),
    user=Depends(_super_admin_dep()),
):
    db = get_db()
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Сделката не е намерена")
    if deal.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Сделката вече е отказана")

    # Release properties
    for it in deal.get("items") or []:
        prop = await db.properties.find_one({"id": it.get("property_id")}, {"_id": 0, "status": 1})
        old_status = (prop or {}).get("status")
        await db.properties.update_one(
            {"id": it.get("property_id")},
            {"$set": {"status": "available", "buyer_id": None}},
        )
        if old_status:
            await db.status_history.insert_one({
                "id": str(uuid.uuid4()),
                "property_id": it.get("property_id"),
                "from_status": old_status,
                "to_status": "available",
                "actor_id": user["id"],
                "at": _now_iso(),
                "context": {"deal_id": deal_id, "reason": "deal_cancelled"},
            })

    await db.deals.update_one(
        {"id": deal_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": _now_iso(),
            "cancelled_reason": payload.reason,
            "updated_at": _now_iso(),
            "last_modified_by": user["id"],
        }},
    )
    await log_action(
        user["id"], "deal_cancel", "deal", deal_id,
        {
            "deal_number": deal.get("deal_number"),
            "client_name": deal.get("client_name"),
            "reason": payload.reason,
            "released_properties": [it.get("property_code") for it in deal.get("items") or []],
        },
    )
    updated = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    return _serialize(updated)


# ---------- DELETE (only cancelled) ----------
@router.delete("/deals/{deal_id}")
async def delete_deal(
    deal_id: str,
    payload: DealDeleteRequest = Body(...),
    user=Depends(_super_admin_dep()),
):
    db = get_db()
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Сделката не е намерена")
    if deal.get("status") != "cancelled":
        raise HTTPException(
            status_code=400,
            detail="Само отказани сделки могат да бъдат изтрити изцяло",
        )
    await db.deals.delete_one({"id": deal_id})
    await log_action(
        user["id"], "deal_delete", "deal", deal_id,
        {
            "deal_number": deal.get("deal_number"),
            "reason": payload.reason,
        },
    )
    return {"deleted": True, "id": deal_id}
