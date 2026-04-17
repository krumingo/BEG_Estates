"""Projects + properties + buildings routes (public listing + admin CRUD)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth.dependencies import require_staff
from db import get_db
from models import ProjectCreate, PropertyCreate, PropertyStatusUpdate
from routes.audit import log_action

router = APIRouter(tags=["projects"])


# ---------- Public project endpoints ----------
@router.get("/projects")
async def list_projects(status: Optional[str] = None):
    db = get_db()
    q: dict = {}
    if status:
        q["status"] = status
    items = await db.projects.find(q, {"_id": 0}).to_list(200)
    # attach stat counts
    for p in items:
        props = await db.properties.find({"project_id": p["id"]}, {"_id": 0, "status": 1}).to_list(1000)
        p["stats"] = {
            "total": len(props),
            "free": sum(1 for x in props if x["status"] == "свободен"),
            "sold": sum(1 for x in props if x["status"] == "продаден"),
            "reserved": sum(
                1 for x in props if x["status"] in ("резервиран_капаро_0", "резервиран_с_капаро", "предварителен_договор")
            ),
        }
    return items


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    db = get_db()
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")
    buildings = await db.buildings.find({"project_id": project_id}, {"_id": 0}).to_list(50)
    return {"project": project, "buildings": buildings}


@router.get("/projects/{project_id}/properties")
async def project_properties(project_id: str, property_type: Optional[str] = None, floor: Optional[int] = None):
    db = get_db()
    q: dict = {"project_id": project_id}
    if property_type:
        q["property_type"] = property_type
    if floor is not None:
        q["floor"] = floor
    props = await db.properties.find(q, {"_id": 0}).sort([("floor", 1), ("code", 1)]).to_list(1000)
    return props


@router.get("/properties/{property_id}")
async def get_property(property_id: str):
    db = get_db()
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")
    project = await db.projects.find_one({"id": prop["project_id"]}, {"_id": 0})
    linked = await db.properties.find(
        {"linked_to_property_id": property_id}, {"_id": 0}
    ).to_list(20)
    return {"property": prop, "project": project, "linked": linked}


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
    doc["status"] = "свободен"
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
    res = await db.properties.update_one({"id": property_id}, {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Имотът не е намерен")
    await log_action(user["id"], "property_status_change", "property", property_id, {"new": payload.status})
    return {"ok": True}
