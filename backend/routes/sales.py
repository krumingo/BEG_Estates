"""Sales — financial record per sold property (super_admin only).

A Sale tracks the real cash flow for a property:
- invoice_amount: declared revenue (with VAT, official invoice)
- proforma_amount: undeclared (proforma invoice, not tax document)
- real_total = invoice_amount + proforma_amount

The buyer never sees this layer — they only see the contract price (Quote total).
"""
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from auth.dependencies import require_roles
from constants import Role, PropertyStatus
from db import get_db
from models import SaleCreate, SaleUpdate, SaleDelete
from routes.audit import log_action
from services.sale_calculations import (
    calculate_invoice_breakdown,
    calculate_real_total,
    validate_sale_amounts,
)

router = APIRouter(tags=["sales"])

_SOLD_LIKE = {PropertyStatus.SOLD.value, "compensation"}


def _super_admin_dep():
    return require_roles(Role.SUPER_ADMIN.value)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_iso() -> str:
    return date.today().isoformat()


def _floor_label(floor: Optional[int]) -> str:
    if floor is None:
        return ""
    if floor > 0:
        return f"Етаж {floor}"
    if floor == 0:
        return "Партер"
    return "Сутерен"


def _build_property_label(prop: dict) -> str:
    from constants import PROPERTY_TYPE_LABELS_BG
    type_label = PROPERTY_TYPE_LABELS_BG.get(prop.get("property_type"), "")
    fl = _floor_label(prop.get("floor"))
    parts = [type_label, fl]
    if prop.get("code"):
        parts.append(prop["code"])
    return ", ".join([p for p in parts if p])


def _serialize(sale: dict) -> dict:
    sale.pop("_id", None)
    return sale


# ---------- LIST / GET ----------
@router.get("/sales")
async def list_sales(
    project_id: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    active: str = Query("true"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    _=Depends(_super_admin_dep()),
):
    db = get_db()
    q: dict = {}
    a = (active or "true").lower()
    if a == "true":
        q["is_active"] = True
    elif a == "false":
        q["is_active"] = False
    if client_id:
        q["client_id"] = client_id
    if date_from:
        q["sale_date"] = {**q.get("sale_date", {}), "$gte": date_from}
    if date_to:
        q["sale_date"] = {**q.get("sale_date", {}), "$lte": date_to}
    if project_id:
        # Filter by property → project
        prop_ids = await db.properties.find(
            {"project_id": project_id}, {"_id": 0, "id": 1}
        ).to_list(2000)
        q["property_id"] = {"$in": [p["id"] for p in prop_ids]}
    rows = await db.sales.find(q, {"_id": 0}).sort("sale_date", -1).to_list(2000)
    return rows


@router.get("/sales/by-property/{property_id}")
async def get_sale_by_property(property_id: str, _=Depends(_super_admin_dep())):
    db = get_db()
    sale = await db.sales.find_one(
        {"property_id": property_id, "is_active": True}, {"_id": 0}
    )
    return sale  # may be None


@router.get("/sales/{sale_id}")
async def get_sale(sale_id: str, _=Depends(_super_admin_dep())):
    db = get_db()
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Продажбата не е намерена")
    prop = await db.properties.find_one({"id": sale.get("property_id")}, {"_id": 0})
    client = await db.users.find_one(
        {"id": sale.get("client_id"), "role": "client"},
        {"_id": 0, "password_hash": 0, "totp_secret": 0},
    )
    return {"sale": sale, "property": prop, "client": client}


# ---------- CREATE ----------
@router.post("/sales")
async def create_sale(payload: SaleCreate, user=Depends(_super_admin_dep())):
    db = get_db()
    prop = await db.properties.find_one({"id": payload.property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")
    if prop.get("status") not in _SOLD_LIKE:
        raise HTTPException(
            status_code=400,
            detail="Имотът не е маркиран като продаден или обезщетение",
        )

    client = await db.users.find_one(
        {"id": payload.client_id, "role": "client"}, {"_id": 0, "id": 1, "name": 1}
    )
    if not client:
        raise HTTPException(status_code=400, detail="Клиентът не е намерен")

    # Only one active sale per property
    existing_active = await db.sales.find_one(
        {"property_id": payload.property_id, "is_active": True},
        {"_id": 0, "id": 1},
    )
    if existing_active:
        raise HTTPException(
            status_code=400,
            detail="Вече съществува активна продажба за този имот",
        )

    # Validate amounts vs listprice
    listprice = float(prop.get("list_price") or 0)
    val = validate_sale_amounts(listprice, payload.invoice_amount, payload.proforma_amount)
    if not val["valid"]:
        raise HTTPException(status_code=400, detail={"errors": val["errors"]})

    breakdown = calculate_invoice_breakdown(payload.invoice_amount, payload.vat_rate)
    real_total = calculate_real_total(payload.invoice_amount, payload.proforma_amount)

    sale: dict = {
        "id": str(uuid.uuid4()),
        "property_id": prop["id"],
        "client_id": client["id"],
        "property_code": prop.get("code") or "",
        "property_label": _build_property_label(prop),
        "client_name": client.get("name") or "",
        "real_total": real_total,
        "invoice_amount": round(float(payload.invoice_amount), 2),
        "proforma_amount": round(float(payload.proforma_amount or 0), 2),
        "vat_rate": float(payload.vat_rate),
        "invoice_vat": breakdown["vat_amount"],
        "invoice_net": breakdown["net"],
        "sale_date": payload.sale_date or _today_iso(),
        "notes": payload.notes,
        "source_quote_id": payload.source_quote_id,
        "is_active": True,
        "deleted_at": None,
        "deleted_reason": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "created_by": user["id"],
        "last_modified_by": None,
    }
    await db.sales.insert_one(sale)
    await log_action(
        user["id"], "sale_created", "sale", sale["id"],
        {
            "property_code": sale["property_code"],
            "client_name": sale["client_name"],
            "invoice_amount": sale["invoice_amount"],
            "proforma_amount": sale["proforma_amount"],
            "real_total": sale["real_total"],
            "vat_rate": sale["vat_rate"],
        },
    )
    return {"sale": _serialize(sale), "warnings": val["warnings"]}


# ---------- UPDATE ----------
@router.put("/sales/{sale_id}")
async def update_sale(sale_id: str, payload: SaleUpdate, user=Depends(_super_admin_dep())):
    db = get_db()
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Продажбата не е намерена")
    if not sale.get("is_active", True):
        raise HTTPException(status_code=400, detail="Архивирани продажби не могат да се редактират")

    new_invoice = payload.invoice_amount if payload.invoice_amount is not None else sale["invoice_amount"]
    new_proforma = payload.proforma_amount if payload.proforma_amount is not None else sale.get("proforma_amount", 0)
    new_vat_rate = payload.vat_rate if payload.vat_rate is not None else sale.get("vat_rate", 20.0)

    # Re-validate vs listprice
    prop = await db.properties.find_one(
        {"id": sale["property_id"]}, {"_id": 0, "list_price": 1}
    )
    listprice = float((prop or {}).get("list_price") or 0)
    val = validate_sale_amounts(listprice, new_invoice, new_proforma)
    if not val["valid"]:
        raise HTTPException(status_code=400, detail={"errors": val["errors"]})

    breakdown = calculate_invoice_breakdown(new_invoice, new_vat_rate)
    real_total = calculate_real_total(new_invoice, new_proforma)

    old_snapshot = {
        "invoice_amount": sale["invoice_amount"],
        "proforma_amount": sale.get("proforma_amount", 0),
        "vat_rate": sale.get("vat_rate", 20.0),
        "real_total": sale.get("real_total", 0),
    }
    changes: dict = {
        "invoice_amount": round(float(new_invoice), 2),
        "proforma_amount": round(float(new_proforma or 0), 2),
        "vat_rate": float(new_vat_rate),
        "invoice_vat": breakdown["vat_amount"],
        "invoice_net": breakdown["net"],
        "real_total": real_total,
        "updated_at": _now_iso(),
        "last_modified_by": user["id"],
    }
    if payload.sale_date is not None:
        changes["sale_date"] = payload.sale_date
    if payload.notes is not None:
        changes["notes"] = payload.notes

    await db.sales.update_one({"id": sale_id}, {"$set": changes})
    new_snapshot = {
        "invoice_amount": changes["invoice_amount"],
        "proforma_amount": changes["proforma_amount"],
        "vat_rate": changes["vat_rate"],
        "real_total": changes["real_total"],
    }
    await log_action(
        user["id"], "sale_updated", "sale", sale_id,
        {
            "property_code": sale.get("property_code"),
            "old": old_snapshot,
            "new": new_snapshot,
        },
    )
    updated = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    return {"sale": _serialize(updated), "warnings": val["warnings"]}


# ---------- DELETE (soft) ----------
@router.delete("/sales/{sale_id}")
async def delete_sale(
    sale_id: str,
    payload: SaleDelete = Body(...),
    user=Depends(_super_admin_dep()),
):
    db = get_db()
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Продажбата не е намерена")
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {
            "is_active": False,
            "deleted_at": _now_iso(),
            "deleted_reason": payload.reason,
            "updated_at": _now_iso(),
            "last_modified_by": user["id"],
        }},
    )
    await log_action(
        user["id"], "sale_deleted", "sale", sale_id,
        {
            "property_code": sale.get("property_code"),
            "client_name": sale.get("client_name"),
            "reason": payload.reason,
            "real_total_at_deletion": sale.get("real_total"),
        },
    )
    return {"deleted": True, "id": sale_id}


# ---------- INTERNAL HELPERS used by status hook ----------
async def auto_create_sale_for_property(prop: dict, user_id: Optional[str]) -> Optional[dict]:
    """Auto-create default Sale when property becomes sold-like.

    - Skip if no buyer_id set.
    - Skip if active Sale already exists.
    - Compensation properties → invoice=0, proforma=0 (not revenue).
    - Sold properties → invoice=list_price, proforma=0 (full declared by default).
    """
    db = get_db()
    if not prop.get("buyer_id"):
        return None
    existing = await db.sales.find_one(
        {"property_id": prop["id"], "is_active": True}, {"_id": 0, "id": 1}
    )
    if existing:
        return None
    is_compensation = prop.get("status") == "compensation"
    listprice = float(prop.get("list_price") or 0)
    invoice_amount = 0.0 if is_compensation else listprice
    breakdown = calculate_invoice_breakdown(invoice_amount, 20.0)
    sale: dict = {
        "id": str(uuid.uuid4()),
        "property_id": prop["id"],
        "client_id": prop["buyer_id"],
        "property_code": prop.get("code") or "",
        "property_label": _build_property_label(prop),
        "client_name": "",  # filled below
        "real_total": invoice_amount,
        "invoice_amount": invoice_amount,
        "proforma_amount": 0.0,
        "vat_rate": 20.0,
        "invoice_vat": breakdown["vat_amount"],
        "invoice_net": breakdown["net"],
        "sale_date": _today_iso(),
        "notes": ("Авто-създадена при маркиране на имота като продаден"
                  if not is_compensation else
                  "Авто-създадена за обезщетение (без приход)"),
        "source_quote_id": None,
        "is_active": True,
        "deleted_at": None,
        "deleted_reason": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "created_by": user_id or "system",
        "last_modified_by": None,
    }
    client = await db.users.find_one(
        {"id": prop["buyer_id"], "role": "client"}, {"_id": 0, "name": 1}
    )
    if client:
        sale["client_name"] = client.get("name") or ""
    await db.sales.insert_one(sale)
    await log_action(
        user_id, "sale_auto_created", "sale", sale["id"],
        {
            "property_code": sale["property_code"],
            "trigger": "status_change_to_sold_like",
            "is_compensation": is_compensation,
            "invoice_amount": sale["invoice_amount"],
        },
    )
    return sale


async def archive_active_sale_for_property(property_id: str, user_id: Optional[str], reason: str) -> bool:
    """Soft-archive any active Sale when property leaves sold state."""
    db = get_db()
    active = await db.sales.find_one(
        {"property_id": property_id, "is_active": True}, {"_id": 0}
    )
    if not active:
        return False
    await db.sales.update_one(
        {"id": active["id"]},
        {"$set": {
            "is_active": False,
            "deleted_at": _now_iso(),
            "deleted_reason": reason,
            "updated_at": _now_iso(),
            "last_modified_by": user_id,
        }},
    )
    await log_action(
        user_id, "sale_archived_due_to_status_change", "sale", active["id"],
        {
            "property_code": active.get("property_code"),
            "from_status": "sold_like",
            "reason": reason,
            "real_total_at_archive": active.get("real_total"),
        },
    )
    return True
