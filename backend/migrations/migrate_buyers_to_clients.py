"""One-time, idempotent migration: db.buyers → db.users (role=client).

Trigger: server startup (called from server.py before seed_all()).
Behavior:
- If db.buyers collection has 0 records (or doesn't exist) → noop.
- For each buyer:
    * If a client (user with role=client) with same email already exists →
      LINK: update properties.buyer_id pointing to old buyer.id → existing user.id.
      Backfill missing fields (phone, name, notes, client_type=compensation if relation says so).
    * If buyer has no email or no matching client →
      CREATE new user (role=client, no password_hash → login disabled),
      copy buyer data, set client_type from relation, is_active=True.
      Update properties.buyer_id pointing to old buyer.id → new user.id.
- After processing → DROP db.buyers collection.
- Audit log: action="buyers_migrated_to_clients", summary={...}.
"""
import logging
import uuid
from datetime import datetime, timezone

from constants import Role
from db import get_db
from routes.audit import log_action

logger = logging.getLogger(__name__)


def _client_type_from_relation(relation: str | None) -> str:
    if not relation:
        return "buyer"
    r = relation.strip().lower()
    if "обезщет" in r or "compensation" in r:
        return "compensation"
    if "инвестит" in r or "investor" in r:
        return "investor"
    if "фирм" in r or "company" in r:
        return "company"
    return "buyer"


async def migrate_buyers_to_clients():
    db = get_db()

    # ----- Backfill defaults on existing role=client users -----
    # Any login client without explicit client_type → default to "buyer".
    # Any login client without explicit is_active → default to True.
    now_iso = datetime.now(timezone.utc).isoformat()
    backfill_type = await db.users.update_many(
        {"role": Role.CLIENT.value, "client_type": {"$exists": False}},
        {"$set": {"client_type": "buyer"}},
    )
    backfill_active = await db.users.update_many(
        {"role": Role.CLIENT.value, "is_active": {"$exists": False}},
        {"$set": {"is_active": True}},
    )
    if backfill_type.modified_count or backfill_active.modified_count:
        logger.info(
            "client field backfill: client_type=%d, is_active=%d",
            backfill_type.modified_count, backfill_active.modified_count,
        )

    # Idempotency check — does the buyers collection have any records?
    try:
        existing_collections = await db.list_collection_names()
    except Exception:
        existing_collections = []
    if "buyers" not in existing_collections:
        return {"skipped": True, "reason": "buyers_collection_absent"}

    buyers = await db.buyers.find({}, {"_id": 0}).to_list(1000)
    if not buyers:
        # Empty collection — drop it and exit.
        await db.buyers.drop()
        return {"skipped": True, "reason": "buyers_collection_empty_dropped"}

    linked = 0
    created = 0
    properties_updated = 0

    for b in buyers:
        old_id = b.get("id")
        email = (b.get("email") or "").strip().lower() or None
        client_type = _client_type_from_relation(b.get("relation"))

        target_id: str | None = None
        if email:
            existing_user = await db.users.find_one(
                {"email": email, "role": Role.CLIENT.value}, {"_id": 0, "id": 1}
            )
            if existing_user:
                target_id = existing_user["id"]
                # Backfill missing fields without overwriting existing data
                backfill: dict = {"is_active": True, "updated_at": now_iso}
                if b.get("phone") and not (await db.users.find_one({"id": target_id, "phone": {"$exists": True, "$ne": None, "$ne": ""}})):
                    backfill["phone"] = b["phone"]
                if b.get("name"):
                    # Only set name if blank
                    cur = await db.users.find_one({"id": target_id}, {"_id": 0, "name": 1})
                    if not (cur or {}).get("name"):
                        backfill["name"] = b["name"]
                if b.get("notes"):
                    cur = await db.users.find_one({"id": target_id}, {"_id": 0, "notes": 1})
                    if not (cur or {}).get("notes"):
                        backfill["notes"] = b["notes"]
                # Always upgrade client_type if relation says compensation
                if client_type != "buyer":
                    backfill["client_type"] = client_type
                else:
                    cur = await db.users.find_one({"id": target_id}, {"_id": 0, "client_type": 1})
                    if not (cur or {}).get("client_type"):
                        backfill["client_type"] = "buyer"
                await db.users.update_one({"id": target_id}, {"$set": backfill})
                linked += 1

        if target_id is None:
            # Create new user as buyer-only client (no login)
            target_id = str(uuid.uuid4())
            new_doc: dict = {
                "id": target_id,
                "role": Role.CLIENT.value,
                "name": b.get("name") or "Без име",
                "client_type": client_type,
                "is_active": True,
                "two_factor_enabled": False,
                "created_at": b.get("created_at") or now_iso,
                "updated_at": now_iso,
            }
            if email:
                new_doc["email"] = email
            if b.get("phone"):
                new_doc["phone"] = b["phone"]
            if b.get("notes"):
                new_doc["notes"] = b["notes"]
            await db.users.insert_one(new_doc)
            created += 1

        # Re-point properties.buyer_id from old buyer.id → target user.id
        if old_id and old_id != target_id:
            res = await db.properties.update_many(
                {"buyer_id": old_id},
                {"$set": {"buyer_id": target_id}},
            )
            properties_updated += res.modified_count
            # Same for payment_plans, payment_installments, payments (if they reference buyer_id)
            for col in ("payment_plans", "payment_installments", "payments"):
                try:
                    await db[col].update_many(
                        {"buyer_id": old_id},
                        {"$set": {"buyer_id": target_id}},
                    )
                except Exception:
                    pass

    # Drop the buyers collection
    await db.buyers.drop()

    summary = {
        "buyers_processed": len(buyers),
        "linked_to_existing_clients": linked,
        "newly_created_clients": created,
        "properties_repointed": properties_updated,
        "buyers_collection_dropped": True,
    }
    await log_action(None, "buyers_migrated_to_clients", "system", "migration", summary)
    logger.info("buyers→clients migration: %s", summary)
    return summary
