"""Миграция: задава временни пароли на клиенти без password_hash.

Употреба (от /app/backend):

    python -m scripts.migrate_customers_to_password [--out /tmp/temp_passwords.csv]

За всеки клиент без password_hash:
  - генерира random временна парола (12 символа)
  - hash-ва я и записва (must_change_password=True)
  - изписва ред в CSV файла: email,name,temp_password

CSV-то се дава ръчно на админа, за да раздаде паролите.
"""
import argparse
import asyncio
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Позволява `python -m scripts.migrate_customers_to_password` от /app/backend
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT_DIR / ".env")

from auth.security import generate_temp_password, hash_password  # noqa: E402
from constants import Role  # noqa: E402
from db import get_db  # noqa: E402


async def main(out_path: str) -> int:
    db = get_db()
    cursor = db.users.find({"role": Role.CLIENT.value}, {"_id": 0})
    rows = []
    async for u in cursor:
        if u.get("password_hash"):
            continue
        temp_pw = generate_temp_password()
        await db.users.update_one(
            {"id": u["id"]},
            {"$set": {
                "password_hash": hash_password(temp_pw),
                "password_set_at": datetime.now(timezone.utc).isoformat(),
                "must_change_password": True,
            }},
        )
        rows.append({"email": u["email"], "name": u.get("name") or "", "temp_password": temp_pw})

    if not rows:
        print("Няма клиенти без парола — нищо за миграция.")
        return 0

    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["email", "name", "temp_password"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Мигрирани {len(rows)} клиенти. CSV → {out_path}")
    print("ВАЖНО: пазете CSV-то на сигурно място и го изтрийте след раздаване на паролите.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        default=os.path.join(os.getcwd(), "migrated_clients_passwords.csv"),
        help="CSV изход с временни пароли",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.out)))
