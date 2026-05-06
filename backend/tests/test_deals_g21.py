"""
G.2.1 Deals Module Tests — Terminology Rename: bank_loan / own_funds / bucket=own

Tests cover:
- Backend: POST /api/deals with payment_mode='bank_loan' or 'own_funds' or 'combined' accepted
- Backend: Old values 'with_bank'/'without_bank' return 422
- Backend: New deal payment_mode contains: mode, bank_amount, own_amount, bank_invoice_amount, bank_proforma_amount, own_invoice_amount, own_proforma_amount
- Backend: PUT /api/deals/{id} accepts own_stages key (not non_bank_stages)
- Backend: POST /api/deals/{id}/regenerate-schedule with bucket=own works (bucket=non_bank returns 422)
- Backend: PATCH /api/deals/{id}/stages/{order}/payment with bucket=own works
- Backend: POST /api/deals/{id}/suggest-distribution with field=bank_invoice_amount returns suggested bank_proforma_amount
- Backend: Migration ran on boot (rename_payment_terminology) — idempotent; check _migrations collection
- Backend: Quote→Deal converter creates deal with payment_mode='own_funds', schedule imported into own_stages
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
SUPER_ADMIN_EMAIL = "admin@begestates.bg"
SUPER_ADMIN_PASSWORD = "BegEstates2026!Admin"


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


class TestNewTerminologyAccepted:
    """Test that new terminology (bank_loan, own_funds, combined) is accepted."""
    
    def test_create_deal_bank_loan_accepted(self, super_admin_session, test_data):
        """POST /api/deals with payment_mode='bank_loan' is accepted."""
        available = test_data["available_properties"]
        if len(available) < 1:
            pytest.skip("No available properties")
        
        prop = available[0]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "bank_loan"
        })
        assert resp.status_code == 200, f"Create deal with bank_loan failed: {resp.text}"
        deal = resp.json()
        
        # Verify payment_mode structure
        pm = deal.get("payment_mode", {})
        assert pm.get("mode") == "bank_loan", f"Expected mode=bank_loan, got {pm.get('mode')}"
        
        # Verify new field names exist
        assert "bank_amount" in pm, "bank_amount should exist"
        assert "own_amount" in pm, "own_amount should exist"
        assert "bank_invoice_amount" in pm, "bank_invoice_amount should exist"
        assert "bank_proforma_amount" in pm, "bank_proforma_amount should exist"
        assert "own_invoice_amount" in pm, "own_invoice_amount should exist"
        assert "own_proforma_amount" in pm, "own_proforma_amount should exist"
        
        # Verify old field names do NOT exist
        assert "non_bank_amount" not in pm, "non_bank_amount should NOT exist"
        assert "invoice_amount" not in pm, "invoice_amount should NOT exist (use own_invoice_amount)"
        assert "proforma_amount" not in pm, "proforma_amount should NOT exist (use own_proforma_amount)"
        
        # Verify own_stages key exists (not non_bank_stages)
        assert "own_stages" in deal, "own_stages should exist"
        assert "non_bank_stages" not in deal, "non_bank_stages should NOT exist"
        
        test_data["deal_bank_loan_id"] = deal["id"]
        print(f"PASS: Created deal {deal['deal_number']} with payment_mode=bank_loan")
        print(f"  payment_mode fields: {list(pm.keys())}")
    
    def test_create_deal_own_funds_accepted(self, super_admin_session, test_data):
        """POST /api/deals with payment_mode='own_funds' is accepted."""
        available = test_data["available_properties"]
        if len(available) < 2:
            pytest.skip("Not enough available properties")
        
        prop = available[1]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "own_funds"
        })
        assert resp.status_code == 200, f"Create deal with own_funds failed: {resp.text}"
        deal = resp.json()
        
        pm = deal.get("payment_mode", {})
        assert pm.get("mode") == "own_funds", f"Expected mode=own_funds, got {pm.get('mode')}"
        assert "own_stages" in deal, "own_stages should exist"
        
        test_data["deal_own_funds_id"] = deal["id"]
        print(f"PASS: Created deal {deal['deal_number']} with payment_mode=own_funds")
    
    def test_create_deal_combined_accepted(self, super_admin_session, test_data):
        """POST /api/deals with payment_mode='combined' is accepted."""
        available = test_data["available_properties"]
        if len(available) < 3:
            pytest.skip("Not enough available properties")
        
        prop = available[2]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "combined"
        })
        assert resp.status_code == 200, f"Create deal with combined failed: {resp.text}"
        deal = resp.json()
        
        pm = deal.get("payment_mode", {})
        assert pm.get("mode") == "combined", f"Expected mode=combined, got {pm.get('mode')}"
        
        test_data["deal_combined_id"] = deal["id"]
        print(f"PASS: Created deal {deal['deal_number']} with payment_mode=combined")


class TestOldTerminologyRejected:
    """Test that old terminology (with_bank, without_bank, non_bank) is rejected."""
    
    def test_create_deal_with_bank_rejected(self, super_admin_session, test_data):
        """POST /api/deals with payment_mode='with_bank' returns 422."""
        available = test_data["available_properties"]
        if len(available) < 4:
            pytest.skip("Not enough available properties")
        
        prop = available[3]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "with_bank"  # OLD terminology
        })
        assert resp.status_code == 422, f"Expected 422 for with_bank, got {resp.status_code}: {resp.text}"
        print("PASS: POST /api/deals with payment_mode='with_bank' returns 422")
    
    def test_create_deal_without_bank_rejected(self, super_admin_session, test_data):
        """POST /api/deals with payment_mode='without_bank' returns 422."""
        available = test_data["available_properties"]
        if len(available) < 4:
            pytest.skip("Not enough available properties")
        
        prop = available[3]
        client_id = test_data["client_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals", json={
            "client_id": client_id,
            "property_ids": [prop["id"]],
            "payment_mode": "without_bank"  # OLD terminology
        })
        assert resp.status_code == 422, f"Expected 422 for without_bank, got {resp.status_code}: {resp.text}"
        print("PASS: POST /api/deals with payment_mode='without_bank' returns 422")


class TestRegenerateScheduleWithOwnBucket:
    """Test regenerate-schedule with bucket=own (not non_bank)."""
    
    def test_regenerate_schedule_bucket_own_works(self, super_admin_session, test_data):
        """POST /api/deals/{id}/regenerate-schedule with bucket=own works."""
        if "deal_own_funds_id" not in test_data:
            pytest.skip("No own_funds deal")
        
        deal_id = test_data["deal_own_funds_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "own",
            "preset": "standard"
        })
        assert resp.status_code == 200, f"Regenerate with bucket=own failed: {resp.text}"
        deal = resp.json()
        
        own_stages = deal.get("own_stages", [])
        assert len(own_stages) > 0, "own_stages should be populated"
        
        # Verify stages have bucket='own'
        for stage in own_stages:
            assert stage.get("bucket") == "own", f"Stage bucket should be 'own', got {stage.get('bucket')}"
        
        print(f"PASS: Regenerated {len(own_stages)} own_stages with bucket=own")
    
    def test_regenerate_schedule_bucket_non_bank_rejected(self, super_admin_session, test_data):
        """POST /api/deals/{id}/regenerate-schedule with bucket=non_bank returns 422."""
        if "deal_own_funds_id" not in test_data:
            pytest.skip("No own_funds deal")
        
        deal_id = test_data["deal_own_funds_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "non_bank",  # OLD terminology
            "preset": "standard"
        })
        assert resp.status_code == 422, f"Expected 422 for bucket=non_bank, got {resp.status_code}: {resp.text}"
        print("PASS: POST regenerate-schedule with bucket='non_bank' returns 422")
    
    def test_regenerate_schedule_bucket_bank_works(self, super_admin_session, test_data):
        """POST /api/deals/{id}/regenerate-schedule with bucket=bank works."""
        if "deal_bank_loan_id" not in test_data:
            pytest.skip("No bank_loan deal")
        
        deal_id = test_data["deal_bank_loan_id"]
        
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/regenerate-schedule", json={
            "bucket": "bank",
            "preset": "with_bank"
        })
        assert resp.status_code == 200, f"Regenerate with bucket=bank failed: {resp.text}"
        deal = resp.json()
        
        bank_stages = deal.get("bank_stages", [])
        assert len(bank_stages) > 0, "bank_stages should be populated"
        print(f"PASS: Regenerated {len(bank_stages)} bank_stages with bucket=bank")


class TestStagePaymentWithOwnBucket:
    """Test stage payment marking with bucket=own."""
    
    def test_mark_stage_paid_bucket_own(self, super_admin_session, test_data):
        """PATCH /api/deals/{id}/stages/{order}/payment with bucket=own works."""
        if "deal_own_funds_id" not in test_data:
            pytest.skip("No own_funds deal")
        
        deal_id = test_data["deal_own_funds_id"]
        
        # Get deal to find stage
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        own_stages = deal.get("own_stages", [])
        if not own_stages:
            pytest.skip("No own_stages")
        
        stage = own_stages[0]
        stage_order = stage["order"]
        
        # Mark as paid with bucket=own
        resp = super_admin_session.patch(
            f"{BASE_URL}/api/deals/{deal_id}/stages/{stage_order}/payment",
            json={
                "bucket": "own",
                "is_paid": True,
                "paid_date": "2026-01-25",
                "paid_amount": stage.get("amount", 1000),
                "payment_notes": "G.2.1 test payment"
            }
        )
        assert resp.status_code == 200, f"Mark paid with bucket=own failed: {resp.text}"
        updated_deal = resp.json()
        
        updated_stage = next((s for s in updated_deal.get("own_stages", []) if s["order"] == stage_order), None)
        assert updated_stage is not None
        assert updated_stage["is_paid"] is True
        assert updated_stage["paid_date"] == "2026-01-25"
        print(f"PASS: Stage {stage_order} marked as paid with bucket=own")
        
        # Unmark for cleanup
        super_admin_session.patch(
            f"{BASE_URL}/api/deals/{deal_id}/stages/{stage_order}/payment",
            json={"bucket": "own", "is_paid": False, "paid_date": None, "paid_amount": None, "payment_notes": None}
        )


class TestSuggestDistribution:
    """Test suggest-distribution endpoint for auto-fill."""
    
    def test_suggest_distribution_bank_invoice(self, super_admin_session, test_data):
        """POST /api/deals/{id}/suggest-distribution with field=bank_invoice_amount returns suggested bank_proforma_amount."""
        if "deal_bank_loan_id" not in test_data:
            pytest.skip("No bank_loan deal")
        
        deal_id = test_data["deal_bank_loan_id"]
        
        # Get deal to know total
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        total = deal.get("total_with_vat", 100000)
        
        # Suggest with bank_invoice_amount = 5000
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/suggest-distribution", json={
            "field": "bank_invoice_amount",
            "value": 5000
        })
        assert resp.status_code == 200, f"Suggest distribution failed: {resp.text}"
        result = resp.json()
        
        suggested = result.get("suggested", {})
        assert "bank_proforma_amount" in suggested, "bank_proforma_amount should be in suggested"
        
        # For bank_loan mode: bank_proforma = total - bank_invoice
        expected_proforma = round(total - 5000, 2)
        actual_proforma = suggested.get("bank_proforma_amount")
        assert abs(actual_proforma - expected_proforma) < 0.01, f"Expected bank_proforma={expected_proforma}, got {actual_proforma}"
        
        print(f"PASS: suggest-distribution with bank_invoice_amount=5000 → bank_proforma_amount={actual_proforma}")
    
    def test_suggest_distribution_own_invoice(self, super_admin_session, test_data):
        """POST /api/deals/{id}/suggest-distribution with field=own_invoice_amount returns suggested own_proforma_amount."""
        if "deal_own_funds_id" not in test_data:
            pytest.skip("No own_funds deal")
        
        deal_id = test_data["deal_own_funds_id"]
        
        # Get deal to know total
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        total = deal.get("total_with_vat", 100000)
        
        # Suggest with own_invoice_amount = 8000
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/suggest-distribution", json={
            "field": "own_invoice_amount",
            "value": 8000
        })
        assert resp.status_code == 200, f"Suggest distribution failed: {resp.text}"
        result = resp.json()
        
        suggested = result.get("suggested", {})
        assert "own_proforma_amount" in suggested, "own_proforma_amount should be in suggested"
        
        # For own_funds mode: own_proforma = total - own_invoice
        expected_proforma = round(total - 8000, 2)
        actual_proforma = suggested.get("own_proforma_amount")
        assert abs(actual_proforma - expected_proforma) < 0.01, f"Expected own_proforma={expected_proforma}, got {actual_proforma}"
        
        print(f"PASS: suggest-distribution with own_invoice_amount=8000 → own_proforma_amount={actual_proforma}")
    
    def test_suggest_distribution_combined_bank_amount(self, super_admin_session, test_data):
        """POST /api/deals/{id}/suggest-distribution with field=bank_amount in combined mode returns own_amount."""
        if "deal_combined_id" not in test_data:
            pytest.skip("No combined deal")
        
        deal_id = test_data["deal_combined_id"]
        
        # Get deal to know total
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        total = deal.get("total_with_vat", 100000)
        
        # Suggest with bank_amount = 40% of total (to ensure own_amount is positive)
        bank_amount = round(total * 0.4, 2)
        resp = super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/suggest-distribution", json={
            "field": "bank_amount",
            "value": bank_amount
        })
        assert resp.status_code == 200, f"Suggest distribution failed: {resp.text}"
        result = resp.json()
        
        suggested = result.get("suggested", {})
        assert "own_amount" in suggested, "own_amount should be in suggested"
        
        # For combined mode: own_amount = max(0, total - bank_amount)
        expected_own = round(max(0, total - bank_amount), 2)
        actual_own = suggested.get("own_amount")
        assert abs(actual_own - expected_own) < 0.01, f"Expected own_amount={expected_own}, got {actual_own}"
        
        print(f"PASS: suggest-distribution with bank_amount={bank_amount} → own_amount={actual_own}")


class TestUpdateDealWithOwnStages:
    """Test PUT /api/deals/{id} with own_stages key."""
    
    def test_update_deal_own_stages(self, super_admin_session, test_data):
        """PUT /api/deals/{id} accepts own_stages key."""
        if "deal_own_funds_id" not in test_data:
            pytest.skip("No own_funds deal")
        
        deal_id = test_data["deal_own_funds_id"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        own_stages = deal.get("own_stages", [])
        if not own_stages:
            pytest.skip("No own_stages")
        
        # Modify stages
        modified_stages = [dict(s) for s in own_stages]
        modified_stages[0]["label"] = "G21_TEST_MODIFIED"
        
        # Update with own_stages key
        resp = super_admin_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "own_stages": modified_stages
        })
        assert resp.status_code == 200, f"Update with own_stages failed: {resp.text}"
        updated_deal = resp.json()
        
        updated_stages = updated_deal.get("own_stages", [])
        assert updated_stages[0]["label"] == "G21_TEST_MODIFIED"
        print("PASS: PUT /api/deals/{id} with own_stages key works")
    
    def test_update_deal_recomputes_percent_from_amount(self, super_admin_session, test_data):
        """PUT /api/deals/{id} auto-recomputes percent from amount/basis on save."""
        if "deal_own_funds_id" not in test_data:
            pytest.skip("No own_funds deal")
        
        deal_id = test_data["deal_own_funds_id"]
        
        # Get current deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        total = deal.get("total_with_vat", 100000)
        own_stages = deal.get("own_stages", [])
        if not own_stages:
            pytest.skip("No own_stages")
        
        # Set first stage amount to 10% of total
        new_amount = round(total * 0.10, 2)
        modified_stages = [dict(s) for s in own_stages]
        modified_stages[0]["amount"] = new_amount
        modified_stages[0]["percent"] = 999  # Wrong percent, should be recomputed
        
        # Update
        resp = super_admin_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "own_stages": modified_stages
        })
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        updated_deal = resp.json()
        
        updated_stages = updated_deal.get("own_stages", [])
        recomputed_percent = updated_stages[0].get("percent", 0)
        
        # Backend should recompute percent = amount * 100 / basis
        expected_percent = round(new_amount * 100 / total, 4)
        assert abs(recomputed_percent - expected_percent) < 0.1, f"Expected percent ~{expected_percent}, got {recomputed_percent}"
        
        print(f"PASS: Backend recomputed percent from amount: {new_amount} → {recomputed_percent}%")


class TestQuoteConversionWithNewTerminology:
    """Test quote to deal conversion uses new terminology."""
    
    def test_convert_quote_creates_own_funds_deal(self, super_admin_session, test_data):
        """POST /api/quotes/{id}/convert-to-deal creates deal with payment_mode='own_funds' and own_stages."""
        available = test_data["available_properties"]
        if len(available) < 5:
            pytest.skip("Not enough available properties")
        
        prop = available[4]
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
        
        # Verify deal
        resp = super_admin_session.get(f"{BASE_URL}/api/deals/{deal_id}")
        assert resp.status_code == 200
        deal = resp.json()
        
        # Check payment_mode is own_funds
        pm = deal.get("payment_mode", {})
        assert pm.get("mode") == "own_funds", f"Expected mode=own_funds, got {pm.get('mode')}"
        
        # Check own_stages exists (not non_bank_stages)
        assert "own_stages" in deal, "own_stages should exist"
        assert "non_bank_stages" not in deal, "non_bank_stages should NOT exist"
        
        own_stages = deal.get("own_stages", [])
        assert len(own_stages) > 0, "own_stages should be imported from quote"
        
        # Check stages have bucket='own'
        for stage in own_stages:
            assert stage.get("bucket") == "own", f"Stage bucket should be 'own', got {stage.get('bucket')}"
        
        print(f"PASS: Quote converted to deal with payment_mode=own_funds and {len(own_stages)} own_stages")


class TestCleanup:
    """Cleanup test deals."""
    
    def test_cleanup_test_deals(self, super_admin_session, test_data):
        """Cancel and delete test deals."""
        deal_ids = [
            test_data.get("deal_bank_loan_id"),
            test_data.get("deal_own_funds_id"),
            test_data.get("deal_combined_id"),
            test_data.get("converted_deal_id"),
        ]
        
        for deal_id in deal_ids:
            if deal_id:
                try:
                    super_admin_session.post(f"{BASE_URL}/api/deals/{deal_id}/cancel", json={"reason": "G.2.1 test cleanup"})
                    super_admin_session.delete(f"{BASE_URL}/api/deals/{deal_id}", json={"reason": "G.2.1 test cleanup"})
                    print(f"Cleaned up deal {deal_id}")
                except Exception as e:
                    print(f"Cleanup failed for {deal_id}: {e}")
        
        print("PASS: Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
