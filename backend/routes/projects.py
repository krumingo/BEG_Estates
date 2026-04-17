"""Projects + properties + buildings routes (public listing + admin CRUD)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth.dependencies import require_staff, get_current_user
from constants import (
    PUBLIC_VISIBLE_STATUSES,
    PUBLIC_PROPERTY_FIELDS,
    STAFF_ROLES,
    PropertyStatus,
)
from db import get_db
from models import ProjectCreate, PropertyCreate, PropertyStatusUpdate
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
            filt["status"] = {"$in": PUBLIC_VISIBLE_STATUSES}
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
    if status:
        q["status"] = status

    is_staff = await _is_staff(request)
    if not is_staff:
        # hide "hidden" from public
        q["status"] = (
            {"$in": PUBLIC_VISIBLE_STATUSES}
            if status is None
            else status
        )

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
    if not is_staff and prop.get("status") == PropertyStatus.HIDDEN.value:
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
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.insert_one(doc)
    await log_action(user["id"], "project_create", "project", doc["id"], {"name": doc["name"]})
    doc.pop("_id", None)
    return doc


@router.post("/properties")
async def create_property(payload: PropertyCreate, user=Depends(require_staff())):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["status"] = PropertyStatus.AVAILABLE.value
    doc["base_price"] = doc.get("price_total")
    doc["list_price"] = doc.get("price_total")
    doc["negotiated_price"] = None
    doc["reservation_price"] = None
    doc["final_contract_price"] = None
    doc["buyer_id"] = None
    doc["admin_notes"] = ""
    doc["source_ref"] = None
    doc["linked_unit_ids"] = []
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.properties.insert_one(doc)
    await log_action(user["id"], "property_create", "property", doc["id"], {"code": doc["code"]})
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


# ---------- Admin helpers ----------
@router.get("/buyers")
async def list_buyers(_=Depends(require_staff())):
    db = get_db()
    return await db.buyers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/property-statuses")
async def list_statuses():
    """Public helper — returns english keys + Bulgarian labels."""
    from constants import PROPERTY_STATUS_LABELS
    return [{"value": k, "label": v} for k, v in PROPERTY_STATUS_LABELS.items()]
