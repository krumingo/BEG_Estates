"""Миграция: db.buyers (legacy) → db.users (role=client) — единен източник на купувачи.

Логика:
1) Чете всички документи от db.buyers, които още не са мигрирани (`migrated_to_user_id` липсва).
2) За всеки buyer:
   - Ако buyer.email съществува и вече има user с този email → линкуваме (без създаване).
   - Иначе — създаваме нов user:
       role="client", is_imported_buyer=True,
       source_project_id=buyer.project_id,
       must_change_password=True, password_hash=None.
   - Ако buyer няма email → генерираме `imported+<short>@begestates.bg` placeholder.
3) Update properties.buyer_id (на същия `project_id`) от стария buyer.id → новия user.id.
4) Маркираме buyer като migrated_to_user_id=<user.id> (rollback-friendly; не drop-ваме).

Idempotent: повторно стартиране пропуска вече мигрираните buyers.

Употреба (от /app/backend):
    python -m scripts.migrate_buyers_to_clients [--csv /tmp/buyers_migration.csv]
"""
import argparse
import asyncio
import csv
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT_DIR / ".env")

from constants import Role  # noqa: E402
from db import get_db  # noqa: E402


def _short_id(s: str) -> str:
    return (s or "").split("-")[0][:8] if s else uuid.uuid4().hex[:8]


def _placeholder_email(buyer_id: str) -> str:
    return f"imported+{_short_id(buyer_id)}@begestates.bg"


async def main(csv_path: str | None) -> int:
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    cursor = db.buyers.find({"migrated_to_user_id": {"$exists": False}}, {"_id": 0})
    rows = []
    created_users = 0
    linked_users = 0
    relinked_props = 0

    async for b in cursor:
        buyer_id = b["id"]
        email = (b.get("email") or "").strip().lower()
        name = (b.get("name") or "").strip() or "(без име)"

        existing_user = None
        if email:
            existing_user = await db.users.find_one({"email": email})

        if existing_user:
            user_id = existing_user["id"]
            linked_users += 1
            action = "linked"
            stored_email = existing_user["email"]
        else:
            user_id = str(uuid.uuid4())
            stored_email = email or _placeholder_email(buyer_id)
            new_user = {
                "id": user_id,
                "email": stored_email,
                "name": name,
                "role": Role.CLIENT.value,
                "phone": b.get("phone") or "",
                "preferred_contact": "any",
                "client_note": b.get("notes") or "",
                "two_factor_enabled": False,
                "is_deleted": False,
                "is_imported_buyer": True,
                "source_project_id": b.get("project_id"),
                "source_buyer_id": buyer_id,
                "source_buyer_relation": b.get("relation"),
                "must_change_password": True,
                "password_hash": None,
                "password_set_at": None,
                "created_at": b.get("created_at") or now_iso,
                "migrated_at": now_iso,
            }
            try:
                await db.users.insert_one(new_user)
            except Exception as e:
                # Конфликт по email уникален индекс → fallback към placeholder
                print(f"WARN: insert failed за buyer {buyer_id} ({email}): {e}")
                new_user["email"] = _placeholder_email(buyer_id) + ".dup"
                await db.users.insert_one(new_user)
                stored_email = new_user["email"]
            created_users += 1
            action = "created"

        # Update properties.buyer_id
        upd = await db.properties.update_many(
            {"buyer_id": buyer_id}, {"$set": {"buyer_id": user_id}}
        )
        relinked_props += upd.modified_count

        await db.buyers.update_one(
            {"id": buyer_id},
            {"$set": {"migrated_to_user_id": user_id, "migrated_at": now_iso}},
        )

        rows.append({
            "buyer_id": buyer_id,
            "buyer_name": name,
            "buyer_email": email or "(none)",
            "user_id": user_id,
            "user_email": stored_email,
            "action": action,
            "properties_relinked": upd.modified_count,
        })

    # Резюме
    print("=" * 60)
    print(f"Migrated buyers       : {len(rows)}")
    print(f"  created new users   : {created_users}")
    print(f"  linked to existing  : {linked_users}")
    print(f"Properties relinked   : {relinked_props}")
    print("=" * 60)

    if not rows:
        print("Няма buyers за миграция (вероятно вече е изпълнено).")
        return 0

    if csv_path:
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["buyer_id", "buyer_name", "buyer_email", "user_id", "user_email", "action", "properties_relinked"],
            )
            writer.writeheader()
            writer.writerows(rows)
        print(f"CSV отчет → {csv_path}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=None, help="Опционален CSV отчет с миграцията")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.csv)))
