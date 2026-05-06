"""Unified Clients directory — combines former buyers + login portal users.

A "client" is any person/entity that can be linked to a property as buyer.
Some clients also have login (db.users with role=client + password_hash);
others are buyer-only records (no password_hash, login disabled).

Implementation: db.users with role=client is the single source of truth.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth.dependencies import require_roles, require_staff
from constants import Role
from db import get_db
from models import ClientCreate, ClientUpdate
from routes.audit import log_action

router = APIRouter(tags=["clients"])

_CLIENT_PUBLIC_PROJECTION = {
    "_id": 0,
    "password_hash": 0,
    "totp_secret": 0,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_client(u: dict) -> dict:
    """Strip auth-internal fields and ensure new fields default to sensible values."""
    return {
        "id": u.get("id"),
        "name": u.get("name"),
        "email": u.get("email"),
        "phone": u.get("phone"),
        "egn": u.get("egn"),
        "address": u.get("address"),
        "notes": u.get("notes"),
        "client_type": u.get("client_type") or "buyer",
        "is_active": u.get("is_active", True),
        "has_login": bool(u.get("password_hash_present") or u.get("password_hash")),
        "last_login_at": u.get("last_login_at"),
        "created_at": u.get("created_at"),
        "updated_at": u.get("updated_at"),
    }


@router.get("/clients")
async def list_clients(
    active: str = Query("true", description="true | false | all"),
    type: Optional[str] = Query(None, alias="type", description="buyer|investor|company|compensation|all"),
    search: Optional[str] = None,
    _=Depends(require_staff()),
):
    db = get_db()
    query: dict = {"role": Role.CLIENT.value}

    active_lower = (active or "true").lower()
    if active_lower == "true":
        # Active = is_active is True OR field missing (legacy login users default to active)
        query["$or"] = [{"is_active": True}, {"is_active": {"$exists": False}}]
    elif active_lower == "false":
        query["is_active"] = False
    # else "all" → no is_active constraint

    if type and type.lower() != "all":
        query["client_type"] = type

    if search:
        s = search.strip()
        if s:
            regex = {"$regex": s, "$options": "i"}
            search_or = [
                {"name": regex}, {"email": regex}, {"phone": regex}, {"egn": regex},
            ]
            if "$or" in query:
                # Combine via $and
                existing_or = query.pop("$or")
                query["$and"] = [{"$or": existing_or}, {"$or": search_or}]
            else:
                query["$or"] = search_or

    users = await db.users.find(query, _CLIENT_PUBLIC_PROJECTION).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        u["password_hash_present"] = False  # password_hash already stripped
        item = _serialize_client(u)
        # Property + reservation counts (lightweight)
        item["property_count"] = await db.properties.count_documents({"buyer_id": u["id"]})
        item["reservation_count"] = await db.reservations.count_documents(
            {"client_id": u["id"], "status": {"$in": ["active", "converted"]}}
        )
        out.append(item)
    return out


@router.get("/clients/{client_id}")
async def get_client(client_id: str, _=Depends(require_staff())):
    db = get_db()
    u = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    if not u:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    item = _serialize_client(u)

    # Linked properties
    props = await db.properties.find(
        {"buyer_id": client_id},
        {"_id": 0, "id": 1, "code": 1, "project_id": 1, "status": 1, "property_type": 1},
    ).to_list(500)
    project_ids = list({p.get("project_id") for p in props if p.get("project_id")})
    projects = (
        await db.projects.find({"id": {"$in": project_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
        if project_ids else []
    )
    proj_by_id = {pr["id"]: pr.get("name") for pr in projects}
    item["properties"] = [
        {
            "id": p["id"],
            "code": p.get("code"),
            "status": p.get("status"),
            "property_type": p.get("property_type"),
            "project_id": p.get("project_id"),
            "project_name": proj_by_id.get(p.get("project_id")),
        }
        for p in props
    ]

    # Linked reservations
    reservations = await db.reservations.find(
        {"client_id": client_id},
        {"_id": 0, "id": 1, "property_id": 1, "status": 1, "reservation_type": 1, "created_at": 1, "expires_at": 1},
    ).sort("created_at", -1).to_list(200)
    item["reservations"] = reservations
    return item


@router.get("/clients/{client_id}/can-delete")
async def can_delete_client(client_id: str, _=Depends(require_staff())):
    db = get_db()
    u = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, {"_id": 0, "id": 1}
    )
    if not u:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    linked_properties = await db.properties.count_documents({"buyer_id": client_id})
    linked_reservations = await db.reservations.count_documents({"client_id": client_id})
    can_delete = linked_properties == 0 and linked_reservations == 0
    reason = ""
    if not can_delete:
        bits = []
        if linked_properties:
            bits.append(f"{linked_properties} имот{'а' if linked_properties != 1 else ''}")
        if linked_reservations:
            bits.append(f"{linked_reservations} резервация{'и' if linked_reservations != 1 else ''}")
        reason = "Този клиент има свързани " + " и ".join(bits) + ". Деактивирайте го вместо това."
    return {
        "can_delete": can_delete,
        "reason": reason,
        "linked_properties": linked_properties,
        "linked_reservations": linked_reservations,
    }


@router.post("/clients")
async def create_client(payload: ClientCreate, user=Depends(require_staff())):
    db = get_db()
    email = (payload.email or "").strip().lower() if payload.email else None
    if email:
        existing = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
        if existing:
            raise HTTPException(status_code=400, detail="Клиент с този имейл вече съществува")

    doc: dict = {
        "id": str(uuid.uuid4()),
        "role": Role.CLIENT.value,
        "name": payload.name,
        "client_type": payload.client_type,
        "is_active": True,
        "two_factor_enabled": False,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if email:
        doc["email"] = email
    if payload.phone:
        doc["phone"] = payload.phone.strip()
    if payload.egn:
        doc["egn"] = payload.egn.strip()
    if payload.address:
        doc["address"] = payload.address.strip()
    if payload.notes:
        doc["notes"] = payload.notes.strip()

    await db.users.insert_one(doc)
    await log_action(
        user["id"], "client_create", "client", doc["id"],
        {"name": doc["name"], "client_type": doc["client_type"], "has_email": bool(email)},
    )
    doc.pop("_id", None)
    return _serialize_client(doc)


@router.put("/clients/{client_id}")
async def update_client(client_id: str, payload: ClientUpdate, user=Depends(require_staff())):
    db = get_db()
    existing = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")

    changes: dict = {}
    unset: dict = {}
    if payload.name is not None:
        changes["name"] = payload.name
    if payload.email is not None:
        new_email = payload.email.strip().lower() if payload.email else ""
        if not new_email:
            unset["email"] = ""
        else:
            if new_email != (existing.get("email") or "").lower():
                dup = await db.users.find_one(
                    {"email": new_email, "id": {"$ne": client_id}}, {"_id": 0, "id": 1}
                )
                if dup:
                    raise HTTPException(status_code=400, detail="Клиент с този имейл вече съществува")
            changes["email"] = new_email
    for f in ("phone", "egn", "address", "notes"):
        v = getattr(payload, f)
        if v is not None:
            v_clean = v.strip() if isinstance(v, str) else v
            if not v_clean:
                unset[f] = ""
            else:
                changes[f] = v_clean
    if payload.client_type is not None:
        changes["client_type"] = payload.client_type

    if changes or unset:
        changes["updated_at"] = _now_iso()
        update_op: dict = {}
        if changes:
            update_op["$set"] = changes
        if unset:
            update_op["$unset"] = unset
        await db.users.update_one({"id": client_id}, update_op)

    await log_action(
        user["id"], "client_update", "client", client_id,
        {"fields": list(changes.keys()) + [f"-{k}" for k in unset.keys()]},
    )
    updated = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    return _serialize_client(updated)


@router.post("/clients/{client_id}/deactivate")
async def deactivate_client(client_id: str, user=Depends(require_staff())):
    db = get_db()
    existing = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    await db.users.update_one(
        {"id": client_id},
        {"$set": {"is_active": False, "updated_at": _now_iso()}},
    )
    await log_action(user["id"], "client_deactivate", "client", client_id, {"name": existing.get("name")})
    updated = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    return _serialize_client(updated)


@router.post("/clients/{client_id}/activate")
async def activate_client(client_id: str, user=Depends(require_staff())):
    db = get_db()
    existing = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    await db.users.update_one(
        {"id": client_id},
        {"$set": {"is_active": True, "updated_at": _now_iso()}},
    )
    await log_action(user["id"], "client_activate", "client", client_id, {"name": existing.get("name")})
    updated = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    return _serialize_client(updated)


@router.delete("/clients/{client_id}")
async def delete_client(
    client_id: str,
    user=Depends(require_roles(Role.SUPER_ADMIN.value, Role.ADMIN.value)),
):
    db = get_db()
    existing = await db.users.find_one(
        {"id": client_id, "role": Role.CLIENT.value}, _CLIENT_PUBLIC_PROJECTION
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    linked_properties = await db.properties.count_documents({"buyer_id": client_id})
    linked_reservations = await db.reservations.count_documents({"client_id": client_id})
    if linked_properties or linked_reservations:
        raise HTTPException(
            status_code=400,
            detail="Не можете да изтриете клиент, който има свързани имоти или резервации. Деактивирайте го вместо това.",
        )
    await db.users.delete_one({"id": client_id})
    await log_action(
        user["id"], "client_delete", "client", client_id,
        {"name": existing.get("name"), "email": existing.get("email")},
    )
    return {"ok": True, "id": client_id}
