"""Projects + properties + buildings routes (public listing + admin CRUD)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth.dependencies import require_staff, get_current_user
from constants import (
    PUBLIC_VISIBLE_STATUSES,
    INTERNAL_STATUSES,
    PUBLIC_PROPERTY_FIELDS,
    STAFF_ROLES,
    PropertyStatus,
    PropertyType,
    ProjectStatus,
)
from db import get_db
from models import (
    ProjectCreate,
    ProjectUpdate,
    PropertyCreate,
    PropertyStatusUpdate,
    PropertyUpdate,
    PropertyFinancePlanUpdate,
    PropertyPaymentCreate,
)
from routes.audit import log_action

router = APIRouter(tags=["projects"])


def _public_property(prop: dict) -> dict:
    """Strip admin-only fields for public consumers."""
    return {k: v for k, v in prop.items() if k in PUBLIC_PROPERTY_FIELDS}


async def _is_staff(request: Request) -> bool:
    """Return True if caller is authenticated as staff; swallow auth errors."""
    try:
        user = await get_current_user(request)
        return user.get("role") in STAFF_ROLES
    except HTTPException:
        return False


def _project_stats(props: list[dict]) -> dict:
    reserved = {
        PropertyStatus.RESERVED_ZERO_DEPOSIT.value,
        PropertyStatus.RESERVED_PAID_DEPOSIT.value,
    }
    return {
        "total": len(props),
        "available": sum(1 for x in props if x["status"] == PropertyStatus.AVAILABLE.value),
        "sold": sum(1 for x in props if x["status"] == PropertyStatus.SOLD.value),
        "reserved": sum(1 for x in props if x["status"] in reserved),
        "compensation": sum(1 for x in props if x["status"] == PropertyStatus.COMPENSATION.value),
    }


# ---------- Public project endpoints ----------
@router.get("/projects")
async def list_projects(request: Request, status: Optional[str] = None):
    db = get_db()
    q: dict = {}
    if status:
        q["status"] = status
    items = await db.projects.find(q, {"_id": 0}).sort("is_primary", -1).to_list(200)
    is_staff = await _is_staff(request)
    for p in items:
        filt = {"project_id": p["id"]}
        if not is_staff:
            filt["status"] = {"$in": list(PUBLIC_VISIBLE_STATUSES)}
        props = await db.properties.find(filt, {"_id": 0, "status": 1}).to_list(2000)
        p["stats"] = _project_stats(props)
    return items


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    db = get_db()
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")
    buildings = await db.buildings.find({"project_id": project_id}, {"_id": 0}).to_list(50)
    updates = (
        await db.project_updates.find({"project_id": project_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(20)
    )
    return {"project": project, "buildings": buildings, "updates": updates}


@router.get("/projects/{project_id}/properties")
async def project_properties(
    project_id: str,
    request: Request,
    property_type: Optional[str] = None,
    floor: Optional[int] = None,
    status: Optional[str] = None,
):
    db = get_db()
    q: dict = {"project_id": project_id}
    if property_type:
        q["property_type"] = property_type
    if floor is not None:
        q["floor"] = floor

    is_staff = await _is_staff(request)
    if is_staff:
        # Staff may filter by any status (including internal)
        if status:
            q["status"] = status
    else:
        # Public caller: status query CANNOT reach internal statuses.
        # If an allowed public status is supplied, honour it; otherwise
        # force the full public-safe set.
        if status and status in PUBLIC_VISIBLE_STATUSES:
            q["status"] = status
        else:
            q["status"] = {"$in": list(PUBLIC_VISIBLE_STATUSES)}

    props = (
        await db.properties.find(q, {"_id": 0})
        .sort([("floor", 1), ("code", 1)])
        .to_list(2000)
    )
    if not is_staff:
        props = [_public_property(p) for p in props]
    return props


@router.get("/properties/{property_id}")
async def get_property(property_id: str, request: Request):
    db = get_db()
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")

    is_staff = await _is_staff(request)
    if not is_staff and prop.get("status") in INTERNAL_STATUSES:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")

    project = await db.projects.find_one({"id": prop["project_id"]}, {"_id": 0})
    linked = (
        await db.properties.find(
            {"id": {"$in": prop.get("linked_unit_ids", [])}}, {"_id": 0}
        ).to_list(20)
        if prop.get("linked_unit_ids")
        else []
    )

    if not is_staff:
        prop = _public_property(prop)
        linked = [_public_property(p) for p in linked]

    # Admin extras (buyer info)
    payload: dict = {"property": prop, "project": project, "linked": linked}
    if is_staff and prop.get("buyer_id"):
        buyer = await db.buyers.find_one({"id": prop["buyer_id"]}, {"_id": 0})
        payload["buyer"] = buyer
    return payload


# ---------- Admin writes ----------
@router.post("/projects")
async def create_project(payload: ProjectCreate, user=Depends(require_staff())):
    db = get_db()
    valid_statuses = {s.value for s in ProjectStatus}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Невалиден статус на проект")

    # slug uniqueness
    existing = await db.projects.find_one({"slug": payload.slug}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Проект с този slug вече съществува")

    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()

    # primary invariant: only one primary project at a time
    if doc.get("is_primary"):
        await db.projects.update_many({"is_primary": True}, {"$set": {"is_primary": False}})

    await db.projects.insert_one(doc)
    await log_action(user["id"], "project_create", "project", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, user=Depends(require_staff())):
    db = get_db()
    existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    changes = payload.model_dump(exclude_unset=True)

    if "status" in changes:
        valid_statuses = {s.value for s in ProjectStatus}
        if changes["status"] not in valid_statuses:
            raise HTTPException(status_code=400, detail="Невалиден статус на проект")

    if "slug" in changes and changes["slug"] != existing.get("slug"):
        dup = await db.projects.find_one(
            {"slug": changes["slug"], "id": {"$ne": project_id}}, {"_id": 0, "id": 1}
        )
        if dup:
            raise HTTPException(status_code=400, detail="Проект с този slug вече съществува")

    if changes.get("is_primary") is True:
        await db.projects.update_many(
            {"is_primary": True, "id": {"$ne": project_id}},
            {"$set": {"is_primary": False}},
        )

    if changes:
        await db.projects.update_one({"id": project_id}, {"$set": changes})
    await log_action(
        user["id"], "project_update", "project", project_id,
        {"fields": list(changes.keys())},
    )

    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return updated


@router.post("/properties")
async def create_property(payload: PropertyCreate, user=Depends(require_staff())):
    db = get_db()

    # 1. project must exist
    project = await db.projects.find_one({"id": payload.project_id}, {"_id": 0, "id": 1})
    if not project:
        raise HTTPException(status_code=400, detail="Проектът не е намерен")

    # 2. building, if provided, must belong to the project
    if payload.building_id:
        building = await db.buildings.find_one(
            {"id": payload.building_id}, {"_id": 0, "project_id": 1}
        )
        if not building:
            raise HTTPException(status_code=400, detail="Сградата не е намерена")
        if building.get("project_id") != payload.project_id:
            raise HTTPException(
                status_code=400, detail="Сградата принадлежи на друг проект"
            )

    # 3. property_type enum
    if payload.property_type not in {t.value for t in PropertyType}:
        raise HTTPException(status_code=400, detail="Невалиден тип имот")

    # 4. status enum (default AVAILABLE if not passed)
    status = payload.status or PropertyStatus.AVAILABLE.value
    if status not in {s.value for s in PropertyStatus}:
        raise HTTPException(status_code=400, detail="Невалиден статус")

    # 5. buyer_id, if provided, must exist and belong to same project
    buyer_id = payload.buyer_id or None
    if buyer_id:
        buyer = await db.buyers.find_one({"id": buyer_id}, {"_id": 0, "project_id": 1})
        if not buyer:
            raise HTTPException(status_code=400, detail="Купувачът не е намерен")
        if buyer.get("project_id") and buyer["project_id"] != payload.project_id:
            raise HTTPException(
                status_code=400, detail="Купувачът принадлежи на друг проект"
            )

    # 6. duplicate code within project
    dup = await db.properties.find_one(
        {"project_id": payload.project_id, "code": payload.code},
        {"_id": 0, "id": 1},
    )
    if dup:
        raise HTTPException(
            status_code=400, detail=f"Обект с код '{payload.code}' вече съществува в този проект"
        )

    base_price = payload.base_price
    list_price = payload.list_price if payload.list_price is not None else base_price

    doc = {
        "id": str(uuid.uuid4()),
        "project_id": payload.project_id,
        "building_id": payload.building_id,
        "code": payload.code,
        "property_type": payload.property_type,
        "floor": payload.floor if payload.floor is not None else 0,
        "rooms": payload.rooms,
        "exposure": payload.exposure,
        "area_pure": payload.area_pure,
        "area_common": payload.area_common,
        "area_total": payload.area_total,
        "ideal_parts_area": payload.ideal_parts_area,
        "raw_area": payload.raw_area,
        "price_per_sqm": payload.price_per_sqm,
        "base_price": base_price,
        "list_price": list_price,
        "negotiated_price": None,
        "reservation_price": None,
        "final_contract_price": None,
        "description": payload.description or "",
        "plan_url": payload.plan_url,
        "gallery": payload.gallery or [],
        "status": status,
        "buyer_id": buyer_id,
        "admin_notes": payload.admin_notes or "",
        # manual-created properties have no source reference
        "source_ref": None,
        "linked_unit_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.properties.insert_one(doc)
    await log_action(
        user["id"], "property_create", "property", doc["id"],
        {"code": doc["code"], "project_id": doc["project_id"]},
    )
    doc.pop("_id", None)
    return doc


@router.patch("/properties/{property_id}/status")
async def update_property_status(
    property_id: str, payload: PropertyStatusUpdate, user=Depends(require_staff())
):
    db = get_db()
    if payload.status not in {s.value for s in PropertyStatus}:
        raise HTTPException(status_code=400, detail="Невалиден статус")
    existing = await db.properties.find_one({"id": property_id}, {"status": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")
    await db.properties.update_one(
        {"id": property_id}, {"$set": {"status": payload.status}}
    )
    await db.status_history.insert_one(
        {
            "id": str(uuid.uuid4()),
            "property_id": property_id,
            "from_status": existing.get("status"),
            "to_status": payload.status,
            "actor_id": user["id"],
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await log_action(
        user["id"], "property_status_change", "property", property_id,
        {"from": existing.get("status"), "to": payload.status},
    )
    return {"ok": True}


@router.patch("/properties/{property_id}")
async def update_property(
    property_id: str, payload: PropertyUpdate, user=Depends(require_staff())
):
    db = get_db()
    existing = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")

    changes = payload.model_dump(exclude_unset=True)

    if "status" in changes and changes["status"] not in {s.value for s in PropertyStatus}:
        raise HTTPException(status_code=400, detail="Невалиден статус")

    if "property_type" in changes and changes["property_type"] not in {t.value for t in PropertyType}:
        raise HTTPException(status_code=400, detail="Невалиден тип имот")

    # buyer_id validation — allow null to detach; if provided, must exist & same project
    if "buyer_id" in changes:
        bid = changes["buyer_id"]
        if bid:
            buyer = await db.buyers.find_one({"id": bid}, {"_id": 0, "project_id": 1})
            if not buyer:
                raise HTTPException(status_code=400, detail="Купувачът не е намерен")
            if buyer.get("project_id") and buyer["project_id"] != existing.get("project_id"):
                raise HTTPException(
                    status_code=400,
                    detail="Купувачът принадлежи на друг проект",
                )

    old_status = existing.get("status")
    new_status = changes.get("status")

    if changes:
        await db.properties.update_one({"id": property_id}, {"$set": changes})

    # record status change consistently with status-only endpoint
    if new_status and new_status != old_status:
        await db.status_history.insert_one(
            {
                "id": str(uuid.uuid4()),
                "property_id": property_id,
                "from_status": old_status,
                "to_status": new_status,
                "actor_id": user["id"],
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )

    await log_action(
        user["id"], "property_edit", "property", property_id,
        {"fields": list(changes.keys())},
    )

    updated = await db.properties.find_one({"id": property_id}, {"_id": 0})
    return updated


# ---------- Admin helpers ----------
@router.get("/buyers")
async def list_buyers(_=Depends(require_staff())):
    db = get_db()
    return await db.buyers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/property-statuses")
async def list_statuses(request: Request):
    """Helper — public callers see only public-safe statuses; staff see all."""
    from constants import PROPERTY_STATUS_LABELS
    is_staff = await _is_staff(request)
    items = [{"value": k, "label": v} for k, v in PROPERTY_STATUS_LABELS.items()]
    if not is_staff:
        items = [x for x in items if x["value"] in PUBLIC_VISIBLE_STATUSES]
    return items


# ---------- Property finance (deal view) ----------
_INSTALLMENT_PAID = "платено"
_INSTALLMENT_PENDING = "предстоящо"


def _parse_iso_date(value):
    """Best-effort parse of an ISO-ish string into a date; returns None on failure."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except Exception:
        return None


@router.get("/portfolio-metrics")
async def properties_portfolio_metrics(
    forecast_cost_per_rzp: Optional[float] = None,
    project_id: Optional[str] = None,
    user=Depends(require_staff()),
):
    """Portfolio-level pricing & margin metrics.

    Compensation properties are never treated as revenue. The *including compensation area*
    variant only adds their `raw_area` to the denominator so the dilution effect is visible.
    """
    db = get_db()
    q: dict = {}
    if project_id:
        q["project_id"] = project_id
    props = await db.properties.find(
        q,
        {
            "_id": 0,
            "id": 1,
            "code": 1,
            "status": 1,
            "raw_area": 1,
            "list_price": 1,
            "base_price": 1,
            "final_contract_price": 1,
        },
    ).to_list(5000)

    comp_status = PropertyStatus.COMPENSATION.value

    def _raw(p):
        try:
            return float(p.get("raw_area") or 0)
        except Exception:
            return 0.0

    def _final(p):
        try:
            return float(p.get("final_contract_price") or 0)
        except Exception:
            return 0.0

    def _start(p):
        lp = p.get("list_price")
        bp = p.get("base_price")
        try:
            if lp is not None and float(lp or 0) > 0:
                return float(lp)
        except Exception:
            pass
        try:
            if bp is not None and float(bp or 0) > 0:
                return float(bp)
        except Exception:
            pass
        return 0.0

    # --- Sets ---
    non_comp = [p for p in props if p.get("status") != comp_status]
    comp = [p for p in props if p.get("status") == comp_status]
    # Revenue set: non-compensation with final price > 0 AND valid raw_area
    revenue_set = [p for p in non_comp if _final(p) > 0 and _raw(p) > 0]
    # Start-price set: non-compensation with a start basis AND valid raw_area
    start_set = [p for p in non_comp if _start(p) > 0 and _raw(p) > 0]

    revenue_numerator = sum(_final(p) for p in revenue_set)
    revenue_denominator_excl = sum(_raw(p) for p in revenue_set)
    compensation_area_total = sum(_raw(p) for p in comp)
    # *Including compensation area*: keep the same revenue numerator,
    # but add compensation raw_area to the denominator.
    revenue_denominator_incl = revenue_denominator_excl + compensation_area_total

    def _ratio(n, d):
        return round(n / d, 2) if d > 0 else None

    portfolio_avg_price_rzp_excluding_compensation_area = _ratio(
        revenue_numerator, revenue_denominator_excl
    )
    portfolio_avg_price_rzp_including_compensation_area = _ratio(
        revenue_numerator, revenue_denominator_incl
    )
    portfolio_avg_final_price_rzp_excluding_compensation_area = (
        portfolio_avg_price_rzp_excluding_compensation_area
    )

    compensation_effect_on_avg_rzp = None
    if (
        portfolio_avg_price_rzp_excluding_compensation_area is not None
        and portfolio_avg_price_rzp_including_compensation_area is not None
    ):
        compensation_effect_on_avg_rzp = round(
            portfolio_avg_price_rzp_excluding_compensation_area
            - portfolio_avg_price_rzp_including_compensation_area,
            2,
        )

    start_numerator = sum(_start(p) for p in start_set)
    start_denominator = sum(_raw(p) for p in start_set)
    portfolio_avg_start_price_rzp = _ratio(start_numerator, start_denominator)

    start_to_final_rzp_delta = None
    if (
        portfolio_avg_final_price_rzp_excluding_compensation_area is not None
        and portfolio_avg_start_price_rzp is not None
    ):
        start_to_final_rzp_delta = round(
            portfolio_avg_final_price_rzp_excluding_compensation_area
            - portfolio_avg_start_price_rzp,
            2,
        )

    # --- Forecast margin block ---
    fc = None
    try:
        if forecast_cost_per_rzp is not None:
            fc_val = float(forecast_cost_per_rzp)
            if fc_val >= 0:
                fc = fc_val
    except Exception:
        fc = None

    portfolio_forecast_cost_total_excluding_compensation = None
    portfolio_forecast_margin_total_excluding_compensation = None
    portfolio_forecast_margin_percent_excluding_compensation = None
    portfolio_forecast_cost_total_including_compensation_area = None

    if fc is not None:
        portfolio_forecast_cost_total_excluding_compensation = round(
            fc * revenue_denominator_excl, 2
        )
        portfolio_forecast_cost_total_including_compensation_area = round(
            fc * revenue_denominator_incl, 2
        )
        portfolio_forecast_margin_total_excluding_compensation = round(
            revenue_numerator
            - portfolio_forecast_cost_total_excluding_compensation,
            2,
        )
        if revenue_numerator > 0:
            portfolio_forecast_margin_percent_excluding_compensation = round(
                (portfolio_forecast_margin_total_excluding_compensation / revenue_numerator)
                * 100.0,
                2,
            )

    return {
        "project_id": project_id,
        "forecast_cost_per_rzp": fc,
        "counts": {
            "total_properties": len(props),
            "revenue_units_count": len(revenue_set),
            "start_priced_units_count": len(start_set),
            "compensation_units_count": len(comp),
        },
        # --- Clean revenue average RZP ---
        "portfolio_avg_price_rzp_excluding_compensation_area":
            portfolio_avg_price_rzp_excluding_compensation_area,
        "portfolio_avg_price_rzp_including_compensation_area":
            portfolio_avg_price_rzp_including_compensation_area,
        "portfolio_avg_final_price_rzp_excluding_compensation_area":
            portfolio_avg_final_price_rzp_excluding_compensation_area,
        "compensation_area_total": round(compensation_area_total, 2),
        "compensation_units_count": len(comp),
        "compensation_effect_on_avg_rzp": compensation_effect_on_avg_rzp,
        # --- Start vs final ---
        "portfolio_avg_start_price_rzp": portfolio_avg_start_price_rzp,
        "start_to_final_rzp_delta": start_to_final_rzp_delta,
        # --- Margin forecast ---
        "portfolio_forecast_cost_total_excluding_compensation":
            portfolio_forecast_cost_total_excluding_compensation,
        "portfolio_forecast_margin_total_excluding_compensation":
            portfolio_forecast_margin_total_excluding_compensation,
        "portfolio_forecast_margin_percent_excluding_compensation":
            portfolio_forecast_margin_percent_excluding_compensation,
        "portfolio_forecast_cost_total_including_compensation_area":
            portfolio_forecast_cost_total_including_compensation_area,
    }


@router.get("/properties/{property_id}/finance-summary")
async def property_finance_summary(
    property_id: str,
    forecast_cost_per_rzp: Optional[float] = None,
    user=Depends(require_staff()),
):
    db = get_db()
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")

    plan = await db.payment_plans.find_one({"property_id": property_id}, {"_id": 0})
    installments = (
        await db.payment_installments.find({"property_id": property_id}, {"_id": 0})
        .sort([("due_date", 1), ("number", 1)])
        .to_list(500)
    )
    payments = (
        await db.payments.find({"property_id": property_id}, {"_id": 0})
        .sort("paid_at", 1)
        .to_list(500)
    )
    buyer = None
    if prop.get("buyer_id"):
        buyer = await db.buyers.find_one({"id": prop["buyer_id"]}, {"_id": 0})

    final_price = float(prop.get("final_contract_price") or 0)
    deposit_amount = float(prop.get("reservation_price") or 0)
    paid_total = sum(float(p.get("amount") or 0) for p in payments)

    unpaid = sorted(
        [i for i in installments if i.get("status") != _INSTALLMENT_PAID],
        key=lambda x: (x.get("due_date") or "", x.get("number") or 0),
    )
    unpaid_total = sum(float(i.get("amount") or 0) for i in unpaid)

    if installments:
        remaining_total = unpaid_total
    else:
        remaining_total = max(final_price - paid_total, 0.0)

    def _sum_next(n):
        return sum(float(i.get("amount") or 0) for i in unpaid[:n])

    today = datetime.now(timezone.utc).date()
    next_due = unpaid[0] if unpaid else None
    next_due_alert = False
    if next_due is not None:
        d = _parse_iso_date(next_due.get("due_date"))
        if d is not None and (d - today).days <= 7:
            next_due_alert = True

    raw_area = prop.get("raw_area")
    try:
        raw_area_f = float(raw_area) if raw_area is not None else 0.0
    except Exception:
        raw_area_f = 0.0
    has_raw = raw_area_f > 0

    # --- Pricing basis & RZP metrics (v0.5) ---
    is_compensation = prop.get("status") == PropertyStatus.COMPENSATION.value
    list_price = prop.get("list_price")
    base_price = prop.get("base_price")
    start_price_basis = None
    if list_price is not None and float(list_price or 0) > 0:
        start_price_basis = float(list_price)
    elif base_price is not None and float(base_price or 0) > 0:
        start_price_basis = float(base_price)

    final_price_basis = final_price if final_price > 0 else None

    avg_price_rzp_start = (
        round(start_price_basis / raw_area_f, 2)
        if (has_raw and start_price_basis is not None)
        else None
    )
    avg_price_rzp_final = (
        round(final_price / raw_area_f, 2)
        if (has_raw and final_price > 0)
        else None
    )
    # Backwards-compat alias used by the existing UI
    avg_price_rzp = avg_price_rzp_final

    forecast_cost = (
        float(forecast_cost_per_rzp) if forecast_cost_per_rzp is not None else None
    )
    forecast_total_cost = (
        round(forecast_cost * raw_area_f, 2)
        if (has_raw and forecast_cost is not None and forecast_cost >= 0)
        else None
    )

    forecast_margin_value = None
    forecast_margin_percent = None
    if forecast_total_cost is not None:
        if is_compensation:
            # Compensation carries no revenue; margin = 0 − cost
            forecast_margin_value = round(0.0 - forecast_total_cost, 2)
            forecast_margin_percent = None
        elif final_price > 0:
            forecast_margin_value = round(final_price - forecast_total_cost, 2)
            forecast_margin_percent = round(
                (forecast_margin_value / final_price) * 100.0, 2
            )
        else:
            # No revenue yet — we still show the cost; margin is undefined
            forecast_margin_value = round(0.0 - forecast_total_cost, 2)
            forecast_margin_percent = None

    return {
        "property_id": property_id,
        "property_code": prop.get("code"),
        "buyer_id": prop.get("buyer_id"),
        "buyer_name": (buyer or {}).get("name"),
        "final_contract_price": final_price,
        "deposit_amount": deposit_amount,
        "payment_scheme_name": (plan or {}).get("scheme_name") or "",
        "installments": [
            {
                "id": i.get("id"),
                "number": i.get("number"),
                "label": i.get("label"),
                "due_date": i.get("due_date"),
                "amount": float(i.get("amount") or 0),
                "status": i.get("status") or _INSTALLMENT_PENDING,
            }
            for i in sorted(installments, key=lambda x: x.get("number") or 0)
        ],
        "payments": [
            {
                "id": p.get("id"),
                "paid_at": p.get("paid_at"),
                "amount": float(p.get("amount") or 0),
                "note": p.get("note") or "",
            }
            for p in payments
        ],
        "paid_total": paid_total,
        "unpaid_total": unpaid_total,
        "remaining_total": remaining_total,
        "next_due_installment": (
            {
                "id": next_due.get("id"),
                "number": next_due.get("number"),
                "label": next_due.get("label"),
                "due_date": next_due.get("due_date"),
                "amount": float(next_due.get("amount") or 0),
                "status": next_due.get("status") or _INSTALLMENT_PENDING,
            }
            if next_due
            else None
        ),
        "next_1_due_sum": _sum_next(1),
        "next_2_due_sum": _sum_next(2),
        "next_3_due_sum": _sum_next(3),
        "next_due_alert": next_due_alert,
        "avg_price_rzp": avg_price_rzp,
        # --- v0.5 pricing & margin ---
        "is_compensation": is_compensation,
        "raw_area": raw_area_f if has_raw else None,
        "start_price_basis": start_price_basis,
        "final_price_basis": final_price_basis,
        "avg_price_rzp_start": avg_price_rzp_start,
        "avg_price_rzp_final": avg_price_rzp_final,
        "forecast_cost_per_rzp": forecast_cost,
        "forecast_total_cost": forecast_total_cost,
        "forecast_margin_value": forecast_margin_value,
        "forecast_margin_percent": forecast_margin_percent,
    }


@router.put("/properties/{property_id}/finance-plan")
async def update_property_finance_plan(
    property_id: str,
    payload: PropertyFinancePlanUpdate,
    user=Depends(require_staff()),
):
    db = get_db()
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")

    # buyer_id validation — optional, but if supplied must exist & same project
    new_buyer_id = payload.buyer_id
    if new_buyer_id:
        buyer = await db.buyers.find_one({"id": new_buyer_id}, {"_id": 0, "project_id": 1})
        if not buyer:
            raise HTTPException(status_code=400, detail="Купувачът не е намерен")
        if buyer.get("project_id") and buyer["project_id"] != prop.get("project_id"):
            raise HTTPException(
                status_code=400, detail="Купувачът принадлежи на друг проект"
            )

    # 1. Patch property financial fields (+ optional buyer reassignment)
    prop_changes: dict = {
        "final_contract_price": float(payload.final_contract_price or 0),
        "reservation_price": float(payload.deposit_amount or 0),
    }
    if new_buyer_id is not None:
        prop_changes["buyer_id"] = new_buyer_id or None
    await db.properties.update_one({"id": property_id}, {"$set": prop_changes})

    # 2. Clean-replace plan + installments for this property
    plan_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    total_amount = sum(float(i.amount or 0) for i in payload.installments)

    await db.payment_plans.delete_many({"property_id": property_id})
    await db.payment_installments.delete_many({"property_id": property_id})

    await db.payment_plans.insert_one(
        {
            "id": plan_id,
            "property_id": property_id,
            "buyer_id": new_buyer_id if new_buyer_id else prop.get("buyer_id"),
            "client_id": None,
            "scheme_name": payload.payment_scheme_name or "",
            "total_amount": total_amount,
            "currency": "EUR",
            "created_at": now_iso,
        }
    )

    for idx, inst in enumerate(sorted(payload.installments, key=lambda x: x.number), start=1):
        status_value = inst.status if inst.status else _INSTALLMENT_PENDING
        await db.payment_installments.insert_one(
            {
                "id": str(uuid.uuid4()),
                "plan_id": plan_id,
                "property_id": property_id,
                "buyer_id": new_buyer_id if new_buyer_id else prop.get("buyer_id"),
                "client_id": None,
                "number": int(inst.number),
                "label": inst.label or "",
                "amount": float(inst.amount or 0),
                "currency": "EUR",
                "due_date": inst.due_date,
                "status": status_value,
                "created_at": now_iso,
            }
        )

    await log_action(
        user["id"],
        "property_finance_plan_update",
        "property",
        property_id,
        {
            "final_contract_price": prop_changes["final_contract_price"],
            "deposit_amount": prop_changes["reservation_price"],
            "installments_count": len(payload.installments),
        },
    )
    return await property_finance_summary(property_id, None, user)  # type: ignore[arg-type]


@router.post("/properties/{property_id}/payments")
async def record_property_payment(
    property_id: str,
    payload: PropertyPaymentCreate,
    user=Depends(require_staff()),
):
    db = get_db()
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0, "id": 1, "buyer_id": 1})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")

    now_iso = datetime.now(timezone.utc).isoformat()
    payment_doc = {
        "id": str(uuid.uuid4()),
        "property_id": property_id,
        "buyer_id": prop.get("buyer_id"),
        "client_id": None,
        "amount": float(payload.amount),
        "paid_at": payload.paid_at,
        "note": payload.note or "",
        "recorded_by": user["id"],
        "created_at": now_iso,
    }
    await db.payments.insert_one(payment_doc)

    # Greedy allocation: mark oldest unpaid installments as paid while the
    # remaining payment amount fully covers each one (no partials in this package).
    unpaid_cursor = (
        db.payment_installments.find(
            {"property_id": property_id, "status": {"$ne": _INSTALLMENT_PAID}},
            {"_id": 0},
        ).sort([("due_date", 1), ("number", 1)])
    )
    unpaid = await unpaid_cursor.to_list(500)
    remaining = float(payload.amount)
    marked: list[str] = []
    for inst in unpaid:
        amt = float(inst.get("amount") or 0)
        if amt <= 0:
            continue
        if remaining + 0.001 >= amt:
            await db.payment_installments.update_one(
                {"id": inst["id"]},
                {"$set": {"status": _INSTALLMENT_PAID, "paid_at": payload.paid_at}},
            )
            remaining -= amt
            marked.append(inst["id"])
        else:
            break

    await log_action(
        user["id"],
        "property_payment_recorded",
        "property",
        property_id,
        {
            "amount": payment_doc["amount"],
            "paid_at": payment_doc["paid_at"],
            "marked_installments": marked,
        },
    )
    return await property_finance_summary(property_id, None, user)  # type: ignore[arg-type]
