"""R.7 Construction Cashflow Tab - Backend API Tests

Tests for the Construction Cashflow feature:
1. GET /api/dashboard/admin/full returns construction_cashflow for finance roles
2. construction_cashflow is NOT returned (or null) for sales role
3. PUT /api/admin/projects/{id} accepts construction_cashflow_settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@begestates.bg"
ADMIN_PASSWORD = "BegEstates2026!Admin"
SALES_EMAIL = "sales@begestates.bg"
SALES_PASSWORD = "BegEstates2026!Sales"


class TestConstructionCashflowR7:
    """R.7 Construction Cashflow API tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as super_admin and return session with cookies"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/staff/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def sales_session(self):
        """Login as sales and return session with cookies"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/staff/login", json={
            "email": SALES_EMAIL,
            "password": SALES_PASSWORD
        })
        assert resp.status_code == 200, f"Sales login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def project_id(self, admin_session):
        """Get first project ID for testing"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/projects")
        if resp.status_code != 200:
            resp = admin_session.get(f"{BASE_URL}/api/projects")
        assert resp.status_code == 200, f"Failed to get projects: {resp.text}"
        projects = resp.json()
        assert len(projects) > 0, "No projects found for testing"
        return projects[0]["id"]
    
    # ========== Test 1: Dashboard returns construction_cashflow for admin ==========
    def test_dashboard_returns_construction_cashflow_for_admin(self, admin_session, project_id):
        """GET /api/dashboard/admin/full with project_id returns construction_cashflow for admin"""
        resp = admin_session.get(f"{BASE_URL}/api/dashboard/admin/full", params={"project_id": project_id})
        assert resp.status_code == 200, f"Dashboard request failed: {resp.text}"
        
        data = resp.json()
        
        # Verify is_finance_visible is True for admin
        assert data.get("is_finance_visible") == True, "is_finance_visible should be True for admin"
        
        # Verify construction_cashflow exists
        assert "construction_cashflow" in data, "construction_cashflow field missing from response"
        
        cc = data["construction_cashflow"]
        assert cc is not None, "construction_cashflow should not be None for admin"
        
        # Verify construction_cashflow structure
        assert "available" in cc, "construction_cashflow.available missing"
        assert "settings" in cc, "construction_cashflow.settings missing"
        assert "totals" in cc, "construction_cashflow.totals missing"
        assert "monthly" in cc, "construction_cashflow.monthly missing"
        assert "alerts" in cc, "construction_cashflow.alerts missing"
        
        print(f"✓ construction_cashflow.available = {cc['available']}")
        print(f"✓ construction_cashflow has {len(cc.get('monthly', []))} monthly entries")
        print(f"✓ construction_cashflow has {len(cc.get('alerts', []))} alerts")
    
    # ========== Test 2: Dashboard without project shows unavailable ==========
    def test_dashboard_without_project_shows_unavailable(self, admin_session):
        """GET /api/dashboard/admin/full without project_id returns construction_cashflow.available=False"""
        resp = admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200, f"Dashboard request failed: {resp.text}"
        
        data = resp.json()
        cc = data.get("construction_cashflow", {})
        
        # Without project, available should be False
        assert cc.get("available") == False, "construction_cashflow.available should be False without project"
        assert cc.get("reason") is not None, "construction_cashflow.reason should explain why unavailable"
        
        print(f"✓ Without project: available={cc.get('available')}, reason='{cc.get('reason')}'")
    
    # ========== Test 3: Sales role does NOT see construction_cashflow ==========
    def test_sales_role_no_construction_cashflow(self, sales_session, project_id):
        """GET /api/dashboard/admin/full for sales role should have is_finance_visible=False"""
        resp = sales_session.get(f"{BASE_URL}/api/dashboard/admin/full", params={"project_id": project_id})
        assert resp.status_code == 200, f"Dashboard request failed: {resp.text}"
        
        data = resp.json()
        
        # Verify is_finance_visible is False for sales
        assert data.get("is_finance_visible") == False, "is_finance_visible should be False for sales"
        
        # construction_cashflow should either be missing, null, or have available=False
        cc = data.get("construction_cashflow")
        if cc is not None:
            # If present, it should indicate unavailable or have no sensitive data
            assert cc.get("available") == False or cc.get("monthly") == [], \
                "Sales should not see construction_cashflow data"
        
        print(f"✓ Sales role: is_finance_visible={data.get('is_finance_visible')}")
        print(f"✓ Sales role: construction_cashflow={cc}")
    
    # ========== Test 4: PUT project with construction_cashflow_settings ==========
    def test_update_project_construction_settings(self, admin_session, project_id):
        """PUT /api/admin/projects/{id} accepts construction_cashflow_settings"""
        settings = {
            "construction_cashflow_settings": {
                "total_rzp_area": 5000,
                "rough_cost_per_sqm": 400,
                "full_cost_per_sqm": 700,
                "cash_opening_balance": 500000,
                "minimum_cash_reserve": 100000,
                "reserve_percent": 10,
                "rough_start_date": "2026-06-01",
                "rough_frontload_months": 3,
                "rough_frontload_percent": 50,
                "rough_remaining_months_to_act14": 8,
                "forecast_months": 24,
                "notes": "Test settings from R.7 pytest"
            }
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/admin/projects/{project_id}", json=settings)
        assert resp.status_code == 200, f"Update project failed: {resp.text}"
        
        updated = resp.json()
        assert "construction_cashflow_settings" in updated, "construction_cashflow_settings not in response"
        
        saved = updated["construction_cashflow_settings"]
        assert saved.get("total_rzp_area") == 5000, "total_rzp_area not saved correctly"
        assert saved.get("rough_cost_per_sqm") == 400, "rough_cost_per_sqm not saved correctly"
        assert saved.get("notes") == "Test settings from R.7 pytest", "notes not saved correctly"
        
        print(f"✓ Project settings saved: total_rzp_area={saved.get('total_rzp_area')}")
    
    # ========== Test 5: Verify dashboard reflects saved settings ==========
    def test_dashboard_reflects_saved_settings(self, admin_session, project_id):
        """After saving settings, dashboard should show calculated cashflow"""
        resp = admin_session.get(f"{BASE_URL}/api/dashboard/admin/full", params={"project_id": project_id})
        assert resp.status_code == 200, f"Dashboard request failed: {resp.text}"
        
        data = resp.json()
        cc = data.get("construction_cashflow", {})
        
        # Should be available now with settings
        assert cc.get("available") == True, "construction_cashflow should be available after settings saved"
        
        # Verify totals reflect the settings
        totals = cc.get("totals", {})
        assert totals.get("total_rzp_area") == 5000, "totals.total_rzp_area should match settings"
        assert totals.get("rough_cost_per_sqm") == 400, "totals.rough_cost_per_sqm should match settings"
        
        # Verify monthly data is generated
        monthly = cc.get("monthly", [])
        assert len(monthly) > 0, "monthly cashflow data should be generated"
        
        # Verify first month has expected structure
        first_month = monthly[0]
        assert "month" in first_month, "monthly entry should have month"
        assert "month_label" in first_month, "monthly entry should have month_label"
        assert "opening_balance" in first_month, "monthly entry should have opening_balance"
        assert "closing_balance" in first_month, "monthly entry should have closing_balance"
        assert "status" in first_month, "monthly entry should have status"
        
        print(f"✓ Dashboard shows {len(monthly)} months of cashflow data")
        print(f"✓ First month: {first_month.get('month_label')}, status={first_month.get('status')}")
    
    # ========== Test 6: Verify KPI totals calculation ==========
    def test_kpi_totals_calculation(self, admin_session, project_id):
        """Verify KPI totals are calculated correctly"""
        resp = admin_session.get(f"{BASE_URL}/api/dashboard/admin/full", params={"project_id": project_id})
        assert resp.status_code == 200
        
        cc = resp.json().get("construction_cashflow", {})
        totals = cc.get("totals", {})
        
        # Verify calculated values
        # rough_total_cost = total_rzp_area * rough_cost_per_sqm = 5000 * 400 = 2,000,000
        expected_rough_total = 5000 * 400
        assert totals.get("rough_total_cost") == expected_rough_total, \
            f"rough_total_cost should be {expected_rough_total}, got {totals.get('rough_total_cost')}"
        
        # full_total_cost = total_rzp_area * full_cost_per_sqm = 5000 * 700 = 3,500,000
        expected_full_total = 5000 * 700
        assert totals.get("full_total_cost") == expected_full_total, \
            f"full_total_cost should be {expected_full_total}, got {totals.get('full_total_cost')}"
        
        # remaining_after_rough = full_total - rough_total = 3,500,000 - 2,000,000 = 1,500,000
        expected_remaining = expected_full_total - expected_rough_total
        assert totals.get("remaining_after_rough") == expected_remaining, \
            f"remaining_after_rough should be {expected_remaining}, got {totals.get('remaining_after_rough')}"
        
        print(f"✓ KPI calculations verified:")
        print(f"  - rough_total_cost: {totals.get('rough_total_cost'):,} €")
        print(f"  - full_total_cost: {totals.get('full_total_cost'):,} €")
        print(f"  - remaining_after_rough: {totals.get('remaining_after_rough'):,} €")
    
    # ========== Test 7: Other tabs still work (regression) ==========
    def test_other_tabs_not_broken(self, admin_session):
        """Verify other dashboard data is still returned correctly"""
        resp = admin_session.get(f"{BASE_URL}/api/dashboard/admin/full")
        assert resp.status_code == 200
        
        data = resp.json()
        
        # Verify essential dashboard sections exist
        assert "overview" in data, "overview section missing"
        assert "finance" in data, "finance section missing"
        assert "sales_pipeline" in data, "sales_pipeline section missing"
        assert "by_type" in data, "by_type section missing"
        assert "clients_summary" in data, "clients_summary section missing"
        assert "money_calendar" in data, "money_calendar section missing"
        assert "unsold_inventory" in data, "unsold_inventory section missing"
        
        # Verify overview has expected fields
        overview = data["overview"]
        assert "total_properties" in overview, "overview.total_properties missing"
        assert "sold_count" in overview, "overview.sold_count missing"
        assert "available_count" in overview, "overview.available_count missing"
        
        print(f"✓ All dashboard sections present")
        print(f"✓ overview.total_properties = {overview.get('total_properties')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
