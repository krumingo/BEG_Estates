"""
G.1 Deals Module Tests — per-client multi-property sale records (super_admin only)

Tests cover:
- GET /api/deals — list (super_admin only). Anonymous → 401, sales role → 403
- POST /api/deals — create deal with multi-property, validates client+properties, marks props sold + sets buyer_id
- POST /api/deals fails with 400 when property already sold or in active deal
- POST /api/deals/{id}/cancel — releases properties (status=available, buyer_id=null)
- POST /api/deals/{id}/regenerate-schedule with bucket=both, preset=with_bank — populates bank_stages
- PATCH /api/deals/{id}/stages/{order}/payment with bucket=bank|non_bank — toggles is_paid
- DELETE /api/deals/{id} — only allowed for cancelled deals; otherwise 400
- POST /api/quotes/{id}/convert-to-deal — only for status=accepted; creates deal + imports schedule into non_bank_stages
- PUT /api/admin/projects/{id} — super_admin only; persists expense_estimate + total_rzp_area
- All deals endpoints reject non-super_admin staff (sales role) with 403
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

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
    """Login as sales (non-super_admin) and return session with cookies."""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/staff/login", json={
        "email": SALES_EMAIL,
        "password": SALES_PASSWORD
    })
    assert resp.status_code == 200, f"Sales login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def test_data(super_admin_session):
    """Get test data: project_id, available properties, client_id."""
    # Get projects
    resp = super_admin_session.get(f"{BASE_URL}/api/projects")
    assert resp.status_code == 200
    projects = resp.json()
    assert len(projects) > 0, "No projects found"
    project_id = projects[0]["id"]
    
    # Get properties
    resp = super_admin_session.get(f"{BASE_URL}/api/projects/{project_id}/properties")
    assert resp.status_code == 200
    properties = resp.json()
    available = [p for p in properties if p.get("status") == "available"]
    assert len(available) >= 3, f"Need at least 3 available properties, found {len(available)}"
    
    # Get clients
    resp = super_admin_session.get(f"{BASE_URL}/api/clients", params={"active": "true"})
    assert resp.status_code == 200
    clients = resp.json()
    assert len(clients) > 0, "No clients found"
    client_id = clients[0]["id"]
    
    return {
        "project_id": project_id,
        "available_properties": available,
        "client_id": client_id,
        "clients": clients
    }


class TestDealsAccessControl:
    """Test access control for deals endpoints."""
    
    def test_deals_list_anonymous_returns_401(self):
        """Anonymous user cannot access deals list."""
        resp = requests.get(f"{BASE_URL}/api/deals")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: Anonymous GET /api/deals returns 401")
    
    def test_deals_list_sales_returns_403(self, sales_session):
        """Sales role (non-super_admin) cannot access deals list."""
        resp = sales_session.get(f"{BASE_URL}/api/deals")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Sales GET /api/deals returns 403")
    
    def test_deals_create_sales_returns_403(self, sales_session, test_data):
        """Sales role cannot create deals."""
        resp = sales_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": test_data["client_id"],
            "property_ids": [test_data["available_properties"][0]["id"]],
            "payment_mode": "without_bank"
        })
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Sales POST /api/deals returns 403")
    
    def test_deals_list_super_admin_returns_200(self, super_admin_session):
        """Super admin can access deals list."""
        resp = super_admin_session.get(f"{BASE_URL}/api/deals", params={"status": "all"})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASS: Super admin GET /api/deals returns 200 with {len(data)} deals")


class TestDealsCRUD:
    """Test deals CRUD operations."""
    
    def test_create_deal_multi_property(self, super_admin_session, test_data):
        """Create deal with multiple properties, verify properties marked as sold."""
        # Use 2 available properties
        prop1 = test_data["available_properties"][0]
        prop2 = test_data["available_properties"][1]
        client_id = test_data["client_id"]
        
        # Create deal
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop1["id"], prop2["id"]],
            "payment_mode": "without_bank"
        })
        assert resp.status_code == 200, f"Create deal failed: {resp.text}"
        deal = resp.json()
        
        # Verify deal structure
        assert "id" in deal
        assert "deal_number" in deal
        assert deal["deal_number"].startswith("D-2026-"), f"Deal number format wrong: {deal['deal_number']}"
        assert deal["client_id"] == client_id
        assert len(deal["items"]) == 2
        assert deal["status"] == "active"
        assert deal["total_with_vat"] > 0
        print(f"PASS: Created deal {deal['deal_number']} with 2 properties, total={deal['total_with_vat']}")
        
        # Verify properties are now sold
        for prop_id in [prop1["id"], prop2["id"]]:
            resp = super_admin_session.get(f"{BASE_URL}/api/properties/{prop_id}")
            assert resp.status_code == 200
            prop_data = resp.json()["property"]
            assert prop_data["status"] == "sold", f"Property {prop_id} should be sold"
            assert prop_data["buyer_id"] == client_id, f"Property {prop_id} buyer_id should be {client_id}"
        print("PASS: Properties marked as sold with buyer_id set")
        
        # Store deal_id for cleanup
        test_data["created_deal_id"] = deal["id"]
        test_data["created_deal_props"] = [prop1["id"], prop2["id"]]
        return deal
    
    def test_create_deal_fails_for_sold_property(self, super_admin_session, test_data):
        """Cannot create deal with already sold property."""
        if "created_deal_props" not in test_data:
            pytest.skip("No deal created in previous test")
        
        sold_prop_id = test_data["created_deal_props"][0]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [sold_prop_id],
            "payment_mode": "without_bank"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("PASS: POST /api/deals with sold property returns 400")
    
    def test_cancel_deal_releases_properties(self, super_admin_session, test_data):
        """Cancel deal releases properties (status=available, buyer_id=null)."""
        if "created_deal_id" not in test_data:
            pytest.skip("No deal created in previous test")
        
        deal_id = test_data["created_deal_id"]
        prop_ids = test_data["created_deal_props"]
        
        # Cancel deal
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={
            "reason": "Test cancellation"
        })
        assert resp.status_code == 200, f"Cancel failed: {resp.text}"
        deal = resp.json()
        assert deal["status"] == "cancelled"
        print(f"PASS: Deal {deal['deal_number']} cancelled")
        
        # Verify properties released
        for prop_id in prop_ids:
            resp = super_admin_session.get(f"{BASE_URL}/api/properties/{prop_id}")
            assert resp.status_code == 200
            prop_data = resp.json()["property"]
            assert prop_data["status"] == "available", f"Property {prop_id} should be available"
            assert prop_data.get("buyer_id") is None, f"Property {prop_id} buyer_id should be null"
        print("PASS: Properties released (status=available, buyer_id=null)")
        
        test_data["cancelled_deal_id"] = deal_id
    
    def test_delete_deal_only_cancelled(self, super_admin_session, test_data):
        """DELETE only allowed for cancelled deals."""
        if "cancelled_deal_id" not in test_data:
            pytest.skip("No cancelled deal from previous test")
        
        deal_id = test_data["cancelled_deal_id"]
        
        # Delete cancelled deal should work
        resp = super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={
            "reason": "Test deletion"
        })
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        data = resp.json()
        assert data.get("deleted") is True
        print("PASS: DELETE cancelled deal returns 200")
    
    def test_delete_active_deal_fails(self, super_admin_session, test_data):
        """Cannot delete active deal."""
        # Create a new deal
        prop = test_data["available_properties"][2]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "without_bank"
        })
        assert resp.status_code == 200
        deal = resp.json()
        deal_id = deal["id"]
        
        # Try to delete active deal
        resp = super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={
            "reason": "Test deletion"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("PASS: DELETE active deal returns 400")
        
        # Cleanup: cancel and delete
        super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={"reason": "cleanup"})
        super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={"reason": "cleanup"})


class TestDealsSchedule:
    """Test deals schedule regeneration and payment tracking."""
    
    def test_regenerate_schedule_with_bank(self, super_admin_session, test_data):
        """Regenerate schedule with bucket=both, preset=with_bank populates bank_stages."""
        # Create a new deal
        prop = test_data["available_properties"][0]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "with_bank"
        })
        assert resp.status_code == 200
        deal = resp.json()
        deal_id = deal["id"]
        test_data["schedule_test_deal_id"] = deal_id
        
        # Regenerate schedule
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "both",
            "preset": "with_bank"
        })
        assert resp.status_code == 200, f"Regenerate failed: {resp.text}"
        deal = resp.json()
        
        # Verify bank_stages populated
        bank_stages = deal.get("bank_stages", [])
        non_bank_stages = deal.get("non_bank_stages", [])
        assert len(bank_stages) > 0, "bank_stages should be populated"
        print(f"PASS: Regenerate schedule created {len(bank_stages)} bank_stages, {len(non_bank_stages)} non_bank_stages")
        
        # Verify stage structure
        for stage in bank_stages:
            assert "order" in stage
            assert "label" in stage
            assert "percent" in stage
            assert "amount" in stage
            assert stage.get("bucket") == "bank"
            assert stage.get("is_paid") is False
        print("PASS: Bank stages have correct structure")
        
        return deal
    
    def test_patch_stage_payment(self, super_admin_session, test_data):
        """PATCH stage payment toggles is_paid."""
        if "schedule_test_deal_id" not in test_data:
            pytest.skip("No deal from previous test")
        
        deal_id = test_data["schedule_test_deal_id"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        # Find first bank stage
        bank_stages = deal.get("bank_stages", [])
        if not bank_stages:
            pytest.skip("No bank stages to test")
        
        stage_order = bank_stages[0]["order"]
        
        # Mark as paid
        resp = super_admin_session.patch(
            f"{BASE_URL}/api/deals/{deal_id}/stages/{stage_order}/payment",
            json={
                "bucket": "bank",
                "is_paid": True,
                "paid_date": "2026-01-15",
                "paid_amount": bank_stages[0]["amount"]
            }
        )
        assert resp.status_code == 200, f"Patch failed: {resp.text}"
        deal = resp.json()
        
        # Verify stage is now paid
        updated_stage = next((s for s in deal.get("bank_stages", []) if s["order"] == stage_order), None)
        assert updated_stage is not None
        assert updated_stage["is_paid"] is True
        assert updated_stage["paid_date"] == "2026-01-15"
        print(f"PASS: Stage {stage_order} marked as paid")
        
        # Cleanup
        super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={"reason": "cleanup"})
        super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={"reason": "cleanup"})


class TestQuoteConversion:
    """Test quote to deal conversion."""
    
    def test_convert_accepted_quote_to_deal(self, super_admin_session, test_data):
        """Convert accepted quote creates deal with imported schedule."""
        # Get available property
        resp = super_admin_session.get(f"{BASE_URL}/api/projects/{test_data['project_id']}/properties")
        properties = resp.json()
        available = [p for p in properties if p.get("status") == "available"]
        if not available:
            pytest.skip("No available properties for quote")
        
        prop = available[0]
        client_id = test_data["client_id"]
        
        # Create quote
        resp = super_admin_session.post(f"{BASE_URL}/api/quotes", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "vat_mode": "with_vat",
            "scheme_type": "standard"
        })
        assert resp.status_code == 200, f"Create quote failed: {resp.text}"
        quote = resp.json()
        quote_id = quote["id"]
        print(f"Created quote {quote['quote_number']}")
        
        # Mark as sent
        resp = super_admin_session.patch(f"{BASE_URL}/api/quotes/{quote_id}/status", json={"status": "sent"})
        assert resp.status_code == 200
        
        # Mark as accepted
        resp = super_admin_session.patch(f"{BASE_URL}/api/quotes/{quote_id}/status", json={"status": "accepted"})
        assert resp.status_code == 200
        print("Quote marked as accepted")
        
        # Convert to deal
        resp = super_admin_session.post(f"{BASE_URL}/api/quotes/{quote_id}/convert-to-deal")
        assert resp.status_code == 200, f"Convert failed: {resp.text}"
        result = resp.json()
        
        assert "deal_id" in result
        assert "deal_number" in result
        assert result["deal_number"].startswith("D-2026-")
        print(f"PASS: Quote converted to deal {result['deal_number']}")
        
        # Verify deal has imported schedule
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{result['deal_id']}")
        assert resp.status_code == 200
        deal = resp.json()
        
        non_bank_stages = deal.get("non_bank_stages", [])
        assert len(non_bank_stages) > 0, "non_bank_stages should be imported from quote"
        print(f"PASS: Deal has {len(non_bank_stages)} non_bank_stages imported from quote")
        
        # Cleanup
        super_admin_session.post(f"{BASE_URL}/api/deals/{result['deal_id']}/cancel", json={"reason": "cleanup"})
        super_admin_session.delete(f"{BASE_URL}/api/deals/{result['deal_id']}", json={"reason": "cleanup"})
    
    def test_convert_draft_quote_fails(self, super_admin_session, test_data):
        """Cannot convert draft quote to deal."""
        # Get available property
        resp = super_admin_session.get(f"{BASE_URL}/api/projects/{test_data['project_id']}/properties")
        properties = resp.json()
        available = [p for p in properties if p.get("status") == "available"]
        if not available:
            pytest.skip("No available properties for quote")
        
        prop = available[0]
        client_id = test_data["client_id"]
        
        # Create draft quote
        resp = super_admin_session.post(f"{BASE_URL}/api/quotes", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "vat_mode": "with_vat"
        })
        assert resp.status_code == 200
        quote = resp.json()
        quote_id = quote["id"]
        
        # Try to convert draft
        resp = super_admin_session.post(f"{BASE_URL}/api/quotes/{quote_id}/convert-to-deal")
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("PASS: Convert draft quote returns 400")
        
        # Cleanup
        super_admin_session.delete(f"{BASE_URL}/api/quotes/{quote_id}")


class TestProjectAdminUpdate:
    """Test PUT /api/admin/projects/{id} for super_admin."""
    
    def test_admin_update_project_expense_estimate(self, super_admin_session, test_data):
        """Super admin can update expense_estimate and total_rzp_area."""
        project_id = test_data["project_id"]
        
        resp = super_admin_session.put(f"{BASE_URL}/api/admin/projects/{project_id}", json={
            "expense_estimate": {
                "total": 1500000,
                "foundation": 200000,
                "rough_construction": 800000,
                "finishing": 500000,
                "notes": "Test estimate"
            },
            "total_rzp_area": 2500.5
        })
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        project = resp.json()
        
        # Verify persisted
        assert project.get("expense_estimate") is not None
        assert project["expense_estimate"]["total"] == 1500000
        assert project.get("total_rzp_area") == 2500.5
        print("PASS: expense_estimate and total_rzp_area persisted")
        
        # Verify via GET
        resp = super_admin_session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["project"].get("expense_estimate", {}).get("total") == 1500000
        print("PASS: GET confirms expense_estimate persisted")
    
    def test_admin_update_project_sales_forbidden(self, sales_session, test_data):
        """Sales role cannot use PUT /api/admin/projects."""
        project_id = test_data["project_id"]
        
        resp = sales_session.put(f"{BASE_URL}/api/admin/projects/{project_id}", json={
            "total_rzp_area": 9999
        })
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Sales PUT /api/admin/projects returns 403")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
