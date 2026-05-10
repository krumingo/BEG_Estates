"""Dashboard stats + inquiries.

R.6: Rich management dashboard.

GET /dashboard/admin/full now uses dashboard_aggregations service to build:
- overview, finance, sales_pipeline, by_type, by_floor, by_building,
  clients_summary, money_calendar, unsold_inventory, action_items
- legacy keys preserved: cash, sales, calendar, top_clients, recent_sales,
  recent_inquiries, alerts.

Filters: project_id, building_id, property_type, status, client_id, period,
only_overdue, only_available.

Roles with finance visibility: super_admin, admin, accounting.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
import uuid

from auth.dependencies import get_current_user, require_staff
from db import get_db
from models import InquiryCreate
from routes.audit import log_action
from constants import Role
from services.dashboard_aggregations import build_dashboard

router = APIRouter(tags=["dashboard"])


FINANCE_ROLES = {Role.SUPER_ADMIN.value, Role.ADMIN.value, Role.ACCOUNTING.value}


@router.get("/dashboard/admin")
async def admin_dashboard(user=Depends(require_staff())):
    """LEGACY endpoint — пази обратна съвместимост."""
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    stale = await db.reservations.find(
        {"status": "active", "expires_at": {"$lt": now_iso}}, {"_id": 0, "id": 1, "property_id": 1}
    ).to_list(200)
    for r in stale:
        await db.reservations.update_one({"id": r["id"]}, {"$set": {"status": "expired"}})
        await db.properties.update_one(
            {"id": r["property_id"], "status": {"$in": ["reserved_zero_deposit", "reserved_paid_deposit"]}},
            {"$set": {"status": "available"}},
        )

    total_props = await db.properties.count_documents({})
    free = await db.properties.count_documents({"status": "available"})
    reserved_zero = await db.properties.count_documents({"status": "reserved_zero_deposit"})
    reserved_dep = await db.properties.count_documents({"status": "reserved_paid_deposit"})
    sold = await db.properties.count_documents({"status": "sold"})
    compensation = await db.properties.count_documents({"status": "compensation"})
    hidden = await db.properties.count_documents({"status": "hidden"})
    active_zero = await db.reservations.count_documents({"status": "active", "reservation_type": "zero_deposit"})

    soon = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
    expiring_soon = await db.reservations.count_documents({"status": "active", "expires_at": {"$lte": soon}})

    total_clients = await db.users.count_documents({"role": "client"})
    total_projects = await db.projects.count_documents({})

    recent_inquiries = await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_reservations = await db.reservations.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for r in recent_reservations:
        r["property"] = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
        r["client"] = await db.users.find_one(
            {"id": r["client_id"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
        )

    payments = await db.payments.find({}, {"_id": 0, "amount": 1}).to_list(1000)
    total_collected = sum(p.get("amount", 0) for p in payments)

    return {
        "kpi": {
            "total_properties": total_props,
            "free": free,
            "reserved_zero": reserved_zero,
            "reserved_deposit": reserved_dep,
            "preliminary": reserved_dep,
            "sold": sold,
            "compensation": compensation,
            "hidden": hidden,
            "active_zero_deposit": active_zero,
            "expiring_soon": expiring_soon,
            "total_clients": total_clients,
            "total_projects": total_projects,
            "total_collected": total_collected,
        },
        "recent_inquiries": recent_inquiries,
        "recent_reservations": recent_reservations,
    }


@router.get("/dashboard/admin/full")
async def admin_dashboard_full(
    project_id: str = Query(None),
    building_id: str = Query(None),
    property_type: str = Query(None),
    status: str = Query(None),
    client_id: str = Query(None),
    period: str = Query(None),
    only_overdue: bool = Query(False),
    only_available: bool = Query(False),
    user=Depends(require_staff()),
):
    """R.6: Пълен management dashboard.

    Връща нови блокове (overview, finance, sales_pipeline, by_type, by_floor,
    by_building, clients_summary, money_calendar, unsold_inventory, action_items)
    + legacy keys (cash, sales, calendar, top_clients, recent_sales,
    recent_inquiries, alerts) за backward compatibility.

    Финансовата видимост е за super_admin / admin / accounting.
    """
    db = get_db()
    is_finance_visible = user.get("role") in FINANCE_ROLES

    # Auto-expire stale active reservations (housekeeping)
    now_iso = datetime.now(timezone.utc).isoformat()
    stale = await db.reservations.find(
        {"status": "active", "expires_at": {"$lt": now_iso}}, {"_id": 0, "id": 1, "property_id": 1}
    ).to_list(200)
    for r in stale:
        await db.reservations.update_one({"id": r["id"]}, {"$set": {"status": "expired"}})
        await db.properties.update_one(
            {"id": r["property_id"], "status": {"$in": ["reserved_zero_deposit", "reserved_paid_deposit"]}},
            {"$set": {"status": "available"}},
        )

    return await build_dashboard(
        db,
        project_id=project_id,
        building_id=building_id,
        property_type=property_type,
        status=status,
        client_id=client_id,
        period=period,
        only_overdue=only_overdue,
        only_available=only_available,
        is_finance_visible=is_finance_visible,
    )




@router.post("/inquiries")
async def create_inquiry(payload: InquiryCreate):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["status"] = "new"
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.inquiries.insert_one(doc)
    await log_action(None, "inquiry_create", "inquiry", doc["id"], {"email": doc["email"]})
    doc.pop("_id", None)
    return doc


@router.get("/inquiries")
async def list_inquiries(_=Depends(require_staff())):
    db = get_db()
    return await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
