"""R.9 Dashboard tests: market_available + non_sale split.

These tests verify the new inventory split exposed by GET /api/dashboard/admin/full:
- market_available_* (active market = available + reserved_zero + reserved_paid_deposit)
- non_sale_* (compensation + hidden + unavailable; visual only)
- Legacy `not_sold_*` remains as alias = market_available + non_sale.
- Finance-only fields (`*_value_*`) are present only when is_finance_visible=True.
"""
import os
import math
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

SUPER_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@begestates.bg")
SUPER_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "BegEstates2026!Admin")
SALES_EMAIL = os.environ.get("SALES_EMAIL", "sales@begestates.bg")
SALES_PASSWORD = os.environ.get("SALES_PASSWORD", "BegEstates2026!Sales")


def _login(email, password):
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/staff/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def _fetch_overview(session):
    r = session.get(f"{BASE_URL}/api/dashboard/admin/full", timeout=15)
    assert r.status_code == 200
    return r.json().get("overview") or {}


@pytest.fixture(scope="module")
def admin_overview():
    return _fetch_overview(_login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD))


@pytest.fixture(scope="module")
def sales_overview():
    return _fetch_overview(_login(SALES_EMAIL, SALES_PASSWORD))


def test_overview_has_market_available_split(admin_overview):
    o = admin_overview
    for k in ("market_available_count", "market_available_area",
              "non_sale_count", "non_sale_area"):
        assert k in o, f"missing key {k}"
        assert isinstance(o[k], (int, float))
        assert o[k] >= 0


def test_overview_count_reconciliation(admin_overview):
    o = admin_overview
    total = o["total_count"]
    parts = o["sold_count"] + o["market_available_count"] + o["non_sale_count"] + o.get("other_count", 0)
    assert total == parts, (
        f"count reconciliation broken: total={total} != sold+market+non_sale+other={parts}"
    )


def test_overview_area_reconciliation(admin_overview):
    o = admin_overview
    total_a = o["total_area"]
    parts_a = o["sold_area"] + o["market_available_area"] + o["non_sale_area"]
    assert math.isclose(total_a, parts_a, abs_tol=0.05), (
        f"area reconciliation broken: total_area={total_a} != sold+market+non_sale={parts_a}"
    )


def test_legacy_not_sold_equals_market_plus_non_sale(admin_overview):
    o = admin_overview
    assert o["not_sold_count"] == o["market_available_count"] + o["non_sale_count"], (
        "legacy not_sold_count must equal market_available_count + non_sale_count"
    )


def test_finance_visible_includes_market_value(admin_overview):
    o = admin_overview
    for k in ("market_available_value_net", "market_available_value_with_vat",
              "non_sale_value_visual_only_net", "non_sale_value_visual_only_with_vat"):
        assert k in o, f"finance role missing key {k}"
        assert isinstance(o[k], (int, float))


def test_sales_role_has_no_finance_value_fields(sales_overview):
    o = sales_overview
    # Area fields are visible
    assert "market_available_area" in o
    assert "non_sale_area" in o
    # Finance fields must NOT leak to sales
    for k in ("market_available_value_net", "market_available_value_with_vat",
              "non_sale_value_visual_only_net", "non_sale_value_visual_only_with_vat",
              "sold_value_with_vat", "available_value_with_vat"):
        assert k not in o, f"sales role unexpectedly has finance field: {k}"
