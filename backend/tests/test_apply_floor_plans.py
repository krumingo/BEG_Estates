"""Targeted test за POST /import-sessions/{id}/apply-floor-plans (safe merge).

Тестваме само логиката на safe merge — НЕ пипаме apply inventory flow.
"""
from __future__ import annotations

import uuid

import pytest


pytestmark = pytest.mark.asyncio


async def _seed(db, project_id: str):
    # 1 проект
    await db.projects.insert_one({"id": project_id, "name": "T", "status": "active"})
    # 4 properties: 101..104 на етаж 2
    props = []
    for code in ["101", "102", "103", "104"]:
        props.append({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "code": code,
            "property_type": "apartment",
            "floor": 2,
        })
    await db.properties.insert_many(props)
    return props


async def _mk_session(db, project_id: str, pages: list[dict]) -> str:
    sid = str(uuid.uuid4())
    await db.import_sessions.insert_one({
        "id": sid,
        "project_id": project_id,
        "status": "review_ready",
        "files": [],
        "extracted_payload": {
            "candidate_units": [],
            "candidate_buyers": [],
            "candidate_floor_plans": pages,
        },
    })
    return sid


async def test_creates_new_floor_plan_when_absent():
    from db import get_db
    from routes.imports import apply_floor_plans, ApplyFloorPlansRequest

    db = get_db()
    project_id = str(uuid.uuid4())
    await _seed(db, project_id)
    sid = await _mk_session(db, project_id, [
        {"source_file_id": "f1", "page_number": 3, "floor": 2,
         "review_status": "approved",
         "matched_unit_codes": ["101", "102", "103", "104"],
         "unmatched_detected_codes": [],
         "detected_unit_codes": ["101", "102", "103", "104"],
         "detected_floor_guess": 2, "floor_guess_confidence": 0.9,
         "warnings": []},
    ])
    user = {"id": "admin-test"}
    result = await apply_floor_plans(sid, ApplyFloorPlansRequest(), user=user)
    assert result["summary"]["created"] == 1
    assert result["summary"]["updated"] == 0
    assert result["summary"]["skipped"] == 0

    fp = await db.floor_plans.find_one({"project_id": project_id, "floor": 2}, {"_id": 0})
    assert fp is not None
    # Manual mapper-ските units НЕ се генерират от import-а — остават empty
    assert fp["units"] == []
    # Но import_candidates се записва
    assert len(fp["import_candidates"]) == 4
    assert {c["code"] for c in fp["import_candidates"]} == {"101", "102", "103", "104"}

    await db.projects.delete_one({"id": project_id})
    await db.properties.delete_many({"project_id": project_id})
    await db.floor_plans.delete_many({"project_id": project_id})
    await db.import_sessions.delete_one({"id": sid})


async def test_skips_when_manual_mapping_exists():
    from db import get_db
    from routes.imports import apply_floor_plans, ApplyFloorPlansRequest

    db = get_db()
    project_id = str(uuid.uuid4())
    props = await _seed(db, project_id)
    # Съществуващ floor_plan с manual mapping (units с x/y)
    await db.floor_plans.insert_one({
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "floor": 2,
        "plan_image_url": "https://example.com/manual.png",
        "units": [{"property_id": props[0]["id"], "x": 10, "y": 20, "width": 100, "height": 50}],
    })
    sid = await _mk_session(db, project_id, [
        {"source_file_id": "f1", "page_number": 3, "floor": 2,
         "review_status": "approved",
         "matched_unit_codes": ["101", "102"],
         "unmatched_detected_codes": [],
         "detected_unit_codes": ["101", "102"],
         "detected_floor_guess": 2, "floor_guess_confidence": 0.9,
         "warnings": []},
    ])
    user = {"id": "admin-test"}
    result = await apply_floor_plans(sid, ApplyFloorPlansRequest(), user=user)
    assert result["summary"]["created"] == 0
    assert result["summary"]["skipped"] == 1
    skip_detail = next(d for d in result["details"] if d["action"] == "skipped" and d.get("floor") == 2)
    assert skip_detail["reason"] == "manual_mapping_exists"

    # Manual mapping е запазен
    fp = await db.floor_plans.find_one({"project_id": project_id, "floor": 2}, {"_id": 0})
    assert fp["plan_image_url"] == "https://example.com/manual.png"
    assert len(fp["units"]) == 1
    assert fp["units"][0]["x"] == 10

    await db.projects.delete_one({"id": project_id})
    await db.properties.delete_many({"project_id": project_id})
    await db.floor_plans.delete_many({"project_id": project_id})
    await db.import_sessions.delete_one({"id": sid})


async def test_dry_run_does_not_write():
    from db import get_db
    from routes.imports import apply_floor_plans, ApplyFloorPlansRequest

    db = get_db()
    project_id = str(uuid.uuid4())
    await _seed(db, project_id)
    sid = await _mk_session(db, project_id, [
        {"source_file_id": "f1", "page_number": 3, "floor": 2,
         "review_status": "approved",
         "matched_unit_codes": ["101", "102", "103", "104"],
         "unmatched_detected_codes": [],
         "detected_unit_codes": ["101", "102", "103", "104"],
         "detected_floor_guess": 2, "floor_guess_confidence": 0.9,
         "warnings": []},
    ])
    user = {"id": "admin-test"}
    result = await apply_floor_plans(sid, ApplyFloorPlansRequest(dry_run=True), user=user)
    assert result["dry_run"] is True
    assert result["summary"]["created"] == 1
    # Нищо не е реално записано в DB
    fp = await db.floor_plans.find_one({"project_id": project_id, "floor": 2})
    assert fp is None

    await db.projects.delete_one({"id": project_id})
    await db.properties.delete_many({"project_id": project_id})
    await db.import_sessions.delete_one({"id": sid})


async def test_skips_not_approved_and_missing_floor():
    from db import get_db
    from routes.imports import apply_floor_plans, ApplyFloorPlansRequest

    db = get_db()
    project_id = str(uuid.uuid4())
    await _seed(db, project_id)
    sid = await _mk_session(db, project_id, [
        # not approved
        {"source_file_id": "f1", "page_number": 1, "floor": 2,
         "review_status": "pending",
         "matched_unit_codes": ["101"],
         "unmatched_detected_codes": [], "detected_unit_codes": ["101"],
         "detected_floor_guess": 2, "floor_guess_confidence": 0.9, "warnings": []},
        # approved but missing floor
        {"source_file_id": "f1", "page_number": 2, "floor": None,
         "review_status": "approved",
         "matched_unit_codes": ["101"],
         "unmatched_detected_codes": [], "detected_unit_codes": ["101"],
         "detected_floor_guess": None, "floor_guess_confidence": 0.0, "warnings": []},
    ])
    user = {"id": "admin-test"}
    result = await apply_floor_plans(sid, ApplyFloorPlansRequest(), user=user)
    reasons = {d.get("reason") for d in result["details"] if d.get("action") == "skipped"}
    assert "not_approved" in reasons
    assert "missing_floor" in reasons
    assert result["summary"]["created"] == 0

    await db.projects.delete_one({"id": project_id})
    await db.properties.delete_many({"project_id": project_id})
    await db.import_sessions.delete_one({"id": sid})
