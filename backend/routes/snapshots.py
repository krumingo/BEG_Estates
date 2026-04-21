"""Admin: list/detail of pre-change snapshots + safe restore."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from auth.dependencies import require_staff
from db import get_db
from routes.audit import log_action
from services.snapshots import (
    public_snapshot,
    restore_as_new_version,
)

router = APIRouter(tags=["snapshots"])


@router.get("/snapshots")
async def list_snapshots(
    project_id: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    trigger_action: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    _=Depends(require_staff()),
):
    db = get_db()
    q: dict = {}
    if project_id:
        q["project_id"] = project_id
    if domain:
        q["domain"] = domain
    if trigger_action:
        q["trigger_action"] = trigger_action
    items = (
        await db.change_snapshots.find(q, {"_id": 0, "before_state": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )
    return items


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot(snapshot_id: str, _=Depends(require_staff())):
    db = get_db()
    snap = await db.change_snapshots.find_one({"id": snapshot_id}, {"_id": 0})
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot не е намерен")
    exports = (
        await db.snapshot_exports.find({"snapshot_id": snapshot_id}, {"_id": 0})
        .sort("exported_at", -1)
        .to_list(10)
    )
    return {**public_snapshot(snap, include_state=True), "exports": exports}


@router.post("/snapshots/{snapshot_id}/restore-as-new-version")
async def restore_snapshot(snapshot_id: str, user=Depends(require_staff())):
    try:
        result = await restore_as_new_version(snapshot_id, actor_id=user["id"])
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await log_action(
        user["id"],
        "snapshot_restore",
        "snapshot",
        snapshot_id,
        {
            "pre_restore_snapshot_id": result["pre_restore_snapshot_id"],
            "applied_counts": result["applied_counts"],
        },
    )
    return {
        "pre_restore_snapshot_id": result["pre_restore_snapshot_id"],
        "pre_restore_version": result["pre_restore_version"],
        "applied_counts": result["applied_counts"],
    }
