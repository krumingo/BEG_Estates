"""Seed demo data: project 'Жилищна сграда Яна' + staff + client + zero-deposit reservation."""
import os
import uuid
from datetime import datetime, timezone, timedelta

from auth.security import hash_password
from constants import Role
from db import get_db


async def seed_all():
    db = get_db()
    # ---- Users ----
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
                "created_at": datetime.now(timezone.utc).isoformat(),
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
                "created_at": datetime.now(timezone.utc).isoformat(),
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
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(client)

    # ---- Project ----
    if await db.projects.count_documents({}) > 0:
        return  # seed only once

    project_id = str(uuid.uuid4())
    await db.projects.insert_one(
        {
            "id": project_id,
            "name": "Жилищна сграда Яна",
            "slug": "zhiliwna-sgrada-yana",
            "city": "София",
            "address": "кв. Манастирски ливади, ул. Цар Борис III 215",
            "description": (
                "Бутикова жилищна сграда в сърцето на София с уникална архитектура, "
                "просторни тераси и premium завършек. 5 етажа, 20 апартамента, подземен паркинг."
            ),
            "status": "в_строеж",
            "completion_date": "2026-12-01",
            "cover_image": "https://images.unsplash.com/photo-1758193431355-54df41421657?crop=entropy&cs=srgb&fm=jpg&q=85&w=1920",
            "gallery": [
                "https://images.unsplash.com/photo-1758193431355-54df41421657?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
                "https://images.pexels.com/photos/16110999/pexels-photo-16110999.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
                "https://images.unsplash.com/photo-1767884163190-f8ca72b2e48f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
            ],
            "lat": 42.6634,
            "lng": 23.2985,
            "progress_percent": 55,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    building_id = str(uuid.uuid4())
    await db.buildings.insert_one(
        {
            "id": building_id,
            "project_id": project_id,
            "name": "Блок А",
            "entrances": 1,
            "floors_count": 5,
        }
    )

    interior_gallery = [
        "https://images.unsplash.com/photo-1758448511320-05d7d28f4298?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
        "https://images.unsplash.com/photo-1757439402190-99b73ac8e807?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    ]

    exposures = ["изток", "запад", "юг", "север"]
    property_ids_by_code = {}

    # 5 floors × 4 apartments each = 20 apts
    for floor in range(1, 6):
        for idx in range(1, 5):
            code = f"A{floor}-{idx}"
            rooms = 2 if idx in (1, 4) else 3
            area_pure = 68 + idx * 7.5
            area_common = area_pure * 0.15
            area_total = round(area_pure + area_common, 2)
            price_per_sqm = 2450 + (floor - 1) * 45 + (20 if idx in (2, 3) else 0)
            price_total = round(area_total * price_per_sqm)
            pid = str(uuid.uuid4())
            property_ids_by_code[code] = pid
            await db.properties.insert_one(
                {
                    "id": pid,
                    "project_id": project_id,
                    "building_id": building_id,
                    "property_type": "apartment",
                    "code": code,
                    "floor": floor,
                    "rooms": rooms,
                    "area_pure": round(area_pure, 2),
                    "area_common": round(area_common, 2),
                    "area_total": area_total,
                    "exposure": exposures[(floor + idx) % 4],
                    "price_per_sqm": price_per_sqm,
                    "price_total": price_total,
                    "description": f"{rooms}-стаен апартамент с просторна тераса, premium завършек и панорамна гледка.",
                    "gallery": interior_gallery,
                    "plan_url": None,
                    "status": "свободен",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    # 8 garages
    for i in range(1, 9):
        await db.properties.insert_one(
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "building_id": building_id,
                "property_type": "garage",
                "code": f"G-{i:02d}",
                "floor": -1,
                "area_total": 18.5,
                "price_total": 22000,
                "description": "Подземен гараж с автоматична врата.",
                "gallery": [],
                "status": "свободен",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # 10 parking spaces
    for i in range(1, 11):
        await db.properties.insert_one(
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "building_id": building_id,
                "property_type": "parking",
                "code": f"P-{i:02d}",
                "floor": -1,
                "area_total": 12.5,
                "price_total": 9500,
                "description": "Подземно паркомясто.",
                "gallery": [],
                "status": "свободен",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Zero-deposit reservation on A3-2 for client
    target_code = "A3-2"
    target_id = property_ids_by_code[target_code]
    now = datetime.now(timezone.utc)
    await db.reservations.insert_one(
        {
            "id": str(uuid.uuid4()),
            "property_id": target_id,
            "client_id": client["id"],
            "reservation_type": "zero_deposit",
            "status": "active",
            "amount": 0,
            "notes": "Демо резервация капаро 0",
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=5)).isoformat(),
            "created_by": client["id"],
        }
    )
    await db.properties.update_one({"id": target_id}, {"$set": {"status": "резервиран_капаро_0"}})

    # Mark one property as sold for variety
    sold_id = property_ids_by_code["A1-1"]
    await db.properties.update_one({"id": sold_id}, {"$set": {"status": "продаден"}})

    # A simple payment plan for client (3 installments)
    plan_id = str(uuid.uuid4())
    await db.payment_plans.insert_one(
        {
            "id": plan_id,
            "client_id": client["id"],
            "property_id": target_id,
            "total_amount": 180000,
            "currency": "EUR",
            "created_at": now.isoformat(),
        }
    )
    due_dates = [now + timedelta(days=10), now + timedelta(days=90), now + timedelta(days=180)]
    for i, due in enumerate(due_dates, start=1):
        await db.payment_installments.insert_one(
            {
                "id": str(uuid.uuid4()),
                "plan_id": plan_id,
                "client_id": client["id"],
                "property_id": target_id,
                "number": i,
                "amount": 60000,
                "currency": "EUR",
                "due_date": due.isoformat(),
                "status": "предстоящо",
            }
        )

    # Sample document for client
    await db.documents.insert_one(
        {
            "id": str(uuid.uuid4()),
            "client_id": client["id"],
            "property_id": target_id,
            "name": "Резервационен лист - капаро 0",
            "url": None,
            "type": "reservation_sheet",
            "created_at": now.isoformat(),
        }
    )

    # Project updates / progress
    for title, desc, days_ago in [
        ("Завършен груб строеж на етажи 1-3", "Успешно приключихме груб строеж на първите три етажа.", 30),
        ("Монтаж на дограма", "Започна монтажът на premium алуминиева дограма.", 14),
        ("Вътрешни инсталации", "Финализиране на ВиК и електро инсталациите.", 3),
    ]:
        await db.project_updates.insert_one(
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "title": title,
                "description": desc,
                "image": None,
                "created_at": (now - timedelta(days=days_ago)).isoformat(),
            }
        )
