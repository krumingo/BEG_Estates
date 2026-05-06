"""G.2.1 — rename payment terminology to bank_loan / own_funds + bucket=own.

Idempotent: marker doc in `_migrations`.
Migrates:
- deal.payment_mode.mode: with_bank → bank_loan, without_bank → own_funds
- deal.payment_mode.non_bank_amount → own_amount
- deal.payment_mode.invoice_amount → own_invoice_amount
- deal.payment_mode.proforma_amount → own_proforma_amount
- adds bank_invoice_amount (= bank_amount), bank_proforma_amount (= 0)
- deal.non_bank_stages → deal.own_stages
- stage.bucket: "non_bank" → "own"
"""
import logging
from datetime import datetime, timezone

from db import get_db

logger = logging.getLogger(__name__)
_MARKER_KEY = "g2_1_rename_payment_terminology"

_MODE_MAP = {"with_bank": "bank_loan", "without_bank": "own_funds"}


async def rename_payment_terminology() -> None:
    db = get_db()
    migrations = db.get_collection("_migrations")
    if await migrations.find_one({"key": _MARKER_KEY}):
        return

    migrated = 0
    deals_cursor = db.deals.find({}, {"_id": 0})
    async for deal in deals_cursor:
        changes: dict = {}

        # --- payment_mode rename ---
        pm = deal.get("payment_mode") or {}
        new_pm = dict(pm)

        old_mode = pm.get("mode")
        if old_mode in _MODE_MAP:
            new_pm["mode"] = _MODE_MAP[old_mode]

        if "non_bank_amount" in pm and "own_amount" not in pm:
            new_pm["own_amount"] = pm["non_bank_amount"]
        if "invoice_amount" in pm and "own_invoice_amount" not in pm:
            new_pm["own_invoice_amount"] = pm["invoice_amount"]
        if "proforma_amount" in pm and "own_proforma_amount" not in pm:
            new_pm["own_proforma_amount"] = pm["proforma_amount"]

        new_pm.setdefault("bank_amount", pm.get("bank_amount", 0.0))
        new_pm.setdefault("own_amount", new_pm.get("own_amount", 0.0))
        new_pm.setdefault("bank_invoice_amount", new_pm.get("bank_amount", 0.0))
        new_pm.setdefault("bank_proforma_amount", 0.0)
        new_pm.setdefault("own_invoice_amount", new_pm.get("own_amount", 0.0))
        new_pm.setdefault("own_proforma_amount", 0.0)

        # Drop legacy keys
        for k in ("non_bank_amount", "invoice_amount", "proforma_amount"):
            new_pm.pop(k, None)

        if new_pm != pm:
            changes["payment_mode"] = new_pm

        # --- stages rename ---
        old_non_bank = deal.get("non_bank_stages")
        if old_non_bank is not None:
            renamed = []
            for s in old_non_bank:
                new_s = dict(s)
                if new_s.get("bucket") == "non_bank":
                    new_s["bucket"] = "own"
                renamed.append(new_s)
            changes["own_stages"] = renamed

        # Bank stages — just update bucket value if needed
        bank_stages = deal.get("bank_stages") or []
        if bank_stages:
            new_bank = []
            mutated = False
            for s in bank_stages:
                new_s = dict(s)
                if new_s.get("bucket") not in ("bank", "own"):
                    new_s["bucket"] = "bank"
                    mutated = True
                new_bank.append(new_s)
            if mutated:
                changes["bank_stages"] = new_bank

        if changes:
            update_doc = {"$set": changes}
            if old_non_bank is not None:
                update_doc["$unset"] = {"non_bank_stages": ""}
            await db.deals.update_one({"id": deal["id"]}, update_doc)
            migrated += 1

    await db.audit_logs.insert_one({
        "actor_id": "system",
        "action": "terminology_migration",
        "entity_type": "system",
        "entity_id": "g2_1_rename",
        "details": {"deals_migrated": migrated},
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await migrations.insert_one({
        "key": _MARKER_KEY,
        "deals_migrated": migrated,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("rename_payment_terminology: migrated %d deals", migrated)
