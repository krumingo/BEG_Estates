"""Admin import session workflow (AI-assisted PDF ingest).

Nothing is written to inventory collections until the admin hits ``apply``.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel

from auth.dependencies import require_staff
from db import get_db
from routes.audit import log_action
from services.document_import import (
    analyze_files,
    _render_page_thumbnail,
    ALLOWED_DOCUMENT_TYPES,
)
from services.snapshots import create_prechange_snapshot

router = APIRouter(tags=["imports"])


UPLOAD_ROOT = Path(os.environ.get("IMPORTS_DIR", "/app/backend/uploads/import_sessions"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB per PDF

# ---------------------------------------------------------------------------
# Smart Import — защитени полета при re-import
# ---------------------------------------------------------------------------
# NEUTRAL_IMPORT_FIELDS: полета, които винаги могат да се обновят от PDF
# (цена, площ, идеални части). PROTECTED_IMPORT_FIELDS: полета, които НЕ се
# пипат при re-import, ако обектът е "защитен" — т.е. има купувач, активна
# резервация или не-available статус.
NEUTRAL_IMPORT_FIELDS = (
    "raw_area",
    "area_pure",
    "area_common",
    "area_total",
    "list_price",
    "final_contract_price",
    "ideal_parts",
    "rooms",
    "floor",
    "property_type",
)

# Полета, които се попълват само ако в DB още не са зададени (не overwrite).
FILL_IF_EMPTY_FIELDS = ("exposure", "description")

# Полета, които за защитени обекти НЕ се пипат в никакъв случай.
PROTECTED_FIELDS = ("status", "buyer_id", "reservation_id", "deposit_amount", "notes")


def _is_property_protected(prop: dict, has_active_reservation: bool) -> bool:
    """Обектът е защитен, ако не е чисто 'available' или има купувач/резервация."""
    if has_active_reservation:
        return True
    if prop.get("buyer_id"):
        return True
    status = prop.get("status") or "available"
    return status != "available"


async def _active_reservation_map(db, project_id: str) -> dict:
    """Връща {property_id: True} за обекти с активна резервация в проекта."""
    cursor = db.reservations.find(
        {"project_id": project_id, "status": "active"},
        {"_id": 0, "property_id": 1},
    )
    out: dict[str, bool] = {}
    async for r in cursor:
        pid = r.get("property_id")
        if pid:
            out[pid] = True
    return out


def _neutral_changes(existing: dict, desired: dict) -> list[dict]:
    """Сравнява existing/desired само по NEUTRAL_IMPORT_FIELDS; връща diff list."""
    diffs: list[dict] = []
    for k in NEUTRAL_IMPORT_FIELDS:
        if k not in desired:
            continue
        new_val = desired[k]
        old_val = existing.get(k)
        if old_val != new_val:
            diffs.append({"field": k, "from": old_val, "to": new_val})
    return diffs


def _full_changes(existing: dict, desired: dict) -> list[dict]:
    """Пълен diff — за не-защитени обекти обновяваме всички подадени полета."""
    diffs: list[dict] = []
    for k, new_val in desired.items():
        old_val = existing.get(k)
        if old_val != new_val:
            diffs.append({"field": k, "from": old_val, "to": new_val})
    return diffs



class CreateSessionIn(BaseModel):
    project_id: str


class ReviewPayloadUpdate(BaseModel):
    candidate_units: Optional[list[dict]] = None
    candidate_buyers: Optional[list[dict]] = None
    candidate_floor_plans: Optional[list[dict]] = None


class DocumentTypeOverride(BaseModel):
    document_type: Optional[str] = None  # None изчиства override-а


class ApplyFloorPlansRequest(BaseModel):
    dry_run: bool = False
    force_overwrite: bool = False  # ако е True, allow заместване на manual mapping


class BulkPropertyIn(BaseModel):
    """Един обект в bulk-properties payload — всичко освен code/property_type е optional."""
    code: str
    property_type: str
    floor: Optional[int] = None
    rooms: Optional[int] = None
    raw_area: Optional[float] = None
    area_pure: Optional[float] = None
    area_common: Optional[float] = None
    area_total: Optional[float] = None
    list_price: Optional[float] = None
    final_contract_price: Optional[float] = None
    ideal_parts: Optional[float] = None
    exposure: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # default = "available" при create


class BulkImportRequest(BaseModel):
    project_id: str
    properties: list[BulkPropertyIn]
    mode: str = "smart_diff"  # "smart_diff" | "force_create"
    dry_run: bool = False


def _public_session(doc: dict) -> dict:
    out = {k: v for k, v in doc.items() if k != "_id"}
    # Never leak absolute paths
    for f in out.get("files", []):
        f.pop("stored_path", None)
    return out


@router.post("/import-sessions")
async def create_session(payload: CreateSessionIn, user=Depends(require_staff())):
    db = get_db()
    project = await db.projects.find_one({"id": payload.project_id}, {"_id": 0, "id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    sid = str(uuid.uuid4())
    (UPLOAD_ROOT / sid).mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": sid,
        "project_id": payload.project_id,
        "project_name": project["name"],
        "created_by": user["id"],
        "created_at": now,
        "status": "uploaded",
        "files": [],
        "extracted_payload": None,
        "warnings": [],
        "conflicts": [],
        "summary": None,
        "applied_at": None,
        "apply_report": None,
    }
    await db.import_sessions.insert_one(doc)
    await log_action(user["id"], "import_session_create", "import_session", sid, {})
    return _public_session(doc)


@router.post("/import-sessions/{session_id}/files")
async def upload_files(
    session_id: str,
    files: list[UploadFile] = File(...),
    user=Depends(require_staff()),
):
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    if sess.get("status") == "applied":
        raise HTTPException(status_code=400, detail="Сесията вече е приложена")

    saved: list[dict] = []
    for f in files:
        data = await f.read()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Файлът {f.filename} надвишава 25 MB",
            )
        mime = (f.content_type or "").lower()
        if "pdf" not in mime and not (f.filename or "").lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"Поддържат се само PDF файлове ({f.filename})",
            )
        fid = str(uuid.uuid4())
        dest = UPLOAD_ROOT / session_id / f"{fid}.pdf"
        dest.write_bytes(data)
        saved.append({
            "id": fid,
            "original_name": f.filename or f"{fid}.pdf",
            "mime_type": mime or "application/pdf",
            "stored_path": str(dest),
            "size_bytes": len(data),
            "document_type_guess": None,
            "document_type_guess_confidence": None,
            "pages_count": None,
        })

    await db.import_sessions.update_one(
        {"id": session_id},
        {"$push": {"files": {"$each": saved}}, "$set": {"status": "uploaded"}},
    )
    await log_action(
        user["id"], "import_session_upload", "import_session", session_id,
        {"files_added": len(saved)},
    )
    # Return fresh session (stripped)
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    return _public_session(sess)


@router.post("/import-sessions/{session_id}/analyze")
async def analyze_session(session_id: str, user=Depends(require_staff())):
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    if not sess.get("files"):
        raise HTTPException(status_code=400, detail="Качете поне един PDF файл")

    file_blobs: list[dict] = []
    for f in sess["files"]:
        path = Path(f["stored_path"])
        if not path.exists():
            continue
        file_blobs.append({
            "id": f["id"],
            "original_name": f["original_name"],
            "content": path.read_bytes(),
            "document_type_override": f.get("document_type_override"),
        })

    result = analyze_files(file_blobs)
    per_file_by_id = {pf["id"]: pf for pf in result["per_file"]}
    for f in sess["files"]:
        pf = per_file_by_id.get(f["id"])
        if pf:
            f["document_type_guess"] = pf["document_type_guess"]
            f["document_type_guess_confidence"] = pf["document_type_guess_confidence"]
            f["document_type_applied"] = pf["document_type_applied"]
            f["extracted_units_count"] = pf["extracted_units_count"]
            f["extracted_units_by_type"] = pf["extracted_units_by_type"]
            f["extracted_buyers_count"] = pf["extracted_buyers_count"]
            f["pages_count"] = pf["pages_count"]

    await db.import_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "files": sess["files"],
            "status": "review_ready",
            "extracted_payload": {
                "candidate_units": result["candidate_units"],
                "candidate_buyers": result["candidate_buyers"],
                "candidate_floor_plans": result["candidate_floor_plans"],
            },
            "warnings": result["warnings"],
            "conflicts": result["conflicts"],
            "summary": result["summary"],
        }},
    )
    await log_action(
        user["id"], "import_session_analyze", "import_session", session_id,
        {"summary": result["summary"]},
    )
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    return _public_session(sess)


@router.get("/import-sessions")
async def list_sessions(_=Depends(require_staff())):
    db = get_db()
    items = (
        await db.import_sessions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    )
    return [_public_session(i) for i in items]


@router.get("/import-sessions/{session_id}")
async def get_session(session_id: str, _=Depends(require_staff())):
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    return _public_session(sess)


@router.patch("/import-sessions/{session_id}/files/{file_id}/document-type")
async def set_document_type_override(
    session_id: str,
    file_id: str,
    payload: DocumentTypeOverride,
    user=Depends(require_staff()),
):
    """Ръчен override на document type за конкретен файл в сесията.

    След override-а админът може отново да натисне „Разпознай“, за да се
    приложат новите правила без re-upload на файла.
    """
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    if sess.get("status") == "applied":
        raise HTTPException(status_code=400, detail="Сесията вече е приложена")

    override = (payload.document_type or "").strip() or None
    if override is not None and override not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Невалиден document_type. Позволени: {', '.join(ALLOWED_DOCUMENT_TYPES)}",
        )

    files = sess.get("files", [])
    file_found = False
    for f in files:
        if f["id"] == file_id:
            if override is None:
                f.pop("document_type_override", None)
            else:
                f["document_type_override"] = override
            file_found = True
            break
    if not file_found:
        raise HTTPException(status_code=404, detail="Файлът не е намерен в сесията")

    await db.import_sessions.update_one(
        {"id": session_id},
        {"$set": {"files": files, "status": "uploaded"}},
    )
    await log_action(
        user["id"], "import_session_set_doc_type", "import_session", session_id,
        {"file_id": file_id, "document_type": override},
    )
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    return _public_session(sess)


@router.patch("/import-sessions/{session_id}/review-payload")
async def update_review_payload(
    session_id: str,
    payload: ReviewPayloadUpdate,
    user=Depends(require_staff()),
):
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    extracted = sess.get("extracted_payload") or {}
    changes = payload.model_dump(exclude_unset=True)
    extracted.update(changes)
    await db.import_sessions.update_one(
        {"id": session_id},
        {"$set": {"extracted_payload": extracted}},
    )
    await log_action(
        user["id"], "import_session_review_update", "import_session", session_id,
        {"keys": list(changes.keys())},
    )
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    return _public_session(sess)


@router.get("/import-sessions/{session_id}/apply-diff")
async def apply_diff(session_id: str, _=Depends(require_staff())):
    """Dry-run preview: какво ще се създаде / update-не / skip-не, БЕЗ write.

    Protected-aware: обекти с buyer / non-available статус / активна резервация
    получават само NEUTRAL_IMPORT_FIELDS промени; защитените полета (status,
    buyer_id и пр.) се маркират като skipped.
    """
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    extracted = sess.get("extracted_payload") or {}
    project_id = sess["project_id"]
    project = await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    # Greenfield detection — ако проектът няма никакви properties, цялата
    # protection логика се изключва (всичко е "ново").
    existing_count = await db.properties.count_documents({"project_id": project_id})
    is_greenfield = existing_count == 0
    reservation_map = await _active_reservation_map(db, project_id) if not is_greenfield else {}

    to_create_props: list[dict] = []
    to_update_free: list[dict] = []
    to_update_protected: list[dict] = []
    to_skip: list[dict] = []
    to_create_buyers: list[dict] = []
    to_update_buyers: list[dict] = []

    approved_codes: set[str] = set()
    for u in extracted.get("candidate_units", []) or []:
        if not u.get("approved"):
            to_skip.append({"kind": "unit", "code": u.get("code"), "reason": "не е одобрен"})
            continue
        code = (u.get("code") or "").strip()
        if not code:
            to_skip.append({"kind": "unit", "code": None, "reason": "липсва code"})
            continue
        approved_codes.add(code)

        existing = await db.properties.find_one(
            {"project_id": project_id, "code": code},
            {"_id": 0, "id": 1, "code": 1, "property_type": 1, "floor": 1,
             "rooms": 1, "raw_area": 1, "area_pure": 1, "area_common": 1,
             "area_total": 1, "list_price": 1, "final_contract_price": 1,
             "ideal_parts": 1, "status": 1, "buyer_id": 1, "exposure": 1,
             "description": 1},
        )
        desired = {
            "code": code,
            "property_type": u.get("property_type"),
            "floor": u.get("floor"),
            "rooms": u.get("rooms"),
            "raw_area": u.get("raw_area"),
            "area_pure": u.get("area_pure"),
            "area_common": u.get("area_common"),
            "area_total": u.get("area_total"),
            "list_price": u.get("start_price_basis"),
            "final_contract_price": u.get("final_price_basis"),
            "status": u.get("status_guess") or "available",
        }
        desired = {k: v for k, v in desired.items() if v is not None}

        if not existing:
            to_create_props.append({
                "code": code,
                "property_type": u.get("property_type"),
                "raw_area": u.get("raw_area"),
                "area_total": u.get("area_total"),
                "list_price": u.get("start_price_basis"),
                "floor": u.get("floor"),
                "rooms": u.get("rooms"),
            })
            continue

        # Съществуващ обект — определяме защитен ли е
        has_reservation = reservation_map.get(existing["id"], False)
        protected = (not is_greenfield) and _is_property_protected(existing, has_reservation)

        if protected:
            # Само NEUTRAL обновявания
            neutral = _neutral_changes(existing, desired)
            # Полетата, които iмат нови стойности, но ще бъдат skip-нати защото са protected
            skipped_fields = [f for f in PROTECTED_FIELDS if f in desired and desired[f] != existing.get(f)]
            # Buyer info (ако имаме)
            buyer_name = None
            if existing.get("buyer_id"):
                buyer = await db.users.find_one(
                    {"id": existing["buyer_id"]}, {"_id": 0, "name": 1}
                )
                buyer_name = buyer.get("name") if buyer else None
            row = {
                "code": code,
                "existing_id": existing["id"],
                "property_type": existing.get("property_type"),
                "current_status": existing.get("status"),
                "buyer_name": buyer_name,
                "has_active_reservation": has_reservation,
                "neutral_changes": neutral,
                "skipped_fields": skipped_fields,
            }
            if neutral or skipped_fields:
                to_update_protected.append(row)
            else:
                to_skip.append({"kind": "unit", "code": code, "reason": "защитен, без релевантни промени"})
        else:
            # Свободен обект — всичко разрешено (без buyer_id, което import няма)
            changes = _full_changes(existing, desired)
            if changes:
                to_update_free.append({
                    "code": code,
                    "existing_id": existing["id"],
                    "property_type": existing.get("property_type"),
                    "current_status": existing.get("status") or "available",
                    "changes": changes,
                })
            else:
                to_skip.append({"kind": "unit", "code": code, "reason": "вече съществува, без промени"})

    # WARNINGS — обекти в DB, които не са в PDF
    warnings: list[dict] = []
    if not is_greenfield:
        db_props = await db.properties.find(
            {"project_id": project_id},
            {"_id": 0, "id": 1, "code": 1, "status": 1, "buyer_id": 1},
        ).to_list(2000)
        for p in db_props:
            if p.get("code") in approved_codes:
                continue
            # Само предупреждаваме за защитените — свободни могат да са ръчно създадени
            has_reservation = reservation_map.get(p["id"], False)
            if _is_property_protected(p, has_reservation):
                buyer_name = None
                if p.get("buyer_id"):
                    b = await db.users.find_one({"id": p["buyer_id"]}, {"_id": 0, "name": 1})
                    buyer_name = b.get("name") if b else None
                warnings.append({
                    "type": "in_db_not_in_pdf",
                    "code": p.get("code"),
                    "status": p.get("status"),
                    "buyer_name": buyer_name,
                    "message": "Обектът съществува в DB (защитен), но не е в новия PDF. Оставен непокътнат.",
                })

    for b in extracted.get("candidate_buyers", []) or []:
        if not b.get("approved"):
            to_skip.append({"kind": "buyer", "code": b.get("name"), "reason": "не е одобрен"})
            continue
        name = (b.get("name") or "").strip()
        if not name or name == "(неизвестен)":
            to_skip.append({"kind": "buyer", "code": None, "reason": "липсва име"})
            continue
        existing = await db.users.find_one(
            {"role": "client", "is_deleted": {"$ne": True}, "name": name, "source_project_id": project_id},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1},
        )
        link_note = None
        linked = b.get("linked_unit_code")
        if linked:
            if linked in approved_codes:
                link_note = f"ще се свърже с '{linked}' (от тази сесия)"
            else:
                prop = await db.properties.find_one(
                    {"project_id": project_id, "code": linked}, {"_id": 0, "id": 1}
                )
                link_note = (
                    f"ще се свърже със съществуващ '{linked}'"
                    if prop else f"непознат code '{linked}' (ще остане несвързан)"
                )
        if existing:
            changed_fields = []
            if b.get("phone") and b["phone"] != existing.get("phone"):
                changed_fields.append({"field": "phone", "from": existing.get("phone"), "to": b["phone"]})
            if b.get("email") and b["email"] != existing.get("email"):
                changed_fields.append({"field": "email", "from": existing.get("email"), "to": b["email"]})
            if changed_fields or link_note:
                to_update_buyers.append({
                    "name": name,
                    "existing_id": existing["id"],
                    "changed_fields": changed_fields,
                    "link_note": link_note,
                })
            else:
                to_skip.append({"kind": "buyer", "code": name, "reason": "вече съществува, без промени"})
        else:
            to_create_buyers.append({
                "name": name,
                "phone": b.get("phone"),
                "email": b.get("email"),
                "link_note": link_note,
            })

    total_in_pdf = sum(1 for u in (extracted.get("candidate_units") or []) if u.get("approved"))
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "is_greenfield": is_greenfield,
        "summary": {
            "total_in_pdf": total_in_pdf,
            "matched_existing": len(to_update_free) + len(to_update_protected),
            "new_units": len(to_create_props),
            "protected_units": len(to_update_protected),
            "neutral_updates": len(to_update_free),
            "warnings_count": len(warnings),
            "create_properties": len(to_create_props),
            "update_properties": len(to_update_free) + len(to_update_protected),
            "create_buyers": len(to_create_buyers),
            "update_buyers": len(to_update_buyers),
            "skip_total": len(to_skip),
        },
        "details": {
            "protected": to_update_protected,
            "free_updates": to_update_free,
            "new_units": to_create_props,
            "in_db_not_in_pdf": warnings,
        },
        # Backwards-compatible legacy keys (UI старият flow продължава да работи)
        "to_create": {
            "properties": to_create_props,
            "buyers": to_create_buyers,
        },
        "to_update": {
            "properties": to_update_free + to_update_protected,
            "buyers": to_update_buyers,
        },
        "to_skip": to_skip,
        "warnings": warnings,
    }


@router.post("/import-sessions/{session_id}/apply-floor-plans")
async def apply_floor_plans(
    session_id: str,
    payload: Optional[ApplyFloorPlansRequest] = None,
    user=Depends(require_staff()),
):
    """Apply approved floor-plan pages to `floor_plans` collection.

    Write logic (safe merge):
      * Взима само pages с `review_status=="approved"` и валиден `floor`.
      * Групира по `floor` (ако няколко pages адресират същия етаж, обединяват се).
      * Съществуващ `floor_plans` документ с manual mapping (units с x/y) се SKIP-ва
        освен ако force_overwrite=True. Manual mapping никога не се трие сляпо.
      * Празен / новосъздаден floor_plan получава `import_candidates[]` поле (pairs
        {property_id, code, detected_from_page, source_file_id}) — manual mapper
        може по-късно да ги използва за бързо placing на contours.
      * `units[]` остава ПРАЗЕН от import-а (x/y не се измислят).
      * `plan_image_url` никога не се презаписва — запазва existing стойност.

    Skip reasons: `not_approved`, `missing_floor`, `no_matched_units`,
    `manual_mapping_exists`, `invalid_project_scope`.
    """
    opts = payload or ApplyFloorPlansRequest()
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    project_id = sess["project_id"]
    project = await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    pages = (sess.get("extracted_payload") or {}).get("candidate_floor_plans", []) or []
    approved = [
        p for p in pages
        if p.get("review_status") == "approved" and isinstance(p.get("floor"), (int, float))
    ]

    # Групиране по floor
    by_floor: dict[int, list[dict]] = {}
    for p in pages:
        if p.get("review_status") != "approved":
            continue
        fl = p.get("floor")
        if not isinstance(fl, (int, float)):
            continue
        by_floor.setdefault(int(fl), []).append(p)

    details: list[dict] = []
    created = updated = skipped = 0

    # Non-approved pages report (за пълнота)
    for p in pages:
        if p.get("review_status") == "approved" and isinstance(p.get("floor"), (int, float)):
            continue
        reason = "not_approved" if p.get("review_status") != "approved" else "missing_floor"
        details.append({
            "floor": p.get("floor"),
            "page_number": p.get("page_number"),
            "source_file_id": p.get("source_file_id"),
            "action": "skipped",
            "reason": reason,
            "matched_unit_codes": p.get("matched_unit_codes", []),
            "unmatched_detected_codes": p.get("unmatched_detected_codes", []),
        })
        skipped += 1

    # Pre-change snapshot (само ако ще пишем)
    will_write = not opts.dry_run and bool(by_floor)
    if will_write:
        try:
            await create_prechange_snapshot(
                domain="floor_plans",
                trigger_action="floor_plan_import_apply",
                actor_id=user["id"],
                project_id=project_id,
                entity_scope=f"session:{session_id}",
                scope_queries={"floor_plans": {"project_id": project_id}},
            )
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=f"Snapshot failed: {e}")

    now_iso = datetime.now(timezone.utc).isoformat()

    for floor, floor_pages in sorted(by_floor.items()):
        # Съберi всички matched codes от всички approved pages за този етаж
        all_codes: list[str] = []
        all_source_refs: list[dict] = []
        for p in floor_pages:
            for c in (p.get("matched_unit_codes") or []):
                if c and c not in all_codes:
                    all_codes.append(c)
            all_source_refs.append({
                "source_file_id": p.get("source_file_id"),
                "page_number": p.get("page_number"),
                "detected_unit_codes": p.get("detected_unit_codes", []),
                "unmatched_detected_codes": p.get("unmatched_detected_codes", []),
            })

        if not all_codes:
            details.append({
                "floor": floor,
                "action": "skipped",
                "reason": "no_matched_units",
                "source_refs": all_source_refs,
            })
            skipped += 1
            continue

        # Resolve codes → properties (само за този project + floor)
        props = await db.properties.find(
            {"project_id": project_id, "code": {"$in": all_codes}},
            {"_id": 0, "id": 1, "code": 1, "project_id": 1, "floor": 1},
        ).to_list(500)
        project_prop_codes = {pr["code"]: pr for pr in props}
        resolved: list[dict] = []
        scope_errors: list[str] = []
        for code in all_codes:
            pr = project_prop_codes.get(code)
            if not pr:
                # Кодът липсва в проекта (би трябвало да е бил apply-нат преди)
                scope_errors.append(code)
                continue
            resolved.append({
                "property_id": pr["id"],
                "code": code,
                "property_floor": pr.get("floor"),
            })

        if not resolved:
            details.append({
                "floor": floor,
                "action": "skipped",
                "reason": "invalid_project_scope",
                "extra": {"missing_codes": scope_errors},
                "source_refs": all_source_refs,
            })
            skipped += 1
            continue

        # Проверка за существуващи manual mapping
        existing = await db.floor_plans.find_one(
            {"project_id": project_id, "floor": int(floor)}, {"_id": 0}
        )
        existing_units = (existing or {}).get("units") or []
        has_manual = any(
            (u.get("x") is not None and u.get("y") is not None and
             u.get("width") is not None and u.get("height") is not None)
            for u in existing_units
        )

        if has_manual and not opts.force_overwrite:
            details.append({
                "floor": floor,
                "action": "skipped",
                "reason": "manual_mapping_exists",
                "matched_unit_codes": all_codes,
                "existing_units_count": len(existing_units),
                "source_refs": all_source_refs,
                "hint": "Използвайте force_overwrite=true, ако искате да замените ръчно направените координати (не се препоръчва).",
            })
            skipped += 1
            continue

        # Construct the new / updated doc
        import_candidates = [
            {
                "property_id": r["property_id"],
                "code": r["code"],
                "floor": floor,
            }
            for r in resolved
        ]
        action = "updated" if existing else "created"
        new_doc = {
            "id": existing.get("id") if existing else str(uuid.uuid4()),
            "project_id": project_id,
            "floor": int(floor),
            "plan_image_url": existing.get("plan_image_url") if existing else None,
            "units": existing_units,  # ПАЗИМ existing units (може да са празен масив)
            "import_candidates": import_candidates,
            "imported_from_session_id": session_id,
            "import_meta": {
                "source_refs": all_source_refs,
                "applied_at": now_iso,
                "applied_by": user["id"],
            },
            "updated_at": now_iso,
            "updated_by": user["id"],
        }

        if not opts.dry_run:
            await db.floor_plans.delete_many(
                {"project_id": project_id, "floor": int(floor)}
            )
            await db.floor_plans.insert_one(new_doc)

        details.append({
            "floor": floor,
            "action": action,
            "matched_unit_codes": all_codes,
            "resolved_property_ids": [r["property_id"] for r in resolved],
            "scope_errors": scope_errors,
            "source_refs": all_source_refs,
            "plan_image_url_preserved": bool(new_doc["plan_image_url"]),
        })
        if action == "created":
            created += 1
        else:
            updated += 1

    if will_write:
        await log_action(
            user["id"], "floor_plan_import_apply", "import_session", session_id,
            {
                "created": created, "updated": updated, "skipped": skipped,
                "floors_touched": sorted(by_floor.keys()),
            },
        )

    return {
        "dry_run": opts.dry_run,
        "approved_pages": len(approved),
        "summary": {
            "created": created,
            "updated": updated,
            "skipped": skipped,
        },
        "details": details,
    }


@router.get("/import-sessions/{session_id}/floor-plans-diff")
async def floor_plans_diff(session_id: str, user=Depends(require_staff())):
    """Dry-run предварителен преглед — без да записва нищо."""
    # Просто reuse-ваме apply-floor-plans в dry-run режим
    return await apply_floor_plans(
        session_id,
        ApplyFloorPlansRequest(dry_run=True, force_overwrite=False),
        user=user,
    )


@router.post("/import-sessions/{session_id}/apply")
async def apply_session(session_id: str, user=Depends(require_staff())):
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    if sess.get("status") == "applied":
        raise HTTPException(status_code=400, detail="Сесията вече е приложена")
    extracted = sess.get("extracted_payload") or {}
    conflicts = sess.get("conflicts") or []
    unresolved_critical = [c for c in conflicts if c.get("severity") == "critical"]
    if unresolved_critical:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Има {len(unresolved_critical)} неразрешени критични конфликта — "
                "коригирайте ги преди apply."
            ),
        )

    project_id = sess["project_id"]
    project = await db.projects.find_one({"id": project_id}, {"_id": 0, "id": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    # Mandatory pre-change snapshot — covers both properties and buyers for this project.
    try:
        snap = await create_prechange_snapshot(
            domain="imports",
            trigger_action="import_apply",
            actor_id=user["id"],
            project_id=project_id,
            entity_scope=f"session:{session_id}",
            notes=f"Pre-change snapshot for import session {session_id}",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Snapshot failed: {e}")

    applied_units = 0
    created_units = 0
    protected_updates = 0
    applied_buyers = 0
    created_buyers = 0
    skipped: list[str] = []

    # Greenfield detection и активни резервации (за protection logic)
    existing_count = await db.properties.count_documents({"project_id": project_id})
    is_greenfield = existing_count == 0
    reservation_map = await _active_reservation_map(db, project_id) if not is_greenfield else {}

    audit_rows: list[dict] = []

    def code_of_buyer_for_log(b: dict) -> str:
        return (b.get("name") or b.get("email") or "?").strip() or "?"

    for u in extracted.get("candidate_units", []) or []:
        if not u.get("approved"):
            continue
        code = (u.get("code") or "").strip()
        if not code:
            skipped.append("unit без код")
            continue
        existing = await db.properties.find_one(
            {"project_id": project_id, "code": code}, {"_id": 0}
        )
        desired_all = {
            "code": code,
            "property_type": u.get("property_type"),
            "floor": u.get("floor"),
            "rooms": u.get("rooms"),
            "raw_area": u.get("raw_area"),
            "area_pure": u.get("area_pure"),
            "area_common": u.get("area_common"),
            "area_total": u.get("area_total"),
            "list_price": u.get("start_price_basis"),
            "final_contract_price": u.get("final_price_basis"),
            "status": u.get("status_guess") or "available",
            "project_id": project_id,
            "import_source": {
                "session_id": session_id,
                "source_file_id": u.get("source_file_id"),
                "source_ref": u.get("source_ref"),
            },
        }
        # Strip None to avoid overwrite с празно
        desired_all = {k: v for k, v in desired_all.items() if v is not None}

        if not existing:
            # CREATE
            desired_all["id"] = str(uuid.uuid4())
            desired_all["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.properties.insert_one(desired_all)
            applied_units += 1
            created_units += 1
            audit_rows.append({
                "action": "import_create",
                "property_id": desired_all["id"],
                "code": code,
                "changes": [
                    {"field": k, "from": None, "to": v}
                    for k, v in desired_all.items()
                    if k not in ("id", "created_at", "import_source", "project_id", "_id")
                ],
            })
            continue

        # UPDATE — protection logic
        has_reservation = reservation_map.get(existing["id"], False)
        protected = (not is_greenfield) and _is_property_protected(existing, has_reservation)

        if protected:
            # Само neutral полета + fill-if-empty
            set_fields: dict = {}
            changes: list[dict] = []
            for k in NEUTRAL_IMPORT_FIELDS:
                if k not in desired_all:
                    continue
                new_val = desired_all[k]
                old_val = existing.get(k)
                if old_val != new_val:
                    set_fields[k] = new_val
                    changes.append({"field": k, "from": old_val, "to": new_val})
            for k in FILL_IF_EMPTY_FIELDS:
                if k in desired_all and not existing.get(k):
                    set_fields[k] = desired_all[k]
                    changes.append({"field": k, "from": None, "to": desired_all[k]})
            # Always update import_source traceability
            set_fields["import_source"] = desired_all["import_source"]
            skipped_fields = [
                f for f in PROTECTED_FIELDS
                if f in desired_all and desired_all.get(f) != existing.get(f)
            ]
            if set_fields or skipped_fields:
                await db.properties.update_one({"id": existing["id"]}, {"$set": set_fields})
                applied_units += 1
                protected_updates += 1
            audit_rows.append({
                "action": "import_apply_protected",
                "property_id": existing["id"],
                "code": code,
                "current_status": existing.get("status"),
                "buyer_id": existing.get("buyer_id"),
                "changes": changes,
                "skipped_fields": skipped_fields,
            })
        else:
            # Свободен обект — update всички подадени полета
            changes = _full_changes(existing, desired_all)
            # Не пипай id/created_at/project_id
            set_fields = {k: v for k, v in desired_all.items() if k not in ("id", "created_at", "project_id")}
            await db.properties.update_one({"id": existing["id"]}, {"$set": set_fields})
            applied_units += 1
            audit_rows.append({
                "action": "import_apply_neutral",
                "property_id": existing["id"],
                "code": code,
                "changes": changes,
            })

    for b in extracted.get("candidate_buyers", []) or []:
        if not b.get("approved"):
            continue
        name = (b.get("name") or "").strip()
        if not name or name == "(неизвестен)":
            skipped.append("buyer без име")
            continue
        # Match priority: email (global), then (name + source_project_id) within imported clients
        email = (b.get("email") or "").strip().lower() or None
        existing = None
        if email:
            existing = await db.users.find_one(
                {"email": email, "role": "client", "is_deleted": {"$ne": True}},
                {"_id": 0, "id": 1},
            )
        if not existing:
            existing = await db.users.find_one(
                {
                    "role": "client",
                    "is_deleted": {"$ne": True},
                    "name": name,
                    "source_project_id": project_id,
                },
                {"_id": 0, "id": 1},
            )
        update_fields = {
            "name": name,
            "phone": b.get("phone") or "",
            "preferred_contact": "any",
            "client_note": (b.get("relation") or "Купувач"),
            "is_imported_buyer": True,
            "source_project_id": project_id,
            "source_buyer_relation": b.get("relation"),
        }
        if email:
            update_fields["email"] = email
        if existing:
            await db.users.update_one(
                {"id": existing["id"]},
                {"$set": {k: v for k, v in update_fields.items() if v is not None}},
            )
            buyer_id = existing["id"]
        else:
            buyer_id = str(uuid.uuid4())
            placeholder_email = email or f"imported+{buyer_id.split('-')[0][:8]}@begestates.bg"
            new_user = {
                "id": buyer_id,
                "email": placeholder_email,
                "role": "client",
                "two_factor_enabled": False,
                "is_deleted": False,
                "must_change_password": True,
                "password_hash": None,
                "password_set_at": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                **update_fields,
            }
            try:
                await db.users.insert_one(new_user)
            except Exception:
                # Конфликт по email → fallback към placeholder с прибавено суфикс
                new_user["email"] = f"imported+{buyer_id.split('-')[0][:8]}@begestates.bg"
                await db.users.insert_one(new_user)
            created_buyers += 1
        applied_buyers += 1

        # Link buyer to unit if possible — НО не пипаме защитени обекти,
        # които вече имат buyer_id. Това запазва ръчно настроените връзки.
        if b.get("linked_unit_code"):
            prop = await db.properties.find_one(
                {"project_id": project_id, "code": b["linked_unit_code"]},
                {"_id": 0, "id": 1, "status": 1, "buyer_id": 1},
            )
            if prop:
                has_res = reservation_map.get(prop["id"], False)
                is_protected = (not is_greenfield) and _is_property_protected(prop, has_res)
                already_linked_to_other = prop.get("buyer_id") and prop.get("buyer_id") != buyer_id
                if is_protected and already_linked_to_other:
                    skipped.append(
                        f"buyer link {code_of_buyer_for_log(b)} → {b['linked_unit_code']}: "
                        "защитен обект с друг купувач"
                    )
                else:
                    await db.properties.update_one(
                        {"id": prop["id"]}, {"$set": {"buyer_id": buyer_id}}
                    )

    report = {
        "applied_units": applied_units,
        "created_units": created_units,
        "protected_updates": protected_updates,
        "neutral_updates": applied_units - created_units - protected_updates,
        "is_greenfield": is_greenfield,
        "applied_buyers": applied_buyers,
        "created_buyers": created_buyers,
        "skipped": skipped,
        "prechange_snapshot_id": snap["id"],
    }
    await db.import_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "applied",
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "apply_report": report,
        }},
    )
    # Per-property audit entries (accountability)
    for row in audit_rows:
        await log_action(
            user["id"],
            row["action"],
            "property",
            row["property_id"],
            {
                "code": row.get("code"),
                "changes": row.get("changes") or [],
                "skipped_fields": row.get("skipped_fields") or [],
                "current_status": row.get("current_status"),
                "buyer_id": row.get("buyer_id"),
                "import_session_id": session_id,
            },
        )
    await log_action(
        user["id"], "import_session_apply", "import_session", session_id, report
    )
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    return {"session": _public_session(sess), "report": report}


@router.get("/import-sessions/{session_id}/files/{file_id}/page/{page}")
async def file_page_preview(
    session_id: str,
    file_id: str,
    page: int,
    _=Depends(require_staff()),
):
    db = get_db()
    sess = await db.import_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Сесията не е намерена")
    f = next((x for x in sess.get("files") or [] if x["id"] == file_id), None)
    if not f:
        raise HTTPException(status_code=404, detail="Файлът не е намерен")
    blob = Path(f["stored_path"]).read_bytes()
    png = _render_page_thumbnail(blob, page - 1)
    if not png:
        raise HTTPException(status_code=404, detail="Страницата не е налична")
    return Response(content=png, media_type="image/png")


# ---------------------------------------------------------------------------
# BULK IMPORT — JSON-driven, заобикаля счупения regex parser
# ---------------------------------------------------------------------------
_VALID_PROPERTY_TYPES = {"apartment", "garage", "parking", "yard_parking", "storage", "house", "shop"}


@router.post("/admin/import/bulk-properties")
async def bulk_import_properties(
    payload: BulkImportRequest,
    user=Depends(require_staff()),
):
    """Bulk създаване / обновяване на обекти от готов JSON.

    Реизползва Smart Import Diff логиката — продадени / резервирани обекти се
    защитават; свободните се обновяват напълно; нови се създават.
    """
    db = get_db()
    if payload.mode not in ("smart_diff", "force_create"):
        raise HTTPException(status_code=400, detail="mode трябва да е 'smart_diff' или 'force_create'")
    if not payload.properties:
        raise HTTPException(status_code=400, detail="properties е празен")

    project = await db.projects.find_one({"id": payload.project_id}, {"_id": 0, "id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Проектът не е намерен")

    # Валидация на property_type
    invalid = [p.code for p in payload.properties if p.property_type not in _VALID_PROPERTY_TYPES]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Невалиден property_type за: {invalid[:5]} (валидни: {sorted(_VALID_PROPERTY_TYPES)})",
        )
    # Дубликати в payload
    code_counts: dict[str, int] = {}
    for p in payload.properties:
        code_counts[p.code] = code_counts.get(p.code, 0) + 1
    dups = [c for c, n in code_counts.items() if n > 1]
    if dups:
        raise HTTPException(status_code=400, detail=f"Дублирани кодове в payload: {dups}")

    existing_count = await db.properties.count_documents({"project_id": payload.project_id})
    is_greenfield = existing_count == 0
    reservation_map = await _active_reservation_map(db, payload.project_id) if not is_greenfield else {}

    created: list[dict] = []
    updated_free: list[dict] = []
    updated_protected: list[dict] = []
    skipped: list[dict] = []
    audit_rows: list[dict] = []

    now_iso = datetime.now(timezone.utc).isoformat()

    # Pre-change snapshot (ако ще пишем и не е greenfield)
    if not payload.dry_run and not is_greenfield:
        try:
            await create_prechange_snapshot(
                domain="properties",
                trigger_action="bulk_import_apply",
                actor_id=user["id"],
                project_id=payload.project_id,
                entity_scope=f"bulk:{payload.project_id}",
                scope_queries={"properties": {"project_id": payload.project_id}},
            )
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=f"Snapshot failed: {e}")

    for p in payload.properties:
        code = (p.code or "").strip()
        if not code:
            skipped.append({"code": None, "reason": "липсва code"})
            continue

        desired = p.model_dump(exclude_none=True)
        # status default = "available" при create
        if "status" not in desired:
            desired["status"] = "available"

        existing = await db.properties.find_one(
            {"project_id": payload.project_id, "code": code}, {"_id": 0}
        )

        if not existing:
            if payload.dry_run:
                created.append({"code": code, "property_type": desired.get("property_type")})
            else:
                new_doc = {
                    "id": str(uuid.uuid4()),
                    "project_id": payload.project_id,
                    "code": code,
                    "created_at": now_iso,
                    "import_source": {
                        "kind": "bulk_import",
                        "imported_at": now_iso,
                        "imported_by": user["id"],
                    },
                    **desired,
                }
                await db.properties.insert_one(new_doc)
                created.append({
                    "code": code,
                    "property_type": desired.get("property_type"),
                    "id": new_doc["id"],
                })
                audit_rows.append({
                    "action": "bulk_import_create",
                    "property_id": new_doc["id"],
                    "code": code,
                    "changes": [{"field": k, "from": None, "to": v} for k, v in desired.items()],
                })
            continue

        # Existing — force_create режим: пропускаме
        if payload.mode == "force_create":
            skipped.append({"code": code, "reason": "вече съществува (force_create)"})
            continue

        has_reservation = reservation_map.get(existing["id"], False)
        protected = (not is_greenfield) and _is_property_protected(existing, has_reservation)

        if protected:
            # Само neutral fields + fill-if-empty
            set_fields: dict = {}
            changes: list[dict] = []
            for k in NEUTRAL_IMPORT_FIELDS:
                if k in desired and desired[k] != existing.get(k):
                    set_fields[k] = desired[k]
                    changes.append({"field": k, "from": existing.get(k), "to": desired[k]})
            for k in FILL_IF_EMPTY_FIELDS:
                if k in desired and not existing.get(k):
                    set_fields[k] = desired[k]
                    changes.append({"field": k, "from": None, "to": desired[k]})
            skipped_fields = [
                f for f in PROTECTED_FIELDS
                if f in desired and desired.get(f) != existing.get(f)
            ]
            if (set_fields or skipped_fields):
                if not payload.dry_run and set_fields:
                    set_fields["import_source"] = {
                        "kind": "bulk_import",
                        "imported_at": now_iso,
                        "imported_by": user["id"],
                    }
                    await db.properties.update_one({"id": existing["id"]}, {"$set": set_fields})
                updated_protected.append({
                    "code": code,
                    "existing_id": existing["id"],
                    "current_status": existing.get("status"),
                    "buyer_id": existing.get("buyer_id"),
                    "neutral_changes": changes,
                    "skipped_fields": skipped_fields,
                })
                audit_rows.append({
                    "action": "bulk_import_protected",
                    "property_id": existing["id"],
                    "code": code,
                    "changes": changes,
                    "skipped_fields": skipped_fields,
                    "current_status": existing.get("status"),
                })
            else:
                skipped.append({"code": code, "reason": "защитен, без релевантни промени"})
        else:
            # Свободен — full update
            changes = _full_changes(existing, desired)
            if changes:
                if not payload.dry_run:
                    set_fields = {k: v for k, v in desired.items() if k not in ("id", "created_at", "project_id")}
                    set_fields["import_source"] = {
                        "kind": "bulk_import",
                        "imported_at": now_iso,
                        "imported_by": user["id"],
                    }
                    await db.properties.update_one({"id": existing["id"]}, {"$set": set_fields})
                updated_free.append({
                    "code": code,
                    "existing_id": existing["id"],
                    "current_status": existing.get("status") or "available",
                    "changes": changes,
                })
                audit_rows.append({
                    "action": "bulk_import_neutral",
                    "property_id": existing["id"],
                    "code": code,
                    "changes": changes,
                })
            else:
                skipped.append({"code": code, "reason": "вече съществува, без промени"})

    # Per-property audit
    if not payload.dry_run:
        for row in audit_rows:
            await log_action(
                user["id"], row["action"], "property", row["property_id"],
                {
                    "code": row.get("code"),
                    "changes": row.get("changes") or [],
                    "skipped_fields": row.get("skipped_fields") or [],
                    "current_status": row.get("current_status"),
                },
            )
        await log_action(
            user["id"], "bulk_import_apply", "project", payload.project_id,
            {
                "total": len(payload.properties),
                "created": len(created),
                "updated_neutral": len(updated_free),
                "updated_protected": len(updated_protected),
                "skipped": len(skipped),
                "mode": payload.mode,
            },
        )

    return {
        "project_id": payload.project_id,
        "project_name": project.get("name"),
        "is_greenfield": is_greenfield,
        "dry_run": payload.dry_run,
        "mode": payload.mode,
        "summary": {
            "total_in_payload": len(payload.properties),
            "created": len(created),
            "updated_neutral": len(updated_free),
            "updated_protected": len(updated_protected),
            "skipped": len(skipped),
        },
        "details": {
            "created": created,
            "free_updates": updated_free,
            "protected": updated_protected,
            "skipped": skipped,
        },
    }

