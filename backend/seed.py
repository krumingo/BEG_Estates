"""Seed BEG Estates / Хаджи Димитър (source-driven) + 'Яна' (planned)."""
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from auth.security import hash_password
from constants import Role, PropertyStatus, ProjectStatus, SEED_VERSION
from db import get_db

DATA_DIR = Path(__file__).parent / "data"
HD_SOURCE_FILE = DATA_DIR / "hadzhi_dimitar_units.json"


def _utcnow():
    return datetime.now(timezone.utc)


def _load_hd_source() -> dict:
    """Single source of truth for Хаджи Димитър inventory."""
    with HD_SOURCE_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def _unit_from_source(row: dict, *, project_id: str, building_id: str, buyer_id_by_key: dict) -> dict:
    """Materialize one unit from a source row. Missing fields stay None."""
    buyer_ref = row.get("buyer_ref")
    buyer_id = buyer_id_by_key.get(buyer_ref) if buyer_ref else None
    status = row.get("status") or PropertyStatus.AVAILABLE.value
    base_price = row.get("base_price")
    return {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "building_id": building_id,
        "code": row["code"],
        "property_type": row["property_type"],
        "floor": row.get("floor"),
        # areas — left as-is; None if not in source
        "area_pure": row.get("area_pure"),
        "area_common": row.get("area_common"),
        "area_total": row.get("area_total"),
        "ideal_parts_area": row.get("ideal_parts_area"),
        "raw_area": row.get("raw_area"),
        "exposure": row.get("exposure"),
        "rooms": row.get("rooms"),
        # pricing (all optional; if base_price missing → list_price stays None too)
        "price_per_sqm": row.get("price_per_sqm"),
        "base_price": base_price,
        "list_price": base_price,
        "negotiated_price": None,
        "reservation_price": None,
        "final_contract_price": None,
        # status + metadata
        "status": status,
        "description": row.get("description", ""),
        "gallery": row.get("gallery", []),
        "plan_url": row.get("plan_url"),
        # admin-only
        "buyer_id": buyer_id,
        "admin_notes": row.get("admin_notes", "") or "",
        "source_ref": row.get("source_ref"),
        "linked_unit_ids": row.get("linked_unit_ids", []),
        "created_at": _utcnow().isoformat(),
    }


async def seed_all():
    db = get_db()

    # ---- users (idempotent) ----
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "name": "Administrator",
                "role": Role.ADMIN.value,
                "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
                "two_factor_enabled": False,
                "phone": "+359 888 000 001",
                "created_at": _utcnow().isoformat(),
            }
        )
    sales_email = os.environ["SALES_EMAIL"].lower()
    if not await db.users.find_one({"email": sales_email}):
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "email": sales_email,
                "name": "Мария Иванова",
                "role": Role.SALES.value,
                "password_hash": hash_password(os.environ["SALES_PASSWORD"]),
                "two_factor_enabled": False,
                "phone": "+359 888 000 002",
                "created_at": _utcnow().isoformat(),
            }
        )

    client_email = os.environ["CLIENT_EMAIL"].lower()
    client = await db.users.find_one({"email": client_email})
    if not client:
        client = {
            "id": str(uuid.uuid4()),
            "email": client_email,
            "name": "Иван Петров",
            "role": Role.CLIENT.value,
            "phone": "+359 888 123 456",
            "two_factor_enabled": False,
            "created_at": _utcnow().isoformat(),
        }
        await db.users.insert_one(client)

    # ---- migration / seed gate ----
    meta = await db.system_meta.find_one({"id": "seed"}) or {}
    if meta.get("version") == SEED_VERSION:
        return

    for col in [
        "projects", "buildings", "properties", "property_links",
        "reservations", "payment_plans", "payment_installments", "payments",
        "documents", "inquiries", "project_updates", "buyers", "status_history",
    ]:
        await db[col].delete_many({})

    # =====================================================
    # PROJECT 1 — BEG Estates / Хаджи Димитър (source-driven)
    # =====================================================
    src = _load_hd_source()

    hd_id = str(uuid.uuid4())
    hd_gallery = [
        "https://images.unsplash.com/photo-1758193431355-54df41421657?crop=entropy&cs=srgb&fm=jpg&q=85&w=1800",
        "https://images.pexels.com/photos/16110999/pexels-photo-16110999.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=1600",
        "https://images.unsplash.com/photo-1767884163190-f8ca72b2e48f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
        "https://images.unsplash.com/photo-1758448511320-05d7d28f4298?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    ]
    await db.projects.insert_one(
        {
            "id": hd_id,
            "name": src["project_name"],
            "slug": src["project_slug"],
            "city": "София",
            "address": 'гр. София, район Подуяне, м. "ж.к. Хаджи Димитър", УПИ XVI-432,433, кв.36',
            "short_description": "Многофамилна жилищна сграда с подземни гаражи и магазин.",
            "description": (
                "Съвременна многофамилна жилищна сграда в утвърден столичен район с "
                "отлична локация, удобен транспорт и развита инфраструктура. Проектът "
                "предлага апартаменти от 1 до 4-стайни, магазин на партер, подземни "
                "паркоместа, гараж и складови помещения."
            ),
            "status": ProjectStatus.UNDER_CONSTRUCTION.value,
            "completion_date": "2027-06-30",
            "cover_image": hd_gallery[0],
            "gallery": hd_gallery,
            "lat": 42.7168,
            "lng": 23.3625,
            "progress_percent": 35,
            "nearby_amenities": [
                {"icon": "shopping-cart", "label": "Kaufland", "walk_time": "5 мин. пеша"},
                {"icon": "trees", "label": "Парк Герена", "walk_time": "7 мин. пеша"},
                {"icon": "school", "label": "95 СУ „Проф. Иван Шишманов“", "walk_time": "3 мин. пеша"},
                {"icon": "bus", "label": "Градски транспорт", "walk_time": "1 мин. пеша"},
            ],
            "is_primary": True,
            "created_at": _utcnow().isoformat(),
            "source_files": [src["source_file"], "000 - NP165-SD-AR.pdf"],
            "source_notice": src.get("notice"),
        }
    )

    hd_building = str(uuid.uuid4())
    await db.buildings.insert_one(
        {
            "id": hd_building,
            "project_id": hd_id,
            "name": "Основен корпус",
            "entrances": 1,
            "floors_count": 6,
        }
    )

    # ---- buyers from source ----
    buyer_id_by_key: dict[str, str] = {}
    for b in src.get("buyers", []):
        bid = str(uuid.uuid4())
        buyer_id_by_key[b["buyer_key"]] = bid
        await db.buyers.insert_one(
            {
                "id": bid,
                "project_id": hd_id,
                "name": b["name"],
                "phone": b.get("phone"),
                "email": b.get("email"),
                "relation": b.get("relation"),
                "notes": b.get("notes", ""),
                "buyer_key": b["buyer_key"],
                "created_at": _utcnow().isoformat(),
            }
        )

    # ---- units from source ----
    units = [
        _unit_from_source(
            row, project_id=hd_id, building_id=hd_building,
            buyer_id_by_key=buyer_id_by_key,
        )
        for row in src["units"]
    ]
    if units:
        await db.properties.insert_many(units)

    by_code = {u["code"]: u for u in units}

    # ---- demo zero-deposit reservation (flow preservation, not source data) ----
    demo_apt = by_code.get("202")
    if demo_apt and demo_apt["status"] == PropertyStatus.AVAILABLE.value:
        now = _utcnow()
        await db.reservations.insert_one(
            {
                "id": str(uuid.uuid4()),
                "property_id": demo_apt["id"],
                "client_id": client["id"],
                "reservation_type": "zero_deposit",
                "status": "active",
                "amount": 0,
                "notes": "Демо резервация капаро 0 (Хаджи Димитър)",
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(days=5)).isoformat(),
                "created_by": client["id"],
            }
        )
        await db.properties.update_one(
            {"id": demo_apt["id"]},
            {"$set": {"status": PropertyStatus.RESERVED_ZERO_DEPOSIT.value}},
        )

        if demo_apt.get("base_price"):
            plan_id = str(uuid.uuid4())
            await db.payment_plans.insert_one(
                {
                    "id": plan_id,
                    "client_id": client["id"],
                    "property_id": demo_apt["id"],
                    "total_amount": demo_apt["base_price"],
                    "currency": "EUR",
                    "created_at": now.isoformat(),
                }
            )
            parts = 3
            part_amount = round(demo_apt["base_price"] / parts)
            for i in range(1, parts + 1):
                await db.payment_installments.insert_one(
                    {
                        "id": str(uuid.uuid4()),
                        "plan_id": plan_id,
                        "client_id": client["id"],
                        "property_id": demo_apt["id"],
                        "number": i,
                        "amount": part_amount,
                        "currency": "EUR",
                        "due_date": (now + timedelta(days=30 * i * 2)).isoformat(),
                        "status": "предстоящо",
                    }
                )

    # ---- project updates ----
    for title, desc, days_ago in [
        ("Изкоп и фундиране", "Завършиха изкопните работи на обекта.", 45),
        ("Кота нула", "Излизане на кота нула за основния корпус.", 20),
        ("Груб строеж — етаж 1", "Завършен груб строеж на първи етаж.", 5),
    ]:
        await db.project_updates.insert_one(
            {
                "id": str(uuid.uuid4()),
                "project_id": hd_id,
                "title": title,
                "description": desc,
                "image": None,
                "created_at": (_utcnow() - timedelta(days=days_ago)).isoformat(),
            }
        )

    # =====================================================
    # PROJECT 2 — Жилищна сграда Яна (planned, no inventory)
    # =====================================================
    yana_id = str(uuid.uuid4())
    await db.projects.insert_one(
        {
            "id": yana_id,
            "name": "Жилищна сграда Яна",
            "slug": "zhiliwna-sgrada-yana",
            "city": "София",
            "address": "кв. Манастирски ливади",
            "short_description": "Бъдещ проект — в процес на проектиране.",
            "description": "Планиран бутиков проект, в процес на подготовка.",
            "status": ProjectStatus.PLANNED.value,
            "completion_date": None,
            "cover_image": "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1600&q=80",
            "gallery": [],
            "lat": 42.6634,
            "lng": 23.2985,
            "progress_percent": 0,
            "nearby_amenities": [],
            "is_primary": False,
            "created_at": _utcnow().isoformat(),
        }
    )

    await db.system_meta.update_one(
        {"id": "seed"},
        {"$set": {"id": "seed", "version": SEED_VERSION, "seeded_at": _utcnow().isoformat()}},
        upsert=True,
    )
