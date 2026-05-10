"""
R.6.1 Dashboard Visual + Counting Fix - Backend API Tests

Tests the new counting fields and finance fields in the dashboard API:
- total_properties, sold_count, not_sold_count
- available_count, reserved_count, reserved_zero_count, reserved_deposit_count
- market_available_count, compensation_count, hidden_count, unavailable_count
- non_sale_count, other_count, sellable_count, count_reconciliation_ok
- sellable_potential_with_vat, reserved_value_with_vat, compensation_value_visual_only_with_vat
- Legacy keys: cash, sales, calendar, top_clients, recent_sales, recent_inquiries, alerts
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDashboardR61:
    """R.6.1 Dashboard counting and finance fields tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as super_admin before each test"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/staff/login",
            json={"email": "admin@begestates.bg", "password": "BegEstates2026!Admin"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.admin_session = self.session
        
        # Also create sales session
        self.sales_session = requests.Session()
        sales_login = self.sales_session.post(
            f"{BASE_URL}/api/auth/staff/login",
            json={"email": "sales@begestates.bg", "password": "BegEstates2026!Sales"}
        )
        assert sales_login.status_code == 200, f"Sales login failed: {sales_login.text}"
    
    def test_dashboard_overview_new_counting_fields(self):
        """Test that overview contains all new counting fields"""
        response = self.admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", {})
        
        # Check all new counting fields exist
        required_fields = [
            "total_properties", "sold_count", "not_sold_count",
            "available_count", "reserved_count", "reserved_zero_count", "reserved_deposit_count",
            "market_available_count", "compensation_count", "hidden_count", "unavailable_count",
            "non_sale_count", "other_count", "sellable_count", "count_reconciliation_ok"
        ]
        
        for field in required_fields:
            assert field in overview, f"Missing field: {field}"
            print(f"✓ {field}: {overview[field]}")
    
    def test_dashboard_apartment_filter_math(self):
        """Test apartment filter returns correct counts: total=18, sold=5, not_sold=13"""
        response = self.admin_session.get(
            f"{BASE_URL}/api/dashboard/admin/full",
            params={"property_type": "apartment"}
        )
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", {})
        
        # Verify expected counts for apartments
        assert overview["total_properties"] == 18, f"Expected total=18, got {overview['total_properties']}"
        assert overview["sold_count"] == 5, f"Expected sold=5, got {overview['sold_count']}"
        assert overview["not_sold_count"] == 13, f"Expected not_sold=13, got {overview['not_sold_count']}"
        assert overview["available_count"] == 6, f"Expected available=6, got {overview['available_count']}"
        assert overview["compensation_count"] == 7, f"Expected compensation=7, got {overview['compensation_count']}"
        
        print(f"✓ Apartment counts verified: total={overview['total_properties']}, sold={overview['sold_count']}, not_sold={overview['not_sold_count']}")
    
    def test_dashboard_count_reconciliation(self):
        """Test that count_reconciliation_ok is true when all statuses sum to total"""
        response = self.admin_session.get(
            f"{BASE_URL}/api/dashboard/admin/full",
            params={"property_type": "apartment"}
        )
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", {})
        
        # Verify reconciliation
        assert overview["count_reconciliation_ok"] == True, "Reconciliation should be OK"
        assert overview["other_count"] == 0, f"Other count should be 0, got {overview['other_count']}"
        
        # Verify math: sold + available + reserved_zero + reserved_deposit + compensation + hidden + unavailable = total
        calculated_total = (
            overview["sold_count"] +
            overview["available_count"] +
            overview["reserved_zero_count"] +
            overview["reserved_deposit_count"] +
            overview["compensation_count"] +
            overview["hidden_count"] +
            overview["unavailable_count"]
        )
        assert calculated_total == overview["total_properties"], \
            f"Sum of statuses ({calculated_total}) != total ({overview['total_properties']})"
        
        print(f"✓ Reconciliation verified: {overview['sold_count']}+{overview['available_count']}+{overview['compensation_count']}+0+0+0+0={calculated_total}")
    
    def test_dashboard_finance_fields_for_admin(self):
        """Test that finance fields are present for admin role"""
        response = self.admin_session.get(
            f"{BASE_URL}/api/dashboard/admin/full",
            params={"property_type": "apartment"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["is_finance_visible"] == True
        
        overview = data.get("overview", {})
        
        # Check finance fields exist
        finance_fields = [
            "sellable_potential_with_vat",
            "reserved_value_with_vat",
            "compensation_value_visual_only_with_vat",
            "paid_total",
            "overdue_total"
        ]
        
        for field in finance_fields:
            assert field in overview, f"Missing finance field: {field}"
            print(f"✓ {field}: {overview[field]}")
    
    def test_dashboard_finance_fields_hidden_for_sales(self):
        """Test that finance fields are NOT present for sales role"""
        response = self.sales_session.get(
            f"{BASE_URL}/api/dashboard/admin/full",
            params={"property_type": "apartment"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["is_finance_visible"] == False
        
        overview = data.get("overview", {})
        
        # Check finance fields are NOT present
        finance_fields = [
            "sellable_potential_with_vat",
            "reserved_value_with_vat",
            "compensation_value_visual_only_with_vat",
            "paid_total",
            "overdue_total"
        ]
        
        for field in finance_fields:
            assert field not in overview, f"Finance field should be hidden: {field}"
        
        # But counting fields should still be present
        assert "sold_count" in overview
        assert "available_count" in overview
        assert "compensation_count" in overview
        
        print("✓ Finance fields correctly hidden for sales role")
    
    def test_dashboard_legacy_keys_present(self):
        """Test backward compatibility - legacy keys still present"""
        response = self.admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check legacy keys
        legacy_keys = ["cash", "sales", "calendar", "top_clients", "recent_sales", "recent_inquiries", "alerts"]
        
        for key in legacy_keys:
            assert key in data, f"Missing legacy key: {key}"
            print(f"✓ Legacy key present: {key}")
    
    def test_dashboard_not_sold_calculation(self):
        """Test that not_sold = total - sold"""
        response = self.admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", {})
        
        expected_not_sold = overview["total_properties"] - overview["sold_count"]
        assert overview["not_sold_count"] == expected_not_sold, \
            f"not_sold should be {expected_not_sold}, got {overview['not_sold_count']}"
        
        print(f"✓ not_sold calculation verified: {overview['total_properties']} - {overview['sold_count']} = {overview['not_sold_count']}")
    
    def test_dashboard_market_available_calculation(self):
        """Test that market_available = available + reserved_zero + reserved_deposit"""
        response = self.admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", {})
        
        expected_market = (
            overview["available_count"] +
            overview["reserved_zero_count"] +
            overview["reserved_deposit_count"]
        )
        assert overview["market_available_count"] == expected_market, \
            f"market_available should be {expected_market}, got {overview['market_available_count']}"
        
        print(f"✓ market_available calculation verified: {overview['available_count']} + {overview['reserved_zero_count']} + {overview['reserved_deposit_count']} = {overview['market_available_count']}")
    
    def test_dashboard_non_sale_calculation(self):
        """Test that non_sale = compensation + hidden + unavailable"""
        response = self.admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", {})
        
        expected_non_sale = (
            overview["compensation_count"] +
            overview["hidden_count"] +
            overview["unavailable_count"]
        )
        assert overview["non_sale_count"] == expected_non_sale, \
            f"non_sale should be {expected_non_sale}, got {overview['non_sale_count']}"
        
        print(f"✓ non_sale calculation verified: {overview['compensation_count']} + {overview['hidden_count']} + {overview['unavailable_count']} = {overview['non_sale_count']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
