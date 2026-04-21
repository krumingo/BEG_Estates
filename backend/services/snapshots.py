"""Pre-change snapshots + versioning + separate-storage export.

Design: every critical write must call ``create_prechange_snapshot`` first.
If the snapshot record cannot be created, the caller must abort.  The JSON
export is written to a *separate* directory (``SNAPSHOT_EXPORT_DIR``) so it
can later be swapped for object storage without touching call-sites.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from db import get_db

EXPORT_ROOT = Path(
    os.environ.get("SNAPSHOT_EXPORT_DIR", "/app/exports/beg_estates_snapshots")
)
EXPORT_ROOT.mkdir(parents=True, exist_ok=True)


DOMAIN_COLLECTIONS: dict[str, list[str]] = {
    "properties": ["properties"],
    "buyers": ["buyers"],
    "floor_plans": ["floor_plans"],
    "payment_plans": ["payment_plans", "payment_installments"],
    "payment_installments": ["payment_installments"],
    "payments": ["payments", "payment_installments"],
    "reservations": ["reservations", "properties"],
    "imports": ["properties", "buyers"],
    "messages": ["messages"],
    "client_profiles": ["users"],
}


def _serialise(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.isoformat()
    # Stringify any BSON / ObjectId-like values; fall back to repr.
    if type(v).__name__ == "ObjectId":
        return str(v)
    if isinstance(v, dict):
        return {k: _serialise(val) for k, val in v.items() if k != "_id"}
    if isinstance(v, (list, tuple)):
        return [_serialise(x) for x in v]
    return v


def _serialise_doc(doc: dict) -> dict:
    return _serialise({k: v for k, v in doc.items() if k != "_id"})


async def _snapshot_version_number(db, domain: str) -> int:
    last = await db.change_snapshots.find_one(
        {"domain": domain}, {"_id": 0, "snapshot_version_number": 1},
        sort=[("snapshot_version_number", -1)],
    )
    return int((last or {}).get("snapshot_version_number") or 0) + 1


def _checksum(obj: Any) -> str:
    blob = json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


async def create_prechange_snapshot(
    *,
    domain: str,
    trigger_action: str,
    actor_id: Optional[str],
    project_id: Optional[str] = None,
    entity_scope: str = "",
    scope_queries: Optional[dict[str, dict]] = None,
    notes: Optional[str] = None,
) -> dict:
    """Capture current state of the domain's collections and export to disk.

    ``scope_queries`` maps a collection name to the Mongo filter that defines
    *what* to snapshot.  If omitted for a collection, a best-effort project
    filter is applied.  Raises ``RuntimeError`` if the snapshot record cannot
    be created — the caller must abort the write.
    """
    db = get_db()
    collections = DOMAIN_COLLECTIONS.get(domain)
    if not collections:
        raise RuntimeError(f"Unknown snapshot domain: {domain}")

    before_state: dict[str, list[dict]] = {}
    scope_queries = dict(scope_queries or {})
    for coll in collections:
        q = scope_queries.get(coll)
        if q is None:
            q = {"project_id": project_id} if project_id else {}
        try:
            docs = await db[coll].find(q, {"_id": 0}).to_list(5000)
        except Exception as e:  # read failure must abort
            raise RuntimeError(f"Snapshot read failed for {coll}: {e}")
        before_state[coll] = [_serialise_doc(d) for d in docs]

    sid = str(uuid.uuid4())
    version_number = await _snapshot_version_number(db, domain)
    checksum = _checksum(before_state)
    created_at = datetime.now(timezone.utc).isoformat()

    snapshot = {
        "id": sid,
        "project_id": project_id,
        "domain": domain,
        "entity_scope": entity_scope,
        "trigger_action": trigger_action,
        "actor_id": actor_id,
        "created_at": created_at,
        "snapshot_version_number": version_number,
        "before_state": before_state,
        "before_state_checksum": checksum,
        "export_status": "pending",
        "export_ref": None,
        "notes": notes or "",
    }
    # Record FIRST — if this fails the caller must abort.
    await db.change_snapshots.insert_one(snapshot)

    # Export attempt (failure is non-fatal; export_status captures it).
    export_doc = await _export_snapshot(snapshot)
    await db.change_snapshots.update_one(
        {"id": sid},
        {"$set": {
            "export_status": "exported" if export_doc["success"] else "failed",
            "export_ref": export_doc["storage_path"],
        }},
    )
    await db.snapshot_exports.insert_one(export_doc)

    snapshot["export_status"] = "exported" if export_doc["success"] else "failed"
    snapshot["export_ref"] = export_doc["storage_path"]
    return snapshot


async def _export_snapshot(snapshot: dict) -> dict:
    sid = snapshot["id"]
    domain = snapshot["domain"]
    project_dir = snapshot.get("project_id") or "_global"
    folder = EXPORT_ROOT / project_dir / domain
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{snapshot['snapshot_version_number']:06d}_{sid}.json.gz"
    payload = {
        "metadata": {k: v for k, v in snapshot.items() if k not in ("before_state", "_id")},
        "before_state": snapshot["before_state"],
    }
    try:
        blob = json.dumps(payload, ensure_ascii=False, indent=None).encode("utf-8")
        with gzip.open(path, "wb") as fh:
            fh.write(blob)
        return {
            "id": str(uuid.uuid4()),
            "snapshot_id": sid,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "storage_type": "local_fs",
            "storage_path": str(path),
            "checksum": _checksum(payload),
            "success": True,
            "error": None,
        }
    except Exception as e:
        return {
            "id": str(uuid.uuid4()),
            "snapshot_id": sid,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "storage_type": "local_fs",
            "storage_path": str(path),
            "checksum": None,
            "success": False,
            "error": str(e),
        }


async def restore_as_new_version(
    snapshot_id: str, actor_id: str
) -> dict:
    """Safe restore: re-apply the snapshot's ``before_state`` as an upsert +
    take a fresh pre-change snapshot so the history is preserved.
    """
    db = get_db()
    snapshot = await db.change_snapshots.find_one({"id": snapshot_id}, {"_id": 0})
    if not snapshot:
        raise RuntimeError("Snapshot не е намерен")

    # 1. Snapshot current state *before* restoring, so the restore itself is reversible.
    pre = await create_prechange_snapshot(
        domain=snapshot["domain"],
        trigger_action="snapshot_restore_prestate",
        actor_id=actor_id,
        project_id=snapshot.get("project_id"),
        entity_scope=snapshot.get("entity_scope") or "",
        notes=f"automatic pre-state before restoring {snapshot_id}",
    )

    # 2. Re-apply every document in before_state by upsert on ``id``.
    applied: dict[str, int] = {}
    for coll, docs in (snapshot.get("before_state") or {}).items():
        applied[coll] = 0
        for doc in docs:
            doc = dict(doc)
            doc.pop("_id", None)
            key = {"id": doc["id"]} if "id" in doc else doc
            await db[coll].update_one(key, {"$set": doc}, upsert=True)
            applied[coll] += 1

    return {
        "snapshot": snapshot,
        "pre_restore_snapshot_id": pre["id"],
        "pre_restore_version": pre["snapshot_version_number"],
        "applied_counts": applied,
    }


def public_snapshot(snapshot: dict, *, include_state: bool = False) -> dict:
    out = {k: v for k, v in snapshot.items() if k != "_id"}
    if not include_state:
        out.pop("before_state", None)
    else:
        # Summary counts per collection for quick UI rendering
        counts = {k: len(v) for k, v in (snapshot.get("before_state") or {}).items()}
        out["before_state_counts"] = counts
    return out


__all__ = [
    "create_prechange_snapshot",
    "restore_as_new_version",
    "public_snapshot",
    "EXPORT_ROOT",
]
