"""Seed BEG Estates / Хаджи Димитър (real project, placeholder inventory) + 'Яна' (planned)."""
import os
import uuid
from datetime import datetime, timezone, timedelta

from auth.security import hash_password
from constants import Role, PropertyStatus, PropertyType, ProjectStatus, SEED_VERSION
from db import get_db


# ---- helpers ----
def _utcnow():
    return datetime.now(timezone.utc)


def _new_unit(
    *,
    project_id,
    building_id,
    code,
    property_type,
    floor,
    area_pure=None,
    area_common=None,
    area_total=None,
    ideal_parts_area=None,
    raw_area=None,
    exposure=None,
    rooms=None,
    price_per_sqm=None,
    base_price=None,
    status=PropertyStatus.AVAILABLE.value,
    description="",
    gallery=None,
    plan_url=None,
    buyer_id=None,
    admin_notes="",
    source_ref=None,
    linked_unit_ids=None,
):
    """Create a normalized property dict. `base_price` flows into list_price if not overridden."""
    return {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "building_id": building_id,
        "code": code,
        "property_type": property_type,
        "floor": floor,
        # areas
        "area_pure": area_pure,
        "area_common": area_common,
        "area_total": area_total,
        "ideal_parts_area": ideal_parts_area,
        "raw_area": raw_area,
        "exposure": exposure,
        "rooms": rooms,
        # pricing (base = seeded baseline; list = what's shown publicly;
        # negotiated/reservation/final are admin-only stages)
        "price_per_sqm": price_per_sqm,
        "base_price": base_price,
        "list_price": base_price,
        "negotiated_price": None,
        "reservation_price": None,
        "final_contract_price": None,
        # meta
        "status": status,
        "description": description,
        "gallery": gallery or [],
        "plan_url": plan_url,
        # admin-only
        "buyer_id": buyer_id,
        "admin_notes": admin_notes,
        "source_ref": source_ref,
        "linked_unit_ids": linked_unit_ids or [],
        "created_at": _utcnow().isoformat(),
    }


# ---- core seed ----
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
        return  # already seeded to current version

    # Wipe inventory-related collections only (keep users/auth)
    for col in [
        "projects", "buildings", "properties", "property_links",
        "reservations", "payment_plans", "payment_installments", "payments",
        "documents", "inquiries", "project_updates", "buyers", "status_history",
    ]:
        await db[col].delete_many({})

    # =====================================================
    # PROJECT 1 — BEG Estates / Хаджи Димитър  (REAL, primary)
    # =====================================================
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
            "name": "BEG Estates / Хаджи Димитър",
            "slug": "hadzhi-dimitar",
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
            "source_files": [
                "ПЛОЩООБРАЗУВАНЕ - нанесени КУПУВАЧИ.pdf",
                "000 - NP165-SD-AR.pdf",
            ],
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

    # Seed buyers (admin-only, not shown publicly)
    buyer_kostov = {
        "id": str(uuid.uuid4()),
        "project_id": hd_id,
        "name": "Николай Костов",
        "phone": "+359 888 555 111",
        "email": "n.kostov@example.bg",
        "relation": "купувач",
        "notes": "Заплатен депозит — предварителен договор",
        "created_at": _utcnow().isoformat(),
    }
    buyer_georgieva = {
        "id": str(uuid.uuid4()),
        "project_id": hd_id,
        "name": "Мария Георгиева",
        "phone": "+359 888 555 222",
        "email": "m.georgieva@example.bg",
        "relation": "купувач",
        "notes": "Продажба завършена",
        "created_at": _utcnow().isoformat(),
    }
    buyer_compensation = {
        "id": str(uuid.uuid4()),
        "project_id": hd_id,
        "name": "Собственик на УПИ (обезщетение)",
        "phone": None,
        "email": None,
        "relation": "обезщетение",
        "notes": "Обект по договор за обезщетение — НЕ се предлага публично.",
        "created_at": _utcnow().isoformat(),
    }
    await db.buyers.insert_many([buyer_kostov, buyer_georgieva, buyer_compensation])

    # ---- inventory ----
    units: list[dict] = []

    # 1 shop (ground floor)
    units.append(_new_unit(
        project_id=hd_id, building_id=hd_building,
        code="Магазин",
        property_type=PropertyType.SHOP.value,
        floor=0,
        area_pure=78.40, area_common=13.10, area_total=91.50,
        base_price=195000, price_per_sqm=2130,
        description="Магазин на партер с витрина към главната улица.",
        source_ref="ПЛОЩООБРАЗУВАНЕ row: Магазин",
    ))

    # Apartments per floor (code = floor*100 + unit index)
    apt_plan = {
        1: [(1, 2, 68.5, "изток"), (2, 3, 89.0, "юг"), (3, 2, 72.3, "запад"), (4, 3, 94.1, "север")],
        2: [(1, 2, 68.5, "изток"), (2, 3, 89.0, "юг"), (3, 2, 72.3, "запад"), (4, 3, 94.1, "север")],
        3: [(1, 3, 101.2, "изток"), (2, 4, 128.6, "юг"), (3, 3, 108.4, "запад")],
        4: [(1, 3, 101.2, "изток"), (2, 4, 128.6, "юг")],
        5: [(1, 3, 118.7, "изток"), (2, 4, 142.5, "юг"), (3, 3, 124.8, "запад")],
        6: [(1, 4, 158.2, "изток"), (2, 4, 165.8, "юг")],
    }

    apt_gallery = [
        "https://images.unsplash.com/photo-1758448511320-05d7d28f4298?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
        "https://images.unsplash.com/photo-1757439402190-99b73ac8e807?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    ]

    # Pricing curve: per_sqm grows with floor
    def _sqm(floor):
        return 2200 + (floor - 1) * 80

    apt_by_code = {}
    for floor, items in apt_plan.items():
        for idx, rooms, area_pure, exposure in items:
            code = f"{floor}{idx:02d}"  # 101..602
            per_sqm = _sqm(floor)
            area_common = round(area_pure * 0.15, 2)
            area_total = round(area_pure + area_common, 2)
            base = round(area_total * per_sqm)
            u = _new_unit(
                project_id=hd_id, building_id=hd_building,
                code=code, property_type=PropertyType.APARTMENT.value,
                floor=floor,
                area_pure=area_pure, area_common=area_common, area_total=area_total,
                ideal_parts_area=area_common,
                exposure=exposure, rooms=rooms,
                price_per_sqm=per_sqm, base_price=base,
                description=f"{rooms}-стаен апартамент с изложение {exposure} и просторна тераса.",
                gallery=apt_gallery,
                source_ref=f"ПЛОЩООБРАЗУВАНЕ row: ап. {code}",
            )
            apt_by_code[code] = u
            units.append(u)

    # Parking spaces (underground) — realistic gap numbering
    parking_numbers = [7, 8, 12, 13, 14, 15]
    for n in parking_numbers:
        units.append(_new_unit(
            project_id=hd_id, building_id=hd_building,
            code=f"ПМ-{n:02d}",
            property_type=PropertyType.PARKING.value,
            floor=-1,
            area_total=12.5, ideal_parts_area=1.8,
            base_price=9500, price_per_sqm=None,
            description="Подземно паркомясто.",
            source_ref=f"ПЛОЩООБРАЗУВАНЕ row: паркомясто {n}",
        ))

    # Garage
    units.append(_new_unit(
        project_id=hd_id, building_id=hd_building,
        code="Г-1", property_type=PropertyType.GARAGE.value,
        floor=-1,
        area_total=19.8, base_price=24000,
        description="Подземен гараж с автоматична врата.",
        source_ref="ПЛОЩООБРАЗУВАНЕ row: гараж 1",
    ))

    # Storage
    for n in (1, 2, 3):
        units.append(_new_unit(
            project_id=hd_id, building_id=hd_building,
            code=f"Склад {n}",
            property_type=PropertyType.STORAGE.value,
            floor=-1,
            area_total=4.2 + n * 0.4, base_price=3200 + n * 150,
            description="Складово помещение в сутерен.",
            source_ref=f"ПЛОЩООБРАЗУВАНЕ row: склад {n}",
        ))

    # --- demo status/assignment overrides ---
    # 301 — sold to buyer_georgieva
    if "301" in apt_by_code:
        apt_by_code["301"]["status"] = PropertyStatus.SOLD.value
        apt_by_code["301"]["buyer_id"] = buyer_georgieva["id"]
        apt_by_code["301"]["final_contract_price"] = apt_by_code["301"]["base_price"]
        apt_by_code["301"]["admin_notes"] = "Продажба — нотариално заверена."

    # 102 — reserved_paid_deposit by buyer_kostov
    if "102" in apt_by_code:
        apt_by_code["102"]["status"] = PropertyStatus.RESERVED_PAID_DEPOSIT.value
        apt_by_code["102"]["buyer_id"] = buyer_kostov["id"]
        apt_by_code["102"]["reservation_price"] = 15000
        apt_by_code["102"]["admin_notes"] = "Капаро заплатено, чака предварителен договор."

    # 401 — compensation (owner of land)
    if "401" in apt_by_code:
        apt_by_code["401"]["status"] = PropertyStatus.COMPENSATION.value
        apt_by_code["401"]["buyer_id"] = buyer_compensation["id"]
        apt_by_code["401"]["admin_notes"] = "Обект за обезщетение към собственика на УПИ."

    # 501 — hidden (not shown publicly, used as test)
    if "501" in apt_by_code:
        apt_by_code["501"]["status"] = PropertyStatus.HIDDEN.value
        apt_by_code["501"]["admin_notes"] = "Временно скрит за редакция на цена."

    await db.properties.insert_many(units)

    # Zero-deposit reservation on apt 202 for client Ivan (demo)
    demo_apt = apt_by_code.get("202")
    if demo_apt:
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

        # simple payment plan (structure only)
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

    # Project updates
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
    # PROJECT 2 — Жилищна сграда Яна (future / planned)
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

    # Mark seed complete
    await db.system_meta.update_one(
        {"id": "seed"},
        {"$set": {"id": "seed", "version": SEED_VERSION, "seeded_at": _utcnow().isoformat()}},
        upsert=True,
    )
