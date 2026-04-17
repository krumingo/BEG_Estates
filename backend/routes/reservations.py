"""Reservations incl. zero-deposit flow."""
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user, require_staff
from constants import STAFF_ROLES
from db import get_db
from models import ReservationCreate
from routes.audit import log_action

router = APIRouter(prefix="/reservations", tags=["reservations"])


async def _expire_stale(db):
    """Auto-expire zero-deposit reservations past their due date."""
    now_iso = datetime.now(timezone.utc).isoformat()
    stale = await db.reservations.find(
        {"status": "active", "expires_at": {"$lt": now_iso}}, {"_id": 0}
    ).to_list(200)
    for r in stale:
        await db.reservations.update_one(
            {"id": r["id"]}, {"$set": {"status": "expired", "expired_at": now_iso}}
        )
        await db.properties.update_one(
            {"id": r["property_id"], "status": {"$in": ["резервиран_капаро_0", "резервиран_с_капаро"]}},
            {"$set": {"status": "свободен"}},
        )
        await log_action(None, "reservation_auto_expired", "reservation", r["id"], {})


@router.get("")
async def list_reservations(user: dict = Depends(get_current_user)):
    db = get_db()
    await _expire_stale(db)
    q: dict = {}
    if user["role"] not in STAFF_ROLES:
        q["client_id"] = user["id"]
    items = await db.reservations.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # enrich with property and client
    for r in items:
        prop = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
        r["property"] = prop
        client = await db.users.find_one({"id": r["client_id"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
        r["client"] = client
    return items


@router.post("")
async def create_reservation(payload: ReservationCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    await _expire_stale(db)

    # client identification
    if user["role"] in STAFF_ROLES:
        client_id = payload.client_id
        if not client_id:
            raise HTTPException(status_code=400, detail="Изберете клиент")
        client = await db.users.find_one({"id": client_id, "role": "client"})
        if not client:
            raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    else:
        client_id = user["id"]

    prop = await db.properties.find_one({"id": payload.property_id})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")
    if prop["status"] != "свободен":
        raise HTTPException(status_code=409, detail="Имотът не е свободен")

    # zero-deposit limit
    if payload.reservation_type == "zero_deposit":
        limit = int(os.environ.get("ZERO_DEPOSIT_LIMIT_PER_CLIENT", "2"))
        active = await db.reservations.count_documents(
            {"client_id": client_id, "reservation_type": "zero_deposit", "status": "active"}
        )
        if active >= limit:
            raise HTTPException(status_code=409, detail=f"Достигнат лимит от {limit} активни zero-deposit резервации")

    days = int(os.environ.get("RESERVATION_EXPIRY_DAYS", "7"))
    now = datetime.now(timezone.utc)
    reservation = {
        "id": str(uuid.uuid4()),
        "property_id": payload.property_id,
        "client_id": client_id,
        "reservation_type": payload.reservation_type,
        "status": "active",
        "amount": 0 if payload.reservation_type == "zero_deposit" else None,
        "notes": payload.notes or "",
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=days)).isoformat(),
        "created_by": user["id"],
    }
    await db.reservations.insert_one(reservation)

    new_status = {
        "zero_deposit": "резервиран_капаро_0",
        "deposit": "резервиран_с_капаро",
        "preliminary": "предварителен_договор",
    }.get(payload.reservation_type, "резервиран_капаро_0")
    await db.properties.update_one({"id": payload.property_id}, {"$set": {"status": new_status}})
    await log_action(user["id"], "reservation_create", "reservation", reservation["id"], {"type": payload.reservation_type})
    reservation.pop("_id", None)
    return reservation


@router.post("/{reservation_id}/release")
async def release_reservation(reservation_id: str, user: dict = Depends(require_staff())):
    db = get_db()
    r = await db.reservations.find_one({"id": reservation_id})
    if not r:
        raise HTTPException(status_code=404, detail="Резервацията не е намерена")
    if r["status"] != "active":
        raise HTTPException(status_code=400, detail="Резервацията не е активна")
    await db.reservations.update_one(
        {"id": reservation_id},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.properties.update_one({"id": r["property_id"]}, {"$set": {"status": "свободен"}})
    await log_action(user["id"], "reservation_release", "reservation", reservation_id, {})
    return {"ok": True}
