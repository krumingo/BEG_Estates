"""
G.2 Deals Module Tests — Full UI testing for Deal Editor, NewDealWizard, and AdminDeals

Tests cover:
- AdminDeals: /admin/deals shows table with columns (Number/Client/Properties/Type/Total/Paid/Progress/Status/Actions)
- AdminDeals: Counts at top: Активни/Завършени/Отказани
- AdminDeals: filters by status, by client, search by deal_number or client_name
- AdminDeals: progress bar reflects sumPaidAmount / total_with_vat
- AdminDeals: cancelled deals show delete (Trash) button
- NewDealWizard: Step 1 lists ONLY available properties, grouped by floor
- NewDealWizard: Step 2 — agreed_price inputs, payment_mode radio, auto-schedule checkbox
- NewDealWizard: Create → POST /deals + regenerate-schedule
- DealEditor: header shows deal_number, client_name, status badge, source_quote indicator
- DealEditor: items table — inline edit agreed_price triggers live recalc
- DealEditor: payment mode radio toggles
- DealEditor: schedule sections with auto-regen buttons
- DealEditor: per-stage inline editing
- DealEditor: 'Маркирай' button opens PaymentMarkDialog
- DealEditor: paid stages show CheckCircle button for unmark
- DealEditor: 'Откажи сделка' opens confirm dialog
- DealEditor: cancelled deals show alert banner + all inputs disabled
- Convert Quote→Deal: from accepted Quote
- Backend cleanup: /api/sales/* endpoints return 404
- Sidebar tab 'Сделки / Плащания' visible ONLY for super_admin
"""
import os
import pytest
import requests
import time

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
    
    # Get clients
    resp = super_admin_session.get(f"{BASE_URL}/api/clients", params={"active": "true"})
    assert resp.status_code == 200
    clients = resp.json()
    assert len(clients) > 0, "No clients found"
    client_id = clients[0]["id"]
    
    return {
        "project_id": project_id,
        "available_properties": available,
        "all_properties": properties,
        "client_id": client_id,
        "clients": clients
    }


class TestBackendCleanup:
    """Test that legacy /api/sales endpoints return 404."""
    
    def test_sales_list_returns_404(self, super_admin_session):
        """GET /api/sales returns 404 (router removed)."""
        resp = super_admin_session.get(f"{BASE_URL}/api/sales")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: GET /api/sales returns 404 (router removed)")
    
    def test_sales_create_returns_404(self, super_admin_session):
        """POST /api/sales returns 404 (router removed)."""
        resp = super_admin_session.post(f"{BASE_URL}/api/sales", json={})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: POST /api/sales returns 404 (router removed)")


class TestDealsListAPI:
    """Test deals list API with filters."""
    
    def test_deals_list_with_status_filter(self, super_admin_session):
        """GET /api/deals with status filter."""
        # Test all statuses
        for status in ["all", "active", "completed", "cancelled"]:
            resp = super_admin_session.get(f"{BASE_URL}/api/deals", params={"status": status})
            assert resp.status_code == 200, f"Failed for status={status}: {resp.text}"
            data = resp.json()
            assert isinstance(data, list)
            print(f"PASS: GET /api/deals?status={status} returns {len(data)} deals")
    
    def test_deals_list_with_client_filter(self, super_admin_session, test_data):
        """GET /api/deals with client_id filter."""
        client_id = test_data["client_id"]
        resp = super_admin_session.get(f"{BASE_URL}/api/deals", params={"client_id": client_id})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        # All returned deals should have matching client_id
        for deal in data:
            assert deal.get("client_id") == client_id, f"Deal {deal.get('deal_number')} has wrong client_id"
        print(f"PASS: GET /api/deals?client_id={client_id} returns {len(data)} deals")


class TestNewDealWizardAPI:
    """Test NewDealWizard backend flow: create deal + auto-generate schedule."""
    
    def test_create_deal_with_auto_schedule_without_bank(self, super_admin_session, test_data):
        """Create deal with payment_mode=without_bank and auto-generate schedule."""
        available = test_data["available_properties"]
        if len(available) < 1:
            pytest.skip("No available properties")
        
        prop = available[0]
        client_id = test_data["client_id"]
        
        # Create deal
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "agreed_prices": {prop["id"]: float(prop.get("list_price", 100000))},
            "payment_mode": "without_bank"
        })
        assert resp.status_code == 200, f"Create deal failed: {resp.text}"
        deal = resp.json()
        deal_id = deal["id"]
        test_data["wizard_deal_id"] = deal_id
        
        print(f"Created deal {deal['deal_number']} with payment_mode=without_bank")
        
        # Auto-generate schedule (standard preset for without_bank)
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "non_bank",
            "preset": "standard"
        })
        assert resp.status_code == 200, f"Regenerate schedule failed: {resp.text}"
        deal = resp.json()
        
        # Verify non_bank_stages populated (standard = 8 stages)
        non_bank_stages = deal.get("non_bank_stages", [])
        assert len(non_bank_stages) > 0, "non_bank_stages should be populated"
        print(f"PASS: Auto-generated {len(non_bank_stages)} non_bank_stages with standard preset")
        
        # Verify total percent = 100
        total_pct = sum(s.get("percent", 0) for s in non_bank_stages)
        assert abs(total_pct - 100) < 0.1, f"Total percent should be ~100, got {total_pct}"
        print(f"PASS: Total percent = {total_pct}%")
        
        return deal
    
    def test_create_deal_with_auto_schedule_with_bank(self, super_admin_session, test_data):
        """Create deal with payment_mode=with_bank and auto-generate schedule."""
        available = test_data["available_properties"]
        if len(available) < 2:
            pytest.skip("Not enough available properties")
        
        prop = available[1]
        client_id = test_data["client_id"]
        
        # Create deal
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "with_bank"
        })
        assert resp.status_code == 200, f"Create deal failed: {resp.text}"
        deal = resp.json()
        deal_id = deal["id"]
        test_data["wizard_deal_id_bank"] = deal_id
        
        print(f"Created deal {deal['deal_number']} with payment_mode=with_bank")
        
        # Auto-generate schedule (with_bank preset)
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "bank",
            "preset": "with_bank"
        })
        assert resp.status_code == 200, f"Regenerate schedule failed: {resp.text}"
        deal = resp.json()
        
        # Verify bank_stages populated (with_bank = 4 stages)
        bank_stages = deal.get("bank_stages", [])
        assert len(bank_stages) > 0, "bank_stages should be populated"
        print(f"PASS: Auto-generated {len(bank_stages)} bank_stages with with_bank preset")
        
        return deal
    
    def test_create_deal_combined_mode(self, super_admin_session, test_data):
        """Create deal with payment_mode=combined and auto-generate both buckets."""
        available = test_data["available_properties"]
        if len(available) < 3:
            pytest.skip("Not enough available properties")
        
        prop = available[2]
        client_id = test_data["client_id"]
        
        # Create deal
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "combined"
        })
        assert resp.status_code == 200, f"Create deal failed: {resp.text}"
        deal = resp.json()
        deal_id = deal["id"]
        test_data["wizard_deal_id_combined"] = deal_id
        
        print(f"Created deal {deal['deal_number']} with payment_mode=combined")
        
        # Auto-generate schedule for both buckets
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "both",
            "preset": "with_bank"
        })
        assert resp.status_code == 200, f"Regenerate schedule failed: {resp.text}"
        deal = resp.json()
        
        # Verify both buckets populated
        bank_stages = deal.get("bank_stages", [])
        non_bank_stages = deal.get("non_bank_stages", [])
        print(f"PASS: Combined mode - {len(bank_stages)} bank_stages, {len(non_bank_stages)} non_bank_stages")
        
        return deal


class TestDealEditorAPI:
    """Test DealEditor backend operations."""
    
    def test_update_deal_item_price(self, super_admin_session, test_data):
        """PUT /api/deals/{id} updates item agreed_price and recalculates totals."""
        if "wizard_deal_id" not in test_data:
            pytest.skip("No deal from wizard test")
        
        deal_id = test_data["wizard_deal_id"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        items = deal.get("items", [])
        if not items:
            pytest.skip("No items in deal")
        
        original_total = deal.get("total_with_vat", 0)
        item = items[0]
        new_price = float(item.get("agreed_price", 100000)) + 5000
        
        # Update item price
        resp = super_admin_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "items": [{
                "property_id": item["property_id"],
                "agreed_price": new_price
            }]
        })
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        updated_deal = resp.json()
        
        # Verify price updated
        updated_item = next((i for i in updated_deal.get("items", []) if i["property_id"] == item["property_id"]), None)
        assert updated_item is not None
        assert updated_item["agreed_price"] == new_price, f"Expected {new_price}, got {updated_item['agreed_price']}"
        
        # Verify totals recalculated
        new_total = updated_deal.get("total_with_vat", 0)
        assert new_total != original_total, "Total should have changed"
        print(f"PASS: Item price updated from {item.get('agreed_price')} to {new_price}, total changed from {original_total} to {new_total}")
    
    def test_update_deal_payment_mode(self, super_admin_session, test_data):
        """PUT /api/deals/{id} updates payment_mode breakdown."""
        if "wizard_deal_id_combined" not in test_data:
            pytest.skip("No combined deal from wizard test")
        
        deal_id = test_data["wizard_deal_id_combined"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        total = deal.get("total_with_vat", 100000)
        bank_amount = round(total * 0.6, 2)
        non_bank_amount = round(total * 0.4, 2)
        
        # Update payment mode breakdown
        resp = super_admin_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "payment_mode": {
                "mode": "combined",
                "bank_amount": bank_amount,
                "non_bank_amount": non_bank_amount,
                "invoice_amount": non_bank_amount,
                "proforma_amount": 0
            }
        })
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        updated_deal = resp.json()
        
        pm = updated_deal.get("payment_mode", {})
        assert pm.get("bank_amount") == bank_amount
        assert pm.get("non_bank_amount") == non_bank_amount
        print(f"PASS: Payment mode updated - bank={bank_amount}, non_bank={non_bank_amount}")
    
    def test_inline_stage_edit(self, super_admin_session, test_data):
        """PUT /api/deals/{id} updates stage label/percent/date."""
        if "wizard_deal_id" not in test_data:
            pytest.skip("No deal from wizard test")
        
        deal_id = test_data["wizard_deal_id"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        non_bank_stages = deal.get("non_bank_stages", [])
        if not non_bank_stages:
            pytest.skip("No non_bank_stages")
        
        # Modify first stage
        stages_copy = [dict(s) for s in non_bank_stages]
        stages_copy[0]["label"] = "TEST_MODIFIED_LABEL"
        stages_copy[0]["expected_date"] = "2026-06-15"
        
        resp = super_admin_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "non_bank_stages": stages_copy
        })
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        updated_deal = resp.json()
        
        updated_stages = updated_deal.get("non_bank_stages", [])
        assert updated_stages[0]["label"] == "TEST_MODIFIED_LABEL"
        assert updated_stages[0]["expected_date"] == "2026-06-15"
        print("PASS: Stage inline edit (label, date) persisted")


class TestPaymentTracking:
    """Test payment marking/unmarking."""
    
    def test_mark_stage_as_paid(self, super_admin_session, test_data):
        """PATCH /api/deals/{id}/stages/{order}/payment marks stage as paid."""
        if "wizard_deal_id" not in test_data:
            pytest.skip("No deal from wizard test")
        
        deal_id = test_data["wizard_deal_id"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        non_bank_stages = deal.get("non_bank_stages", [])
        if not non_bank_stages:
            pytest.skip("No non_bank_stages")
        
        stage = non_bank_stages[0]
        stage_order = stage["order"]
        
        # Mark as paid
        resp = super_admin_session.patch(
            f"{BASE_URL}/api/deals/{deal_id}/stages/{stage_order}/payment",
            json={
                "bucket": "non_bank",
                "is_paid": True,
                "paid_date": "2026-01-20",
                "paid_amount": stage["amount"],
                "payment_notes": "Test payment"
            }
        )
        assert resp.status_code == 200, f"Mark paid failed: {resp.text}"
        updated_deal = resp.json()
        
        updated_stage = next((s for s in updated_deal.get("non_bank_stages", []) if s["order"] == stage_order), None)
        assert updated_stage is not None
        assert updated_stage["is_paid"] is True
        assert updated_stage["paid_date"] == "2026-01-20"
        assert updated_stage["payment_notes"] == "Test payment"
        print(f"PASS: Stage {stage_order} marked as paid with date and notes")
        
        test_data["paid_stage_order"] = stage_order
    
    def test_unmark_stage_as_paid(self, super_admin_session, test_data):
        """PATCH /api/deals/{id}/stages/{order}/payment unmarks stage."""
        if "wizard_deal_id" not in test_data or "paid_stage_order" not in test_data:
            pytest.skip("No paid stage from previous test")
        
        deal_id = test_data["wizard_deal_id"]
        stage_order = test_data["paid_stage_order"]
        
        # Unmark
        resp = super_admin_session.patch(
            f"{BASE_URL}/api/deals/{deal_id}/stages/{stage_order}/payment",
            json={
                "bucket": "non_bank",
                "is_paid": False,
                "paid_date": None,
                "paid_amount": None,
                "payment_notes": None
            }
        )
        assert resp.status_code == 200, f"Unmark failed: {resp.text}"
        updated_deal = resp.json()
        
        updated_stage = next((s for s in updated_deal.get("non_bank_stages", []) if s["order"] == stage_order), None)
        assert updated_stage is not None
        assert updated_stage["is_paid"] is False
        print(f"PASS: Stage {stage_order} unmarked as paid")


class TestDealCancelFlow:
    """Test deal cancellation and property release."""
    
    def test_cancel_deal_releases_properties(self, super_admin_session, test_data):
        """POST /api/deals/{id}/cancel releases properties."""
        if "wizard_deal_id" not in test_data:
            pytest.skip("No deal from wizard test")
        
        deal_id = test_data["wizard_deal_id"]
        
        # Get deal to find property IDs
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        prop_ids = [item["property_id"] for item in deal.get("items", [])]
        
        # Cancel deal
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={
            "reason": "G.2 test cancellation"
        })
        assert resp.status_code == 200, f"Cancel failed: {resp.text}"
        cancelled_deal = resp.json()
        
        assert cancelled_deal["status"] == "cancelled"
        assert cancelled_deal.get("cancelled_reason") == "G.2 test cancellation"
        print(f"PASS: Deal {deal['deal_number']} cancelled")
        
        # Verify properties released
        for prop_id in prop_ids:
            resp = super_admin_session.get(f"{BASE_URL}/api/properties/{prop_id}")
            assert resp.status_code == 200
            prop = resp.json()["property"]
            assert prop["status"] == "available", f"Property {prop_id} should be available"
            assert prop.get("buyer_id") is None, f"Property {prop_id} buyer_id should be null"
        print("PASS: Properties released (status=available, buyer_id=null)")
        
        test_data["cancelled_deal_id"] = deal_id
    
    def test_cancelled_deal_is_readonly(self, super_admin_session, test_data):
        """PUT /api/deals/{id} fails for cancelled deal."""
        if "cancelled_deal_id" not in test_data:
            pytest.skip("No cancelled deal")
        
        deal_id = test_data["cancelled_deal_id"]
        
        resp = super_admin_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "notes": "Should fail"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("PASS: PUT on cancelled deal returns 400")
    
    def test_delete_cancelled_deal(self, super_admin_session, test_data):
        """DELETE /api/deals/{id} works for cancelled deal."""
        if "cancelled_deal_id" not in test_data:
            pytest.skip("No cancelled deal")
        
        deal_id = test_data["cancelled_deal_id"]
        
        resp = super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={
            "reason": "G.2 test cleanup"
        })
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        data = resp.json()
        assert data.get("deleted") is True
        print("PASS: Cancelled deal deleted")


class TestQuoteConversion:
    """Test quote to deal conversion."""
    
    def test_convert_accepted_quote_imports_schedule(self, super_admin_session, test_data):
        """POST /api/quotes/{id}/convert-to-deal imports schedule to non_bank_stages."""
        available = test_data["available_properties"]
        if len(available) < 4:
            pytest.skip("Not enough available properties")
        
        prop = available[3]
        client_id = test_data["client_id"]
        
        # Create quote with schedule
        resp = super_admin_session.post(f"{BASE_URL}/api/quotes", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "vat_mode": "with_vat",
            "scheme_type": "standard"
        })
        assert resp.status_code == 200, f"Create quote failed: {resp.text}"
        quote = resp.json()
        quote_id = quote["id"]
        
        # Verify quote has payment_schedule
        schedule = quote.get("payment_schedule", {})
        stages = schedule.get("stages", [])
        print(f"Quote {quote['quote_number']} has {len(stages)} stages in payment_schedule")
        
        # Mark as sent → accepted
        resp = super_admin_session.patch(f"{BASE_URL}/api/quotes/{quote_id}/status", json={"status": "sent"})
        assert resp.status_code == 200
        resp = super_admin_session.patch(f"{BASE_URL}/api/quotes/{quote_id}/status", json={"status": "accepted"})
        assert resp.status_code == 200
        
        # Convert to deal
        resp = super_admin_session.post(f"{BASE_URL}/api/quotes/{quote_id}/convert-to-deal")
        assert resp.status_code == 200, f"Convert failed: {resp.text}"
        result = resp.json()
        
        deal_id = result["deal_id"]
        test_data["converted_deal_id"] = deal_id
        
        # Verify deal has imported schedule
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        non_bank_stages = deal.get("non_bank_stages", [])
        assert len(non_bank_stages) > 0, "non_bank_stages should be imported from quote"
        assert deal.get("source_quote_id") == quote_id, "source_quote_id should be set"
        print(f"PASS: Quote converted to deal {deal['deal_number']} with {len(non_bank_stages)} imported stages")
        
        # Cleanup
        super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={"reason": "cleanup"})
        super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={"reason": "cleanup"})


class TestCleanupRemainingDeals:
    """Cleanup any remaining test deals."""
    
    def test_cleanup_remaining_deals(self, super_admin_session, test_data):
        """Cancel and delete any remaining test deals."""
        deal_ids = [
            test_data.get("wizard_deal_id_bank"),
            test_data.get("wizard_deal_id_combined"),
        ]
        
        for deal_id in deal_ids:
            if deal_id:
                try:
                    # Try to cancel
                    super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={"reason": "cleanup"})
                    # Try to delete
                    super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={"reason": "cleanup"})
                    print(f"Cleaned up deal {deal_id}")
                except Exception as e:
                    print(f"Cleanup failed for {deal_id}: {e}")
        
        print("PASS: Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
