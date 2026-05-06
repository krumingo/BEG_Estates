"""Auto-seed Sale records for existing sold/compensation properties.

Idempotent: skips properties that already have an active Sale.
Runs at server startup. Logs how many sales were auto-created.
"""
import logging

from db import get_db
from routes.sales import auto_create_sale_for_property

logger = logging.getLogger(__name__)


async def auto_seed_sales():
    db = get_db()
    sold_like = await db.properties.find(
        {"status": {"$in": ["sold", "compensation"]}}, {"_id": 0}
    ).to_list(5000)
    if not sold_like:
        return {"seeded": 0, "skipped_no_buyer": 0, "skipped_existing": 0}

    seeded = 0
    skipped_no_buyer = 0
    skipped_existing = 0
    breakdown_by_status: dict[str, int] = {"sold": 0, "compensation": 0}

    for prop in sold_like:
        if not prop.get("buyer_id"):
            skipped_no_buyer += 1
            continue
        existing = await db.sales.find_one(
            {"property_id": prop["id"], "is_active": True}, {"_id": 0, "id": 1}
        )
        if existing:
            skipped_existing += 1
            continue
        sale = await auto_create_sale_for_property(prop, user_id=None)
        if sale:
            seeded += 1
            st = prop.get("status", "sold")
            breakdown_by_status[st] = breakdown_by_status.get(st, 0) + 1

    logger.info(
        "Auto-seeded sales: %d (sold=%d, compensation=%d), skipped_no_buyer=%d, skipped_existing=%d",
        seeded, breakdown_by_status.get("sold", 0), breakdown_by_status.get("compensation", 0),
        skipped_no_buyer, skipped_existing,
    )
    return {
        "seeded": seeded,
        "by_status": breakdown_by_status,
        "skipped_no_buyer": skipped_no_buyer,
        "skipped_existing": skipped_existing,
    }
