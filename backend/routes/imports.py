"""Bulk import endpoint for properties (smart-diff aware)."""
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from auth.dependencies import require_staff
from constants import PropertyStatus
from db import get_db
from routes.audit import log_action

router = APIRouter(prefix="/admin/import", tags=["admin-import"])


# Status keys that should never be touched by the importer (sold/reserved/etc.)
PROTECTED_STATUSES = {
    PropertyStatus.SOLD.value,
    PropertyStatus.RESERVED_PAID_DEPOSIT.value,
    PropertyStatus.RESERVED_ZERO_DEPOSIT.value,
    PropertyStatus.COMPENSATION.value,
    PropertyStatus.UNAVAILABLE.value,
    PropertyStatus.HIDDEN.value,
}

# Fields the importer is allowed to update on a *protected* property
NEUTRAL_FIELDS = {
    "raw_area",
    "area_total",
    "list_price",
    "base_price",
    "ideal_parts",
    "exposure",
    "description",
    "rooms",
}

# Fields the importer must NEVER overwrite, regardless of mode
LOCKED_FIELDS = {
    "status",
    "buyer_id",
    "reservation_id",
    "deposit_amount",
    "notes",
    "floor",
}


class BulkPropertyIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str
    property_type: Optional[str] = None
    floor: Optional[int] = None
    rooms: Optional[int] = None
    raw_area: Optional[float] = None
    area_total: Optional[float] = None
    list_price: Optional[float] = None
    base_price: Optional[float] = None
    ideal_parts: Optional[float] = None
    exposure: Optional[str] = None
    description: Optional[str] = None


class BulkImportRequest(BaseModel):
    project_id: str
    properties: List[BulkPropertyIn]
    mode: Literal["smart_diff", "force_create"] = "smart_diff"
    dry_run: bool = True


def _is_protected(prop: dict) -> bool:
    if (prop.get("status") or "available") in PROTECTED_STATUSES:
        return True
    if prop.get("buyer_id"):
        return True
    return False


def _diff(existing: dict, payload: dict) -> dict:
    """Return only the fields where payload differs from existing (ignoring None)."""
    out = {}
    for k, v in payload.items():
        if v is None:
            continue
        if existing.get(k) != v:
            out[k] = v
    return out


@router.post("/bulk-properties")
async def bulk_properties(
    request: BulkImportRequest,
    user=Depends(require_staff()),
):
    db = get_db()
    project = await db.projects.find_one(
        {"id": request.project_id}, {"_id": 0, "id": 1, "name": 1}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    existing_props = await db.properties.find(
        {"project_id": request.project_id}, {"_id": 0}
    ).to_list(5000)
    existing_by_code = {p["code"]: p for p in existing_props}
    payload_codes = {p.code for p in request.properties}

    summary = {
        "total_in_payload": len(request.properties),
        "created": 0,
        "updated_neutral": 0,
        "updated_protected": 0,
        "skipped": 0,
    }
    details = {
        "protected": [],
        "free_updates": [],
        "new_units": [],
        "in_db_not_in_payload": [],
    }

    new_docs: list = []
    free_updates: list = []
    protected_updates: list = []

    for item in request.properties:
        payload = item.model_dump(exclude_none=True)
        # Strip locked fields defensively (extra=ignore already drops unknowns)
        for f in LOCKED_FIELDS:
            payload.pop(f, None)

        existing = existing_by_code.get(item.code)
        if not existing:
            # NEW
            if request.mode == "force_create" or request.mode == "smart_diff":
                doc = {
                    "code": item.code,
                    "project_id": request.project_id,
                    "status": PropertyStatus.AVAILABLE.value,
                    **payload,
                }
                summary["created"] += 1
                details["new_units"].append({
                    "code": item.code,
                    "property_type": payload.get("property_type"),
                    "floor": payload.get("floor"),
                    "raw_area": payload.get("raw_area"),
                    "list_price": payload.get("list_price"),
                })
                new_docs.append(doc)
            continue

        # EXISTING
        if request.mode == "force_create":
            summary["skipped"] += 1
            continue

        protected = _is_protected(existing)
        if protected:
            allowed = {k: v for k, v in payload.items() if k in NEUTRAL_FIELDS}
            changes = _diff(existing, allowed)
            skipped_fields = sorted(set(payload.keys()) - NEUTRAL_FIELDS)
            if changes:
                summary["updated_protected"] += 1
                protected_updates.append((existing["id"], changes))
            else:
                summary["skipped"] += 1
            details["protected"].append({
                "code": item.code,
                "status": existing.get("status"),
                "buyer_id": existing.get("buyer_id"),
                "neutral_changes": changes,
                "skipped_fields": skipped_fields,
            })
        else:
            changes = _diff(existing, payload)
            if changes:
                summary["updated_neutral"] += 1
                free_updates.append((existing["id"], changes))
                details["free_updates"].append({"code": item.code, "changes": changes})
            else:
                summary["skipped"] += 1

    # codes in DB but not in payload — never delete, only warn
    for code, p in existing_by_code.items():
        if code not in payload_codes:
            details["in_db_not_in_payload"].append({
                "code": code, "status": p.get("status") or "available",
            })

    if not request.dry_run:
        import uuid
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        for d in new_docs:
            d.setdefault("id", str(uuid.uuid4()))
            d.setdefault("created_at", now_iso)
            await db.properties.insert_one(d)
        for pid, changes in free_updates:
            await db.properties.update_one({"id": pid}, {"$set": changes})
        for pid, changes in protected_updates:
            await db.properties.update_one({"id": pid}, {"$set": changes})

        await log_action(
            user["id"], "bulk_properties_import", "project", request.project_id,
            {
                "mode": request.mode,
                "summary": summary,
                "project_name": project.get("name"),
            },
        )

    return {"summary": summary, "details": details, "applied": not request.dry_run}
