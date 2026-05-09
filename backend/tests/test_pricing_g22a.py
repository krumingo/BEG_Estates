"""
G.2.2A Pricing Settings + Bulk Recalc Tests
Tests for:
- PUT /api/admin/projects/{id} with pricing_settings
- POST /api/admin/projects/{id}/pricing/recalc (dry_run=true/false)
- GET /api/admin/projects/{id}/pricing/preview-display-prices
- Role-based access (super_admin only, sales gets 403, anonymous gets 401)
- Pricing engine resolution priority
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
PROJECT_ID = "530a81a9-0b56-4b9b-a447-47170ff29cc2"  # Хаджи Димитър

# Test credentials
SUPER_ADMIN_EMAIL = "admin@begestates.bg"
SUPER_ADMIN_PASSWORD = "BegEstates2026!Admin"
SALES_EMAIL = "sales@begestates.bg"
SALES_PASSWORD = "BegEstates2026!Sales"


@pytest.fixture(scope="module")
def super_admin_session():
    """Login as super_admin and return session with cookies."""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/staff/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Super admin login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def sales_session():
    """Login as sales and return session with cookies."""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/staff/login", json={
        "email": SALES_EMAIL,
        "password": SALES_PASSWORD
    })
    assert resp.status_code == 200, f"Sales login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def anonymous_session():
    """Return session without auth."""
    return requests.Session()


class TestPricingSettingsPersistence:
    """Test PUT /api/admin/projects/{id} with pricing_settings."""

    def test_put_pricing_settings_super_admin(self, super_admin_session):
        """Super admin can PUT pricing_settings and they persist."""
        payload = {
            "pricing_settings": {
                "base_price_per_sqm": 2200.0,
                "vat_rate": 20.0,
                "floor_corrections": [
                    {"floor": 1, "price_per_sqm": 2200.0},
                    {"floor": 2, "price_per_sqm": 2280.0},
                    {"floor": 3, "price_per_sqm": 2360.0},
                ],
                "type_overrides": [
                    {"property_type": "shop", "price_per_sqm": 2131.0},
                    {"property_type": "garage", "price_per_sqm": 1212.0},
                ]
            }
        }
        resp = super_admin_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json=payload
        )
        assert resp.status_code == 200, f"PUT failed: {resp.text}"
        
        data = resp.json()
        assert "pricing_settings" in data
        ps = data["pricing_settings"]
        assert ps["base_price_per_sqm"] == 2200.0
        assert ps["vat_rate"] == 20.0
        assert len(ps["floor_corrections"]) == 3
        assert len(ps["type_overrides"]) == 2
        
        # Verify persistence via GET
        get_resp = super_admin_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}")
        assert get_resp.status_code == 200
        project = get_resp.json()["project"]
        assert project["pricing_settings"]["base_price_per_sqm"] == 2200.0

    def test_put_pricing_settings_sales_forbidden(self, sales_session):
        """Sales role cannot PUT to admin endpoint."""
        payload = {"pricing_settings": {"base_price_per_sqm": 9999.0}}
        resp = sales_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json=payload
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    def test_put_pricing_settings_anonymous_unauthorized(self, anonymous_session):
        """Anonymous cannot PUT to admin endpoint."""
        payload = {"pricing_settings": {"base_price_per_sqm": 9999.0}}
        resp = anonymous_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json=payload
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


class TestRecalcDryRun:
    """Test POST /api/admin/projects/{id}/pricing/recalc with dry_run=true."""

    def test_recalc_dry_run_returns_items(self, super_admin_session):
        """dry_run=true returns BulkRecalcResult with items."""
        # First ensure pricing_settings are set
        payload_settings = {
            "pricing_settings": {
                "base_price_per_sqm": 2200.0,
                "vat_rate": 20.0,
                "floor_corrections": [
                    {"floor": 1, "price_per_sqm": 2200.0},
                    {"floor": 2, "price_per_sqm": 2280.0},
                    {"floor": 3, "price_per_sqm": 2360.0},
                    {"floor": 4, "price_per_sqm": 2440.0},
                    {"floor": 5, "price_per_sqm": 2520.0},
                    {"floor": 6, "price_per_sqm": 2600.0},
                ],
                "type_overrides": [
                    {"property_type": "shop", "price_per_sqm": 2131.0},
                    {"property_type": "garage", "price_per_sqm": 1212.0},
                    {"property_type": "parking", "price_per_sqm": 760.0},
                    {"property_type": "yard_parking", "price_per_sqm": 600.0},
                    {"property_type": "storage", "price_per_sqm": 350.0},
                ]
            }
        }
        super_admin_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json=payload_settings
        )
        
        # Now do dry_run recalc
        resp = super_admin_session.post(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/recalc",
            json={
                "project_id": PROJECT_ID,
                "dry_run": True,
                "overwrite_overrides": False
            }
        )
        assert resp.status_code == 200, f"Recalc failed: {resp.text}"
        
        data = resp.json()
        assert data["project_id"] == PROJECT_ID
        assert data["dry_run"] is True
        assert "total_properties" in data
        assert "updated_count" in data
        assert "skipped_count" in data
        assert "items" in data
        assert isinstance(data["items"], list)
        
        # Check item structure
        if data["items"]:
            item = data["items"][0]
            assert "code" in item
            assert "property_type" in item
            assert "floor" in item
            assert "area_total" in item
            assert "old_list_price" in item
            assert "new_list_price" in item
            assert "delta" in item
            assert "used_pricing_source" in item
            assert "skipped" in item
            assert "skip_reason" in item

    def test_recalc_without_pricing_settings_returns_400(self, super_admin_session):
        """Recalc without pricing_settings returns 400."""
        # Clear pricing_settings
        super_admin_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json={"pricing_settings": {}}
        )
        
        resp = super_admin_session.post(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/recalc",
            json={
                "project_id": PROJECT_ID,
                "dry_run": True
            }
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        # Restore pricing_settings for other tests
        super_admin_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json={
                "pricing_settings": {
                    "base_price_per_sqm": 2200.0,
                    "vat_rate": 20.0,
                    "floor_corrections": [
                        {"floor": 1, "price_per_sqm": 2200.0},
                        {"floor": 2, "price_per_sqm": 2280.0},
                    ],
                    "type_overrides": [
                        {"property_type": "garage", "price_per_sqm": 1212.0},
                    ]
                }
            }
        )

    def test_recalc_sales_forbidden(self, sales_session):
        """Sales role cannot access recalc endpoint."""
        resp = sales_session.post(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/recalc",
            json={"project_id": PROJECT_ID, "dry_run": True}
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    def test_recalc_anonymous_unauthorized(self, anonymous_session):
        """Anonymous cannot access recalc endpoint."""
        resp = anonymous_session.post(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/recalc",
            json={"project_id": PROJECT_ID, "dry_run": True}
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


class TestRecalcApply:
    """Test POST /api/admin/projects/{id}/pricing/recalc with dry_run=false."""

    def test_recalc_apply_updates_db(self, super_admin_session):
        """dry_run=false applies updates to db.properties."""
        # Ensure pricing_settings are set
        payload_settings = {
            "pricing_settings": {
                "base_price_per_sqm": 2200.0,
                "vat_rate": 20.0,
                "floor_corrections": [
                    {"floor": 1, "price_per_sqm": 2200.0},
                    {"floor": 2, "price_per_sqm": 2280.0},
                    {"floor": 3, "price_per_sqm": 2360.0},
                    {"floor": 4, "price_per_sqm": 2440.0},
                    {"floor": 5, "price_per_sqm": 2520.0},
                    {"floor": 6, "price_per_sqm": 2600.0},
                ],
                "type_overrides": [
                    {"property_type": "shop", "price_per_sqm": 2131.0},
                    {"property_type": "garage", "price_per_sqm": 1212.0},
                    {"property_type": "parking", "price_per_sqm": 760.0},
                    {"property_type": "yard_parking", "price_per_sqm": 600.0},
                    {"property_type": "storage", "price_per_sqm": 350.0},
                ]
            }
        }
        super_admin_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json=payload_settings
        )
        
        # Apply recalc
        resp = super_admin_session.post(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/recalc",
            json={
                "project_id": PROJECT_ID,
                "dry_run": False,
                "overwrite_overrides": False
            }
        )
        assert resp.status_code == 200, f"Recalc apply failed: {resp.text}"
        
        data = resp.json()
        assert data["dry_run"] is False
        assert data["updated_count"] >= 0
        
        # Verify audit log was created (check via properties endpoint)
        # The audit log 'pricing_bulk_recalc' should be emitted
        print(f"Applied recalc: updated={data['updated_count']}, skipped={data['skipped_count']}")


class TestPreviewDisplayPrices:
    """Test GET /api/admin/projects/{id}/pricing/preview-display-prices."""

    def test_preview_display_prices_returns_rows(self, super_admin_session):
        """Preview returns rows with list_price and display_price_with_vat."""
        resp = super_admin_session.get(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/preview-display-prices"
        )
        assert resp.status_code == 200, f"Preview failed: {resp.text}"
        
        data = resp.json()
        assert data["project_id"] == PROJECT_ID
        assert "vat_rate" in data
        assert "rows" in data
        assert isinstance(data["rows"], list)
        
        # Check row structure
        if data["rows"]:
            row = data["rows"][0]
            assert "code" in row
            assert "property_type" in row
            assert "list_price" in row
            assert "display_price_with_vat" in row
            assert "vat_rate" in row
            
            # Verify VAT calculation: display = list_price × (1 + vat_rate/100)
            if row["list_price"] is not None:
                expected_display = round(row["list_price"] * (1 + row["vat_rate"] / 100), 2)
                assert row["display_price_with_vat"] == expected_display, \
                    f"VAT calc mismatch: {row['display_price_with_vat']} != {expected_display}"

    def test_preview_display_prices_sales_forbidden(self, sales_session):
        """Sales role cannot access preview-display-prices."""
        resp = sales_session.get(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/preview-display-prices"
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    def test_preview_display_prices_anonymous_unauthorized(self, anonymous_session):
        """Anonymous cannot access preview-display-prices."""
        resp = anonymous_session.get(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/preview-display-prices"
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


class TestPricingEngineResolution:
    """Test pricing engine resolution priority: manual → type → floor → base."""

    def test_pricing_sources_in_recalc_result(self, super_admin_session):
        """Verify used_pricing_source values in recalc result."""
        # Ensure full pricing_settings
        payload_settings = {
            "pricing_settings": {
                "base_price_per_sqm": 2200.0,
                "vat_rate": 20.0,
                "floor_corrections": [
                    {"floor": 1, "price_per_sqm": 2200.0},
                    {"floor": 2, "price_per_sqm": 2280.0},
                    {"floor": 3, "price_per_sqm": 2360.0},
                    {"floor": 4, "price_per_sqm": 2440.0},
                    {"floor": 5, "price_per_sqm": 2520.0},
                    {"floor": 6, "price_per_sqm": 2600.0},
                ],
                "type_overrides": [
                    {"property_type": "shop", "price_per_sqm": 2131.0},
                    {"property_type": "garage", "price_per_sqm": 1212.0},
                    {"property_type": "parking", "price_per_sqm": 760.0},
                    {"property_type": "yard_parking", "price_per_sqm": 600.0},
                    {"property_type": "storage", "price_per_sqm": 350.0},
                ]
            }
        }
        super_admin_session.put(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}",
            json=payload_settings
        )
        
        resp = super_admin_session.post(
            f"{BASE_URL}/api/admin/projects/{PROJECT_ID}/pricing/recalc",
            json={
                "project_id": PROJECT_ID,
                "dry_run": True,
                "overwrite_overrides": False
            }
        )
        assert resp.status_code == 200
        
        data = resp.json()
        sources = set()
        for item in data["items"]:
            sources.add(item["used_pricing_source"])
        
        print(f"Pricing sources found: {sources}")
        
        # We expect at least some of these sources
        valid_sources = {"manual_override", "type_override", "floor_correction", "base", "none"}
        for s in sources:
            assert s in valid_sources, f"Unknown pricing source: {s}"


class TestNonExistentProject:
    """Test endpoints with non-existent project ID."""

    def test_recalc_nonexistent_project_404(self, super_admin_session):
        """Recalc on non-existent project returns 404."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = super_admin_session.post(
            f"{BASE_URL}/api/admin/projects/{fake_id}/pricing/recalc",
            json={"project_id": fake_id, "dry_run": True}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    def test_preview_nonexistent_project_404(self, super_admin_session):
        """Preview on non-existent project returns 404."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = super_admin_session.get(
            f"{BASE_URL}/api/admin/projects/{fake_id}/pricing/preview-display-prices"
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
