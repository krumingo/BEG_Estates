"""Audit log helper + routes."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth.dependencies import require_staff
from db import get_db

router = APIRouter(prefix="/audit-logs", tags=["audit"])


async def log_action(actor_id: str | None, action: str, entity: str, entity_id: str, meta: dict | None):
    db = get_db()
    await db.audit_logs.insert_one(
        {
            "id": str(uuid.uuid4()),
            "actor_id": actor_id,
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "meta": meta or {},
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )


@router.get("")
async def list_audit(_: dict = Depends(require_staff())):
    db = get_db()
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).to_list(200)
    return logs
