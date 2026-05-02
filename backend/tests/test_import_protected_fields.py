"""Unit-tests за Smart Import protected-fields logic (PATCH 13)."""
from routes.imports import (
    NEUTRAL_IMPORT_FIELDS,
    PROTECTED_FIELDS,
    _is_property_protected,
    _neutral_changes,
    _full_changes,
)


def test_available_without_buyer_is_not_protected():
    prop = {"status": "available", "buyer_id": None}
    assert _is_property_protected(prop, has_active_reservation=False) is False


def test_sold_is_protected():
    prop = {"status": "sold", "buyer_id": None}
    assert _is_property_protected(prop, has_active_reservation=False) is True


def test_reserved_zero_deposit_is_protected():
    prop = {"status": "reserved_zero_deposit", "buyer_id": None}
    assert _is_property_protected(prop, has_active_reservation=False) is True


def test_compensation_is_protected():
    prop = {"status": "compensation", "buyer_id": None}
    assert _is_property_protected(prop, has_active_reservation=False) is True


def test_available_with_buyer_is_protected():
    prop = {"status": "available", "buyer_id": "u1"}
    assert _is_property_protected(prop, has_active_reservation=False) is True


def test_active_reservation_flag_protects():
    prop = {"status": "available", "buyer_id": None}
    assert _is_property_protected(prop, has_active_reservation=True) is True


def test_neutral_changes_detects_price_diff():
    existing = {"list_price": 130200, "area_total": 82.5}
    desired = {"list_price": 140000, "area_total": 82.5, "status": "sold"}
    diffs = _neutral_changes(existing, desired)
    assert len(diffs) == 1
    assert diffs[0]["field"] == "list_price"
    assert diffs[0]["from"] == 130200
    assert diffs[0]["to"] == 140000


def test_neutral_changes_ignores_status_and_buyer():
    existing = {"list_price": 100, "status": "sold", "buyer_id": "u1"}
    desired = {"list_price": 100, "status": "available", "buyer_id": None}
    diffs = _neutral_changes(existing, desired)
    assert diffs == []


def test_full_changes_includes_status():
    existing = {"status": "available", "list_price": 100}
    desired = {"status": "available", "list_price": 110}
    diffs = _full_changes(existing, desired)
    assert len(diffs) == 1
    assert diffs[0]["field"] == "list_price"


def test_status_not_in_neutral_fields():
    assert "status" not in NEUTRAL_IMPORT_FIELDS
    assert "buyer_id" not in NEUTRAL_IMPORT_FIELDS


def test_status_is_in_protected_fields():
    assert "status" in PROTECTED_FIELDS
    assert "buyer_id" in PROTECTED_FIELDS
