"""G.1 cleanup — drop legacy financial collections (sales, quotes, payment trackers).

Idempotent: writes a marker doc into `_migrations` so it only runs once.
Properties keep their `buyer_id` and `status` (audit trail preserved).
"""
import logging
from datetime import datetime, timezone

from db import get_db

logger = logging.getLogger(__name__)

_MARKER_KEY = "g1_cleanup_old_financial"


async def cleanup_old_financial() -> None:
    db = get_db()

    marker = await db._migrations.find_one({"key": _MARKER_KEY}) if hasattr(db, "_migrations") else None
    # motor can't use `_migrations` via attribute (starts with underscore in some envs);
    # use get_collection to be safe.
    migrations = db.get_collection("_migrations")
    marker = await migrations.find_one({"key": _MARKER_KEY})
    if marker:
        return  # already done

    # If a `deals` collection already has records, treat as already-done.
    deals_count = await db.deals.estimated_document_count()
    if deals_count > 0:
        await migrations.insert_one({
            "key": _MARKER_KEY,
            "skipped": True,
            "reason": "deals_collection_already_populated",
            "at": datetime.now(timezone.utc).isoformat(),
        })
        return

    legacy_collections = [
        "sales",
        "quotes",
        "payment_plans",
        "payment_installments",
        "payments",
        "payment_tracking",
    ]
    dropped = {}
    for coll in legacy_collections:
        try:
            count = await db[coll].estimated_document_count()
            if count > 0:
                await db[coll].drop()
                dropped[coll] = count
                logger.info("cleanup_old_financial: dropped %s (%d docs)", coll, count)
        except Exception as exc:  # pragma: no cover
            logger.warning("cleanup_old_financial: failed to drop %s: %s", coll, exc)

    properties_preserved = await db.properties.estimated_document_count()

    # Audit log entry
    await db.audit_logs.insert_one({
        "actor_id": "system",
        "action": "financial_module_reset",
        "entity_type": "system",
        "entity_id": "g1_cleanup",
        "details": {
            "dropped_collections": dropped,
            "properties_preserved": properties_preserved,
        },
        "at": datetime.now(timezone.utc).isoformat(),
    })

    await migrations.insert_one({
        "key": _MARKER_KEY,
        "dropped": dropped,
        "properties_preserved": properties_preserved,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info(
        "cleanup_old_financial complete: dropped=%s preserved_properties=%d",
        dropped,
        properties_preserved,
    )
