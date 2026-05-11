"""
R.8 Dashboard Overview Area/Value Enrichment Tests

Tests the new area (м²) and value (€) fields in:
- overview block
- by_type breakdown
- by_floor breakdown  
- by_building breakdown

Key test scenarios:
1. super_admin sees all area + value fields
2. sales role sees area fields but NOT value fields (is_finance_visible=false)
3. Reconciliation: sold_area + not_sold_area == total_area
4. Reconciliation: area percentages sum correctly
5. by_type/by_floor/by_building rows have per-status count/area/value
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
SUPER_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@begestates.bg")
SUPER_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "BegEstates2026!Admin")
SALES_EMAIL = os.environ.get("SALES_EMAIL", "sales@begestates.bg")
SALES_PASSWORD = os.environ.get("SALES_PASSWORD", "BegEstates2026!Sales")


class TestDashboardR8SuperAdmin:
    """R.8 Dashboard tests as super_admin (full finance visibility)"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as super_admin and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/staff/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        yield
        self.session.close()

    def test_dashboard_full_returns_200(self):
        """GET /api/dashboard/admin/full returns 200 for super_admin"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200, f"Dashboard failed: {resp.text}"
        data = resp.json()
        assert "overview" in data
        assert "by_type" in data
        assert "by_floor" in data
        assert "by_building" in data

    def test_overview_has_area_fields(self):
        """Overview block contains all required area fields"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        # Required area fields (always visible)
        area_fields = [
            "total_area",
            "total_rzp_area",
            "sold_area",
            "sold_area_percent",
            "compensation_area",
            "compensation_area_percent",
            "not_sold_area",
            "not_sold_area_percent",
            "available_area",
            "reserved_zero_area",
            "reserved_deposit_area",
            "hidden_area",
            "unavailable_area",
            "hidden_unavailable_area",
        ]

        for field in area_fields:
            assert field in overview, f"Missing area field: {field}"
            val = overview[field]
            assert val is not None, f"Area field {field} is None"
            assert isinstance(val, (int, float)), f"Area field {field} is not numeric: {type(val)}"
            # Check no NaN
            assert val == val, f"Area field {field} is NaN"
            assert val >= 0, f"Area field {field} is negative: {val}"

    def test_overview_has_value_fields_for_finance_role(self):
        """Overview block contains all required value fields for super_admin"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        data = resp.json()
        overview = data.get("overview", {})

        # Finance visibility flag
        assert data.get("is_finance_visible") is True, "super_admin should have is_finance_visible=True"

        # Required value fields (only for finance roles)
        value_fields = [
            "total_market_value_with_vat",
            "sold_value_with_vat",
            "not_sold_value_with_vat",
            "compensation_value_visual_only_with_vat",
            "hidden_unavailable_value_visual_only_with_vat",
            "available_value_with_vat",
            "reserved_zero_value_with_vat",
            "reserved_deposit_value_with_vat",
        ]

        for field in value_fields:
            assert field in overview, f"Missing value field: {field}"
            val = overview[field]
            assert val is not None, f"Value field {field} is None"
            assert isinstance(val, (int, float)), f"Value field {field} is not numeric: {type(val)}"
            # Check no NaN
            assert val == val, f"Value field {field} is NaN"
            assert val >= 0, f"Value field {field} is negative: {val}"

    def test_area_reconciliation_sold_plus_not_sold(self):
        """sold_area + not_sold_area should equal total_area (within tolerance)"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        total_area = overview.get("total_area", 0)
        sold_area = overview.get("sold_area", 0)
        not_sold_area = overview.get("not_sold_area", 0)

        # not_sold includes everything except sold
        # Tolerance for floating point
        diff = abs((sold_area + not_sold_area) - total_area)
        # Note: not_sold_area includes compensation, hidden, unavailable, available, reserved
        # So sold + not_sold should NOT equal total (not_sold is everything except sold)
        # Actually: not_sold = total - sold, so sold + not_sold = total
        # Wait, let me check the code... not_sold = [p for p in all_props if p.get("status") != "sold"]
        # So not_sold_area = sum of areas where status != sold
        # And sold_area = sum of areas where status == sold
        # Therefore sold_area + not_sold_area == total_area
        
        assert diff < 0.01, f"Area reconciliation failed: sold({sold_area}) + not_sold({not_sold_area}) = {sold_area + not_sold_area}, expected {total_area}, diff={diff}"

    def test_area_percent_reconciliation(self):
        """sold_area_percent + not_sold_area_percent should be ~100%"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        sold_pct = overview.get("sold_area_percent", 0)
        not_sold_pct = overview.get("not_sold_area_percent", 0)

        total_pct = sold_pct + not_sold_pct
        # Allow for rounding (each is rounded to 1 decimal)
        assert 99.5 <= total_pct <= 100.5, f"Percent reconciliation failed: sold_pct({sold_pct}) + not_sold_pct({not_sold_pct}) = {total_pct}, expected ~100"

    def test_area_bucket_reconciliation(self):
        """Sum of all status bucket areas should equal total_area"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        total_area = overview.get("total_area", 0)
        sold_area = overview.get("sold_area", 0)
        available_area = overview.get("available_area", 0)
        reserved_zero_area = overview.get("reserved_zero_area", 0)
        reserved_deposit_area = overview.get("reserved_deposit_area", 0)
        compensation_area = overview.get("compensation_area", 0)
        hidden_area = overview.get("hidden_area", 0)
        unavailable_area = overview.get("unavailable_area", 0)

        bucket_sum = (
            sold_area
            + available_area
            + reserved_zero_area
            + reserved_deposit_area
            + compensation_area
            + hidden_area
            + unavailable_area
        )

        diff = abs(bucket_sum - total_area)
        assert diff < 0.01, f"Bucket reconciliation failed: sum({bucket_sum}) != total({total_area}), diff={diff}"

    def test_by_type_has_area_value_fields(self):
        """by_type rows have required area and value fields"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        by_type = resp.json().get("by_type", [])

        if not by_type:
            pytest.skip("No by_type data available")

        required_fields = [
            "type",
            "total",
            "total_area",
            "sold",
            "sold_area",
            "sold_value_with_vat",
            "not_sold",
            "not_sold_area",
            "not_sold_value_with_vat",
            "available",
            "available_area",
            "available_value_with_vat",
            "reserved_zero",
            "reserved_deposit",
            "compensation",
            "compensation_area",
            "compensation_value_with_vat",
            "hidden",
            "unavailable",
        ]

        for row in by_type:
            for field in required_fields:
                assert field in row, f"by_type row missing field: {field}. Row: {row}"

    def test_by_floor_has_area_value_fields(self):
        """by_floor rows have required area and value fields"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        by_floor = resp.json().get("by_floor", [])

        if not by_floor:
            pytest.skip("No by_floor data available")

        required_fields = [
            "floor",
            "total",
            "total_area",
            "sold",
            "sold_area",
            "sold_value_with_vat",
            "not_sold",
            "not_sold_area",
            "not_sold_value_with_vat",
            "available",
            "available_area",
            "available_value_with_vat",
        ]

        for row in by_floor:
            for field in required_fields:
                assert field in row, f"by_floor row missing field: {field}. Row keys: {list(row.keys())}"

    def test_by_building_has_area_value_fields(self):
        """by_building rows have required area and value fields"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        by_building = resp.json().get("by_building", [])

        if not by_building:
            pytest.skip("No by_building data available")

        required_fields = [
            "building_id",
            "name",
            "total",
            "total_area",
            "sold",
            "sold_area",
            "sold_value_with_vat",
            "not_sold",
            "not_sold_area",
            "not_sold_value_with_vat",
            "available",
            "available_area",
            "available_value_with_vat",
        ]

        for row in by_building:
            for field in required_fields:
                assert field in row, f"by_building row missing field: {field}. Row keys: {list(row.keys())}"


class TestDashboardR8SalesRole:
    """R.8 Dashboard tests as sales role (NO finance visibility)"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as sales and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/staff/login",
            json={"email": SALES_EMAIL, "password": SALES_PASSWORD},
        )
        assert login_resp.status_code == 200, f"Sales login failed: {login_resp.text}"
        yield
        self.session.close()

    def test_sales_dashboard_returns_200(self):
        """GET /api/dashboard/admin/full returns 200 for sales"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200, f"Dashboard failed for sales: {resp.text}"

    def test_sales_has_area_fields(self):
        """Sales role can see area fields (area is not financial data)"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        # Area fields should be visible for all roles
        area_fields = [
            "total_area",
            "total_rzp_area",
            "sold_area",
            "sold_area_percent",
            "compensation_area",
            "compensation_area_percent",
            "not_sold_area",
            "not_sold_area_percent",
            "available_area",
            "reserved_zero_area",
            "reserved_deposit_area",
            "hidden_area",
            "unavailable_area",
            "hidden_unavailable_area",
        ]

        for field in area_fields:
            assert field in overview, f"Sales should see area field: {field}"
            val = overview[field]
            assert val is not None, f"Area field {field} is None for sales"
            assert val >= 0, f"Area field {field} is negative for sales: {val}"

    def test_sales_no_finance_visibility(self):
        """Sales role should have is_finance_visible=False"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        data = resp.json()

        assert data.get("is_finance_visible") is False, "Sales should have is_finance_visible=False"

    def test_sales_value_fields_missing_or_null(self):
        """Sales role should NOT see value fields (or they should be null/missing)"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        # Value fields that should NOT be present for sales
        value_fields = [
            "total_market_value_with_vat",
            "sold_value_with_vat",
            "not_sold_value_with_vat",
            "compensation_value_visual_only_with_vat",
            "hidden_unavailable_value_visual_only_with_vat",
            "available_value_with_vat",
            "reserved_zero_value_with_vat",
            "reserved_deposit_value_with_vat",
            "paid_total",
            "overdue_total",
        ]

        for field in value_fields:
            # Field should either be missing or None
            if field in overview:
                assert overview[field] is None, f"Sales should NOT see value field {field}, got: {overview[field]}"


class TestDashboardR8DataIntegrity:
    """R.8 Data integrity and edge case tests"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as super_admin"""
        self.session = requests.Session()
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/staff/login",
            json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD},
        )
        assert login_resp.status_code == 200
        yield
        self.session.close()

    def test_no_nan_values_in_overview(self):
        """No NaN values in overview numeric fields"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        for key, val in overview.items():
            if isinstance(val, float):
                assert val == val, f"NaN detected in overview.{key}"

    def test_no_nan_values_in_by_type(self):
        """No NaN values in by_type rows"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        by_type = resp.json().get("by_type", [])

        for row in by_type:
            for key, val in row.items():
                if isinstance(val, float):
                    assert val == val, f"NaN detected in by_type[{row.get('type')}].{key}"

    def test_area_values_are_reasonable(self):
        """Area values should be reasonable (not astronomically large)"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        total_area = overview.get("total_area", 0)
        # Sanity check: total area should be less than 1 million m² for a real estate project
        assert total_area < 1_000_000, f"Total area seems unreasonably large: {total_area}"

    def test_percent_values_in_valid_range(self):
        """Percent values should be between 0 and 100"""
        resp = self.session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        overview = resp.json().get("overview", {})

        percent_fields = [
            "sold_area_percent",
            "compensation_area_percent",
            "not_sold_area_percent",
        ]

        for field in percent_fields:
            val = overview.get(field, 0)
            assert 0 <= val <= 100, f"Percent field {field} out of range: {val}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
