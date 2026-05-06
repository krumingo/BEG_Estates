"""Dashboard stats + inquiries + clients listing."""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
import uuid

from auth.dependencies import get_current_user, require_staff
from db import get_db
from models import InquiryCreate
from routes.audit import log_action

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/admin")
async def admin_dashboard(user=Depends(require_staff())):
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    # expire stale first
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
    preliminary = await db.properties.count_documents({"status": "reserved_paid_deposit"})
    sold = await db.properties.count_documents({"status": "sold"})
    compensation = await db.properties.count_documents({"status": "compensation"})
    hidden = await db.properties.count_documents({"status": "hidden"})
    active_zero = await db.reservations.count_documents({"status": "active", "reservation_type": "zero_deposit"})

    # expiring soon (next 48h)
    soon = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
    expiring_soon = await db.reservations.count_documents(
        {"status": "active", "expires_at": {"$lte": soon}}
    )

    total_clients = await db.users.count_documents({"role": "client"})
    total_projects = await db.projects.count_documents({})
    recent_inquiries = await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_reservations = await db.reservations.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for r in recent_reservations:
        r["property"] = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
        r["client"] = await db.users.find_one(
            {"id": r["client_id"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
        )

    # payments collected (sum)
    payments = await db.payments.find({}, {"_id": 0, "amount": 1}).to_list(1000)
    total_collected = sum(p.get("amount", 0) for p in payments)

    return {
        "kpi": {
            "total_properties": total_props,
            "free": free,
            "reserved_zero": reserved_zero,
            "reserved_deposit": reserved_dep,
            "preliminary": preliminary,
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


@router.get("/dashboard/client")
async def client_dashboard(user: dict = Depends(get_current_user)):
    if user["role"] != "client":
        raise HTTPException(status_code=403, detail="Само за клиенти")
    db = get_db()
    reservations = await db.reservations.find(
        {"client_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for r in reservations:
        r["property"] = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
        r["project"] = await db.projects.find_one({"id": r["property"]["project_id"]}, {"_id": 0}) if r.get("property") else None
    payments = await db.payments.find({"client_id": user["id"]}, {"_id": 0}).to_list(100)
    installments = await db.payment_installments.find(
        {"client_id": user["id"]}, {"_id": 0}
    ).sort("due_date", 1).to_list(100)
    documents = await db.documents.find({"client_id": user["id"]}, {"_id": 0}).to_list(50)
    return {
        "reservations": reservations,
        "payments": payments,
        "installments": installments,
        "documents": documents,
    }


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
