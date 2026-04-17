"""
BEG Estates / EstateFlow API Tests - Iteration 2
Tests for: HD project seed, English status keys, privacy (admin-only fields stripped),
buyers collection, status_history, zero-deposit limits, role enforcement.
"""
import os
import pytest
import requests
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@begestates.bg"
ADMIN_PASSWORD = "Admin123!"
SALES_EMAIL = "sales@begestates.bg"
SALES_PASSWORD = "Sales123!"
CLIENT_EMAIL = "ivan.petrov@example.com"

# Admin-only fields that should be stripped from public responses
ADMIN_ONLY_FIELDS = ["buyer_id", "admin_notes", "negotiated_price", "source_ref", "final_contract_price"]


def get_fresh_session():
    """Create a fresh session without any cookies"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_session():
    """Session with admin auth cookies"""
    session = get_fresh_session()
    response = session.post(f"{BASE_URL}/api/auth/staff/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin authentication failed: {response.status_code}")
    
    auth_session = get_fresh_session()
    auth_session.cookies.update(response.cookies)
    return auth_session


@pytest.fixture(scope="module")
def client_session():
    """Session with client auth cookies via OTP"""
    session = get_fresh_session()
    
    # Request OTP
    otp_response = session.post(f"{BASE_URL}/api/auth/client/request-otp", json={
        "email": CLIENT_EMAIL
    })
    if otp_response.status_code != 200:
        pytest.skip(f"Client OTP request failed: {otp_response.status_code}")
    
    dev_otp = otp_response.json().get("dev_otp")
    if not dev_otp:
        pytest.skip("No dev_otp returned in response")
    
    # Verify OTP
    verify_response = session.post(f"{BASE_URL}/api/auth/client/verify-otp", json={
        "email": CLIENT_EMAIL,
        "code": dev_otp
    })
    if verify_response.status_code != 200:
        pytest.skip(f"Client OTP verification failed: {verify_response.status_code}")
    
    auth_session = get_fresh_session()
    auth_session.cookies.update(verify_response.cookies)
    return auth_session


@pytest.fixture(scope="module")
def hd_project_id():
    """Get HD project ID (is_primary=true)"""
    session = get_fresh_session()
    response = session.get(f"{BASE_URL}/api/projects")
    projects = response.json()
    for p in projects:
        if p.get("is_primary"):
            return p["id"]
    pytest.skip("No primary project found")


# ============== SEED MIGRATION TESTS ==============

class TestSeedMigration:
    """Verify HD project seeded correctly with new schema"""
    
    def test_two_projects_exist(self):
        """GET /api/projects returns 2 projects"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        projects = response.json()
        assert len(projects) == 2, f"Expected 2 projects, got {len(projects)}"
    
    def test_hd_project_is_primary_and_first(self):
        """HD project is first (is_primary=true), Яна is second (is_primary=false)"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects")
        projects = response.json()
        
        # First project should be HD (primary)
        assert projects[0]["slug"] == "hadzhi-dimitar", f"First project should be HD, got {projects[0]['slug']}"
        assert projects[0]["is_primary"] == True
        
        # Second project should be Яна (not primary)
        assert "Яна" in projects[1]["name"]
        assert projects[1]["is_primary"] == False
        assert projects[1]["status"] == "planned"
    
    def test_hd_project_stats(self):
        """HD stats: total=28 (public, excludes hidden), 1 sold, 1 compensation"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects")
        projects = response.json()
        hd = projects[0]
        
        stats = hd["stats"]
        assert "total" in stats
        assert "available" in stats
        assert "sold" in stats
        assert "reserved" in stats
        assert "compensation" in stats
        
        # Verify counts (public view excludes hidden)
        assert stats["total"] == 28, f"Expected total=28 (public), got {stats['total']}"
        assert stats["sold"] == 1, f"Expected sold=1, got {stats['sold']}"
        assert stats["compensation"] == 1, f"Expected compensation=1, got {stats['compensation']}"
    
    def test_hd_inventory_count_public(self, hd_project_id):
        """Public: GET /api/projects/{hd_id}/properties returns 28 items (excludes hidden 501)"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        assert response.status_code == 200
        properties = response.json()
        
        assert len(properties) == 28, f"Expected 28 public properties, got {len(properties)}"
        
        # Verify 501 is NOT in public list
        codes = [p["code"] for p in properties]
        assert "501" not in codes, "Hidden property 501 should not be in public list"
    
    def test_hd_inventory_count_staff(self, admin_session, hd_project_id):
        """Staff: GET /api/projects/{hd_id}/properties returns 29 properties including hidden 501"""
        response = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        assert response.status_code == 200
        properties = response.json()
        
        assert len(properties) == 29, f"Expected 29 properties for staff, got {len(properties)}"
        
        # Verify 501 IS in staff list
        codes = [p["code"] for p in properties]
        assert "501" in codes, "Hidden property 501 should be visible to staff"
    
    def test_hd_inventory_types(self, hd_project_id):
        """HD has 18 apts, 1 shop, 6 parking, 1 garage, 3 storage (public view = 17 apts due to hidden)"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        properties = response.json()
        
        types = {}
        for p in properties:
            t = p["property_type"]
            types[t] = types.get(t, 0) + 1
        
        # Public view: 17 apartments (501 is hidden)
        assert types.get("apartment", 0) == 17, f"Expected 17 apartments (public), got {types.get('apartment', 0)}"
        assert types.get("shop", 0) == 1, f"Expected 1 shop, got {types.get('shop', 0)}"
        assert types.get("parking", 0) == 6, f"Expected 6 parking, got {types.get('parking', 0)}"
        assert types.get("garage", 0) == 1, f"Expected 1 garage, got {types.get('garage', 0)}"
        assert types.get("storage", 0) == 3, f"Expected 3 storage, got {types.get('storage', 0)}"


# ============== PUBLIC PRIVACY TESTS ==============

class TestPublicPrivacy:
    """Public endpoints must strip admin-only fields and hide hidden status"""
    
    def test_public_properties_no_admin_fields(self, hd_project_id):
        """Public: properties list has no buyer_id/admin_notes/negotiated_price/source_ref/final_contract_price"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        properties = response.json()
        
        for prop in properties:
            for field in ADMIN_ONLY_FIELDS:
                assert field not in prop, f"Admin field '{field}' should not be in public property response"
    
    def test_public_property_detail_no_admin_fields(self, hd_project_id):
        """Public: GET /api/properties/{id} has no admin-only fields"""
        session = get_fresh_session()
        # Get property 102 (reserved_paid_deposit with buyer)
        props_response = session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        prop_102 = next((p for p in props_response.json() if p["code"] == "102"), None)
        assert prop_102, "Property 102 should exist"
        
        response = session.get(f"{BASE_URL}/api/properties/{prop_102['id']}")
        assert response.status_code == 200
        data = response.json()
        
        # Check property has no admin fields
        for field in ADMIN_ONLY_FIELDS:
            assert field not in data["property"], f"Admin field '{field}' should not be in public property detail"
        
        # Check no buyer key in public response
        assert "buyer" not in data, "Buyer info should not be in public response"
    
    def test_hidden_property_returns_404_public(self, admin_session, hd_project_id):
        """Public: GET /api/properties/{hidden_id} returns 404"""
        # Get hidden property 501 ID via staff
        staff_props = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        prop_501 = next((p for p in staff_props if p["code"] == "501"), None)
        assert prop_501, "Property 501 should exist for staff"
        
        # Public access should return 404
        public_session = get_fresh_session()
        response = public_session.get(f"{BASE_URL}/api/properties/{prop_501['id']}")
        assert response.status_code == 404, f"Hidden property should return 404, got {response.status_code}"


# ============== STAFF ACCESS TESTS ==============

class TestStaffAccess:
    """Staff gets full data including admin fields and hidden properties"""
    
    def test_staff_property_has_admin_fields(self, admin_session, hd_project_id):
        """Staff: GET /api/properties/{id} returns admin fields"""
        # Get property 102 (has buyer)
        props_response = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        prop_102 = next((p for p in props_response.json() if p["code"] == "102"), None)
        
        response = admin_session.get(f"{BASE_URL}/api/properties/{prop_102['id']}")
        assert response.status_code == 200
        data = response.json()
        
        # Check admin fields are present
        assert "buyer_id" in data["property"], "buyer_id should be in staff response"
        assert "admin_notes" in data["property"], "admin_notes should be in staff response"
        assert "source_ref" in data["property"], "source_ref should be in staff response"
    
    def test_staff_property_has_buyer_details(self, admin_session, hd_project_id):
        """Staff: GET /api/properties/{apt_102_id} returns buyer key with Николай Костов"""
        props_response = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties")
        prop_102 = next((p for p in props_response.json() if p["code"] == "102"), None)
        
        response = admin_session.get(f"{BASE_URL}/api/properties/{prop_102['id']}")
        data = response.json()
        
        assert "buyer" in data, "Staff response should have buyer key"
        assert data["buyer"]["name"] == "Николай Костов", f"Buyer should be Николай Костов, got {data['buyer'].get('name')}"


# ============== BUYERS COLLECTION TESTS ==============

class TestBuyersCollection:
    """Buyers collection is admin-only"""
    
    def test_buyers_list_staff(self, admin_session):
        """Staff: GET /api/buyers returns 3 seeded buyers"""
        response = admin_session.get(f"{BASE_URL}/api/buyers")
        assert response.status_code == 200
        buyers = response.json()
        
        assert len(buyers) == 3, f"Expected 3 buyers, got {len(buyers)}"
        
        names = [b["name"] for b in buyers]
        assert "Николай Костов" in names
        assert "Мария Георгиева" in names
        assert "Собственик на УПИ (обезщетение)" in names
    
    def test_buyers_list_unauthenticated_401(self):
        """Unauthenticated: GET /api/buyers returns 401"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/buyers")
        assert response.status_code == 401


# ============== PROPERTY STATUSES TESTS ==============

class TestPropertyStatuses:
    """Property status endpoint returns 7 english->Bulgarian mappings"""
    
    def test_property_statuses_returns_7_entries(self):
        """GET /api/property-statuses returns 7 entries"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/property-statuses")
        assert response.status_code == 200
        statuses = response.json()
        
        assert len(statuses) == 7, f"Expected 7 statuses, got {len(statuses)}"
        
        # Verify structure
        for s in statuses:
            assert "value" in s, "Status should have 'value' key"
            assert "label" in s, "Status should have 'label' key"
        
        # Verify expected statuses
        values = [s["value"] for s in statuses]
        expected = ["available", "reserved_zero_deposit", "reserved_paid_deposit", "sold", "compensation", "unavailable", "hidden"]
        for e in expected:
            assert e in values, f"Status '{e}' should be in list"


# ============== STATUS CHANGE TESTS ==============

class TestStatusChange:
    """PATCH /api/properties/{id}/status updates property and creates status_history"""
    
    def test_status_change_valid(self, admin_session, hd_project_id):
        """PATCH status to 'sold' updates property"""
        # Get an available parking
        props = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        avail_parking = next((p for p in props if p["status"] == "available" and p["property_type"] == "parking"), None)
        
        if not avail_parking:
            pytest.skip("No available parking for status change test")
        
        # Change to sold
        response = admin_session.patch(
            f"{BASE_URL}/api/properties/{avail_parking['id']}/status",
            json={"status": "sold"}
        )
        assert response.status_code == 200
        assert response.json().get("ok") == True
        
        # Verify change
        public_session = get_fresh_session()
        prop_response = public_session.get(f"{BASE_URL}/api/properties/{avail_parking['id']}")
        assert prop_response.json()["property"]["status"] == "sold"
        
        # Revert
        admin_session.patch(
            f"{BASE_URL}/api/properties/{avail_parking['id']}/status",
            json={"status": "available"}
        )
    
    def test_status_change_invalid_returns_400(self, admin_session, hd_project_id):
        """PATCH with invalid status returns 400"""
        props = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        prop = props[0]
        
        response = admin_session.patch(
            f"{BASE_URL}/api/properties/{prop['id']}/status",
            json={"status": "invalid_status"}
        )
        assert response.status_code == 400


# ============== ZERO-DEPOSIT RESERVATION TESTS ==============

class TestZeroDepositReservation:
    """Zero-deposit reservation flow with status restrictions"""
    
    def test_cannot_reserve_sold_property(self, client_session, hd_project_id):
        """Reserving apt 301 (sold) returns 409"""
        session = get_fresh_session()
        props = session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        prop_301 = next((p for p in props if p["code"] == "301"), None)
        assert prop_301, "Property 301 should exist"
        
        response = client_session.post(f"{BASE_URL}/api/reservations", json={
            "property_id": prop_301["id"],
            "reservation_type": "zero_deposit"
        })
        assert response.status_code == 409
    
    def test_cannot_reserve_compensation_property(self, client_session, hd_project_id):
        """Reserving apt 401 (compensation) returns 409"""
        session = get_fresh_session()
        props = session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        prop_401 = next((p for p in props if p["code"] == "401"), None)
        assert prop_401, "Property 401 should exist"
        
        response = client_session.post(f"{BASE_URL}/api/reservations", json={
            "property_id": prop_401["id"],
            "reservation_type": "zero_deposit"
        })
        assert response.status_code == 409
    
    def test_cannot_reserve_hidden_property(self, client_session, admin_session, hd_project_id):
        """Reserving hidden property returns 409"""
        # Get hidden property 501 ID via staff
        staff_props = admin_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        prop_501 = next((p for p in staff_props if p["code"] == "501"), None)
        
        response = client_session.post(f"{BASE_URL}/api/reservations", json={
            "property_id": prop_501["id"],
            "reservation_type": "zero_deposit"
        })
        assert response.status_code == 409
    
    def test_ivan_has_seeded_zero_deposit_on_202(self, client_session):
        """Ivan has 1 seeded active zero-deposit on apt 202"""
        response = client_session.get(f"{BASE_URL}/api/reservations")
        assert response.status_code == 200
        reservations = response.json()
        
        active_zero = [r for r in reservations if r["status"] == "active" and r["reservation_type"] == "zero_deposit"]
        assert len(active_zero) >= 1, "Ivan should have at least 1 active zero-deposit"
        
        # Check one is on 202
        codes = [r["property"]["code"] for r in active_zero if r.get("property")]
        assert "202" in codes, "Ivan should have zero-deposit on apt 202"
    
    def test_zero_deposit_limit_enforced(self, hd_project_id):
        """Creating >2 active zero_deposit reservations returns 409 with 'лимит' message"""
        # Create a new test client
        test_email = f"test_limit_{int(time.time())}@example.com"
        
        session = get_fresh_session()
        
        # Request OTP
        otp_response = session.post(f"{BASE_URL}/api/auth/client/request-otp", json={"email": test_email})
        dev_otp = otp_response.json()["dev_otp"]
        
        # Verify OTP
        verify_response = session.post(f"{BASE_URL}/api/auth/client/verify-otp", json={
            "email": test_email,
            "code": dev_otp
        })
        
        test_session = get_fresh_session()
        test_session.cookies.update(verify_response.cookies)
        
        # Get available properties
        public_session = get_fresh_session()
        props = public_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        available = [p for p in props if p["status"] == "available"]
        
        if len(available) < 3:
            pytest.skip("Not enough available properties for limit test")
        
        # Create 2 reservations (should succeed)
        for i in range(2):
            response = test_session.post(f"{BASE_URL}/api/reservations", json={
                "property_id": available[i]["id"],
                "reservation_type": "zero_deposit",
                "notes": f"TEST_limit_{i}"
            })
            assert response.status_code == 200, f"Reservation {i+1} should succeed"
        
        # 3rd should fail with 409 and лимит message
        response = test_session.post(f"{BASE_URL}/api/reservations", json={
            "property_id": available[2]["id"],
            "reservation_type": "zero_deposit"
        })
        assert response.status_code == 409
        assert "лимит" in response.json().get("detail", "").lower()


# ============== RELEASE RESERVATION TESTS ==============

class TestReleaseReservation:
    """Staff can release reservations, property goes back to 'available'"""
    
    def test_release_sets_property_to_available(self, admin_session, client_session, hd_project_id):
        """POST /api/reservations/{id}/release flips property back to 'available'"""
        # Get an available property
        public_session = get_fresh_session()
        props = public_session.get(f"{BASE_URL}/api/projects/{hd_project_id}/properties").json()
        avail = next((p for p in props if p["status"] == "available" and p["property_type"] == "storage"), None)
        
        if not avail:
            pytest.skip("No available storage for release test")
        
        # Create reservation as client
        res_response = client_session.post(f"{BASE_URL}/api/reservations", json={
            "property_id": avail["id"],
            "reservation_type": "zero_deposit",
            "notes": "TEST_release"
        })
        
        if res_response.status_code != 200:
            pytest.skip("Could not create reservation for release test")
        
        res_id = res_response.json()["id"]
        
        # Release as staff
        release_response = admin_session.post(f"{BASE_URL}/api/reservations/{res_id}/release")
        assert release_response.status_code == 200
        
        # Verify property is available (english key, not Cyrillic)
        prop_response = public_session.get(f"{BASE_URL}/api/properties/{avail['id']}")
        assert prop_response.json()["property"]["status"] == "available"


# ============== DASHBOARD TESTS ==============

class TestAdminDashboard:
    """Admin dashboard KPI with new status keys"""
    
    def test_admin_dashboard_kpi_keys(self, admin_session):
        """GET /api/dashboard/admin returns kpi with required keys"""
        response = admin_session.get(f"{BASE_URL}/api/dashboard/admin")
        assert response.status_code == 200
        
        kpi = response.json()["kpi"]
        required_keys = [
            "total_properties", "free", "reserved_zero", "reserved_deposit",
            "sold", "compensation", "hidden", "active_zero_deposit",
            "expiring_soon", "total_clients", "total_projects", "total_collected"
        ]
        
        for key in required_keys:
            assert key in kpi, f"KPI should have '{key}'"


class TestClientDashboard:
    """Client dashboard returns reservations, installments, documents"""
    
    def test_client_dashboard_structure(self, client_session):
        """GET /api/dashboard/client returns reservations, installments, documents"""
        response = client_session.get(f"{BASE_URL}/api/dashboard/client")
        assert response.status_code == 200
        
        data = response.json()
        assert "reservations" in data
        assert "installments" in data
        assert "documents" in data
        
        # Ivan should have seeded reservation on 202
        assert len(data["reservations"]) >= 1
        
        # Ivan should have 3 installments from seed
        assert len(data["installments"]) == 3


# ============== ROLE ENFORCEMENT TESTS ==============

class TestRoleEnforcement:
    """Role-based access control"""
    
    def test_client_cannot_access_admin_dashboard(self, client_session):
        """Client accessing GET /api/dashboard/admin → 403"""
        response = client_session.get(f"{BASE_URL}/api/dashboard/admin")
        assert response.status_code == 403
    
    def test_client_cannot_access_buyers(self, client_session):
        """Client accessing GET /api/buyers → 403"""
        response = client_session.get(f"{BASE_URL}/api/buyers")
        assert response.status_code == 403


# ============== PROJECT DETAIL TESTS ==============

class TestProjectDetail:
    """Project detail endpoint"""
    
    def test_hd_project_has_nearby_amenities(self, hd_project_id):
        """GET /api/projects/{hd_id} returns nearby_amenities array of 4 items"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects/{hd_project_id}")
        assert response.status_code == 200
        
        project = response.json()["project"]
        amenities = project.get("nearby_amenities", [])
        
        assert len(amenities) == 4, f"Expected 4 nearby_amenities, got {len(amenities)}"
        
        # Verify expected amenities
        labels = [a["label"] for a in amenities]
        assert "Kaufland" in labels
        assert "Парк Герена" in labels
        assert any("95 СУ" in l for l in labels)
        assert any("транспорт" in l.lower() for l in labels)
    
    def test_hd_project_has_buildings_and_updates(self, hd_project_id):
        """GET /api/projects/{hd_id} returns buildings and updates"""
        session = get_fresh_session()
        response = session.get(f"{BASE_URL}/api/projects/{hd_project_id}")
        data = response.json()
        
        assert "buildings" in data
        assert "updates" in data
        assert len(data["buildings"]) >= 1
        assert len(data["updates"]) >= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
