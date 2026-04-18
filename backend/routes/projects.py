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
from models import ProjectCreate, ProjectUpdate, PropertyCreate, PropertyStatusUpdate, PropertyUpdate
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
