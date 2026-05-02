"""Fill-only update за Хаджи Димитър от Ploshto sgrada (1).pdf.

Правила:
  - Matching по `code` (нормализиран — „Апартамент 101" → „101").
  - Update САМО ако текущата стойност е None / 0 / празно / „-".
  - Не пипа: floor, status, buyer_id, reservation_id, code.
  - Логва: попълнени, конфликти (различни стойности), пропуснати.
"""
import asyncio
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import get_db


PROJECT_SLUG = "hadzhi-dimitar"


# ---------------------------------------------------------------------------
# Source data — из Ploshto sgrada (1).pdf
# F1 = чиста площ → raw_area + area_pure
# F2 = общи части → area_common
# F1+F2 = → area_total
# C1 = списъчна цена → list_price
# ---------------------------------------------------------------------------
DATA: list[dict] = [
    # Подземни ПМ
    {"code": "ПМ-12", "F1": 12.50, "C1": 11584, "F2": 10.45, "FT": 22.95},
    {"code": "ПМ-13", "F1": 12.50, "C1": 11584, "F2": 10.45, "FT": 22.95},
    {"code": "ПМ-14", "F1": 12.50, "C1": 11584, "F2": 10.45, "FT": 22.95},
    {"code": "ПМ-15", "F1": 12.50, "C1": 11584, "F2": 10.45, "FT": 22.95},
    {"code": "ПМ-16", "F1": 13.60, "C1": 12603, "F2": 11.37, "FT": 24.97},
    {"code": "ПМ-17", "F1": 13.75, "C1": 12742, "F2": 11.50, "FT": 25.25},
    {"code": "ПМ-18", "F1": 13.75, "C1": 12742, "F2": 11.50, "FT": 25.25},
    {"code": "ПМ-19", "F1": 13.75, "C1": 12742, "F2": 11.50, "FT": 25.25},
    {"code": "ПМ-20", "F1": 15.70, "C1": 14549, "F2": 13.13, "FT": 28.83},
    # Гаражи
    {"code": "Гараж-1", "F1": 15.46, "C1": 14327, "F2": 12.95, "FT": 28.41},
    {"code": "Гараж-2", "F1": 19.67, "C1": 18228, "F2": 16.47, "FT": 36.14},
    # Надземни ПМ
    {"code": "ПМ-7", "F1": 11.72, "C1": 13576, "F2": 2.48, "FT": 14.20},
    {"code": "ПМ-8", "F1": 12.27, "C1": 14213, "F2": 2.59, "FT": 14.86},
    {"code": "ПМ-9", "F1": 17.61, "C1": 20399, "F2": 3.73, "FT": 21.34},
    {"code": "ПМ-10", "F1": 13.66, "C1": 15823, "F2": 2.89, "FT": 16.55},
    # Дворни ПМ (C1, F2 не се дават)
    {"code": "ПМ-1", "F1": 14.81, "FT": 14.81},
    {"code": "ПМ-2", "F1": 12.50, "FT": 12.50},
    {"code": "ПМ-3", "F1": 12.50, "FT": 12.50},
    {"code": "ПМ-4", "F1": 12.50, "FT": 12.50},
    {"code": "ПМ-5", "F1": 12.50, "FT": 12.50},
    {"code": "ПМ-6", "F1": 15.12, "FT": 15.12},
    # Складове
    {"code": "Склад-1", "F1": 2.28, "C1": 722, "F2": 0.65, "FT": 2.93},
    {"code": "Склад-2", "F1": 2.29, "C1": 725, "F2": 0.65, "FT": 2.94},
    {"code": "Склад-3", "F1": 2.22, "C1": 703, "F2": 0.63, "FT": 2.85},
    {"code": "Склад-4", "F1": 3.77, "C1": 1194, "F2": 1.08, "FT": 4.85},
    {"code": "Склад-5", "F1": 2.01, "C1": 636, "F2": 0.57, "FT": 2.58},
    {"code": "Склад-6", "F1": 2.01, "C1": 636, "F2": 0.57, "FT": 2.58},
    {"code": "Склад-7", "F1": 2.01, "C1": 636, "F2": 0.57, "FT": 2.58},
    {"code": "Склад-8", "F1": 2.91, "C1": 922, "F2": 0.83, "FT": 3.74},
    {"code": "Склад-9", "F1": 3.34, "C1": 1057, "F2": 0.95, "FT": 4.29},
    {"code": "Склад-10", "F1": 3.83, "C1": 1213, "F2": 1.09, "FT": 4.92},
    {"code": "Склад-11", "F1": 4.32, "C1": 1368, "F2": 1.23, "FT": 5.55},
    {"code": "Склад-12", "F1": 4.49, "C1": 1421, "F2": 1.28, "FT": 5.77},
    # Магазин
    {"code": "Магазин", "F1": 31.62, "C1": 33382, "F2": 6.10, "FT": 37.72},
    # Апартаменти — нормализирани „101", „102" …
    {"code": "101", "F1": 44.96, "C1": 53078, "F2": 9.69, "FT": 54.65},
    {"code": "102", "F1": 52.88, "C1": 59980, "F2": 10.96, "FT": 63.84},
    {"code": "103", "F1": 52.45, "C1": 59492, "F2": 10.87, "FT": 63.32},
    {"code": "104", "F1": 54.46, "C1": 65633, "F2": 11.99, "FT": 66.45},
    {"code": "201", "F1": 44.96, "C1": 55290, "F2": 10.10, "FT": 55.06},
    {"code": "202", "F1": 52.88, "C1": 62479, "F2": 11.41, "FT": 64.29},
    {"code": "203", "F1": 52.45, "C1": 61971, "F2": 11.32, "FT": 63.77},
    {"code": "204", "F1": 54.46, "C1": 66972, "F2": 12.23, "FT": 66.69},
    {"code": "301", "F1": 97.84, "C1": 117960, "F2": 21.54, "FT": 119.38},
    {"code": "302", "F1": 52.45, "C1": 61971, "F2": 11.32, "FT": 63.77},
    {"code": "303", "F1": 54.46, "C1": 66972, "F2": 12.23, "FT": 66.69},
    {"code": "401", "F1": 97.84, "C1": 117960, "F2": 21.54, "FT": 119.38},
    {"code": "402", "F1": 106.91, "C1": 128895, "F2": 23.54, "FT": 130.45},
    {"code": "501", "F1": 97.84, "C1": 117960, "F2": 21.54, "FT": 119.38},
    {"code": "502", "F1": 52.45, "C1": 61971, "F2": 11.32, "FT": 63.77},
    {"code": "503", "F1": 54.46, "C1": 66972, "F2": 12.23, "FT": 66.69},
    {"code": "601", "F1": 84.23, "C1": 97967, "F2": 17.89, "FT": 102.12},
    {"code": "602", "F1": 93.30, "C1": 108516, "F2": 19.82, "FT": 113.12},
]


# Mapping: PDF column → list of DB target fields
FIELD_MAP = {
    "F1": ("raw_area", "area_pure"),
    "F2": ("area_common",),
    "FT": ("area_total",),
    "C1": ("list_price",),
}


def _is_empty(v) -> bool:
    """True ако стойността трябва да се счита за празна / fillable."""
    if v is None:
        return True
    if isinstance(v, str):
        s = v.strip()
        return s == "" or s == "-" or s.lower() == "null"
    if isinstance(v, (int, float)):
        return v == 0  # 0 като F1/C1 се счита за placeholder
    return False


async def main(commit: bool):
    db = get_db()
    project = await db.projects.find_one({"slug": PROJECT_SLUG}, {"_id": 0, "id": 1, "name": 1})
    if not project:
        print(f"❌ Проектът '{PROJECT_SLUG}' не е намерен.")
        return
    proj_id = project["id"]
    print(f"📁 Project: {project['name']} ({proj_id})")
    print(f"⚙️  Mode: {'COMMIT' if commit else 'DRY-RUN (preview only)'}")
    print()

    filled: list[tuple[str, str, object, object]] = []  # (code, field, old, new)
    conflicts: list[tuple[str, str, object, object]] = []
    skipped_existing: list[str] = []
    not_found: list[str] = []

    for row in DATA:
        code = row["code"]
        prop = await db.properties.find_one(
            {"project_id": proj_id, "code": code}, {"_id": 0}
        )
        if not prop:
            not_found.append(code)
            continue

        update_set: dict = {}
        any_already_correct = False
        for src_key, db_fields in FIELD_MAP.items():
            if src_key not in row:
                continue
            new_val = float(row[src_key])
            for db_field in db_fields:
                cur = prop.get(db_field)
                if _is_empty(cur):
                    update_set[db_field] = new_val
                    filled.append((code, db_field, cur, new_val))
                else:
                    # Conflict detection (различна стойност)
                    try:
                        if abs(float(cur) - new_val) > 0.01:
                            conflicts.append((code, db_field, cur, new_val))
                        else:
                            any_already_correct = True
                    except (TypeError, ValueError):
                        conflicts.append((code, db_field, cur, new_val))

        if not update_set:
            if any_already_correct:
                skipped_existing.append(code)
            continue

        if commit:
            await db.properties.update_one({"id": prop["id"]}, {"$set": update_set})

    # ---- REPORT ----
    print("=" * 70)
    print(f"✅ Filled fields: {len(filled)}")
    if filled:
        # групирай по code за по-четим изход
        from collections import defaultdict
        by_code = defaultdict(list)
        for c, f, old, new in filled:
            by_code[c].append(f"{f}: {old} → {new}")
        for c in sorted(by_code.keys()):
            print(f"  {c:15} {' | '.join(by_code[c])}")

    print()
    print(f"⚠️  Conflicts (PDF != DB, оставени на текущата стойност): {len(conflicts)}")
    for c, f, old, new in conflicts:
        print(f"  {c:15} {f}: DB={old}  PDF={new}  ← keep DB")

    print()
    print(f"⏭  Skipped (всички полета вече попълнени): {len(skipped_existing)}")
    if skipped_existing:
        print(f"  {', '.join(sorted(set(skipped_existing)))}")

    print()
    print(f"❓ Not found in DB: {len(not_found)}")
    if not_found:
        print(f"  {', '.join(not_found)}")

    print()
    print("=" * 70)
    if not commit:
        print("ℹ️  Това беше DRY-RUN. Стартирай с `--commit` за реален update.")


if __name__ == "__main__":
    commit_flag = "--commit" in sys.argv
    asyncio.run(main(commit_flag))
