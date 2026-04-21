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
from services.document_import import analyze_files, _render_page_thumbnail
from services.snapshots import create_prechange_snapshot

router = APIRouter(tags=["imports"])


UPLOAD_ROOT = Path(os.environ.get("IMPORTS_DIR", "/app/backend/uploads/import_sessions"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB per PDF


class CreateSessionIn(BaseModel):
    project_id: str


class ReviewPayloadUpdate(BaseModel):
    candidate_units: Optional[list[dict]] = None
    candidate_buyers: Optional[list[dict]] = None
    candidate_floor_plans: Optional[list[dict]] = None


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
        })

    result = analyze_files(file_blobs)
    per_file_by_id = {pf["id"]: pf for pf in result["per_file"]}
    for f in sess["files"]:
        pf = per_file_by_id.get(f["id"])
        if pf:
            f["document_type_guess"] = pf["document_type_guess"]
            f["document_type_guess_confidence"] = pf["document_type_guess_confidence"]
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
    applied_buyers = 0
    created_buyers = 0
    skipped: list[str] = []

    for u in extracted.get("candidate_units", []) or []:
        if not u.get("approved"):
            continue
        code = (u.get("code") or "").strip()
        if not code:
            skipped.append("unit без код")
            continue
        existing = await db.properties.find_one(
            {"project_id": project_id, "code": code}, {"_id": 0, "id": 1}
        )
        set_fields = {
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
        # Strip None values to avoid nuking existing data
        set_fields = {k: v for k, v in set_fields.items() if v is not None}
        if existing:
            await db.properties.update_one({"id": existing["id"]}, {"$set": set_fields})
            applied_units += 1
        else:
            set_fields["id"] = str(uuid.uuid4())
            set_fields["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.properties.insert_one(set_fields)
            applied_units += 1
            created_units += 1

    for b in extracted.get("candidate_buyers", []) or []:
        if not b.get("approved"):
            continue
        name = (b.get("name") or "").strip()
        if not name or name == "(неизвестен)":
            skipped.append("buyer без име")
            continue
        query = {"project_id": project_id, "name": name}
        existing = await db.buyers.find_one(query, {"_id": 0, "id": 1})
        set_fields = {
            "project_id": project_id,
            "name": name,
            "phone": b.get("phone"),
            "email": b.get("email"),
            "relation": b.get("relation") or "Купувач",
        }
        set_fields = {k: v for k, v in set_fields.items() if v is not None}
        if existing:
            await db.buyers.update_one({"id": existing["id"]}, {"$set": set_fields})
            buyer_id = existing["id"]
        else:
            set_fields["id"] = str(uuid.uuid4())
            set_fields["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.buyers.insert_one(set_fields)
            buyer_id = set_fields["id"]
            created_buyers += 1
        applied_buyers += 1

        # Link buyer to unit if possible
        if b.get("linked_unit_code"):
            prop = await db.properties.find_one(
                {"project_id": project_id, "code": b["linked_unit_code"]}, {"_id": 0, "id": 1}
            )
            if prop:
                await db.properties.update_one(
                    {"id": prop["id"]}, {"$set": {"buyer_id": buyer_id}}
                )

    report = {
        "applied_units": applied_units,
        "created_units": created_units,
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
