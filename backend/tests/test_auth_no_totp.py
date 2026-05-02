"""
Auth Tests - BEG Estates / EstateFlow (TOTP REMOVED)
Tests for simple email+password auth for both staff and clients.
- No TOTP, no 2FA, no QR codes
- Password policy: 12+ chars, letter, digit, special char
- Brute-force lockout: 3 attempts/10min → 1 hour
- 8-hour session, 90-day password rotation
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@begestates.bg"
ADMIN_PASSWORD = "BegEstates2026!Admin"
SALES_EMAIL = "sales@begestates.bg"
SALES_PASSWORD = "BegEstates2026!Sales"
CLIENT_EMAIL = "ivan.petrov@example.com"
CLIENT_PASSWORD = "BegEstates2026!Client"


@pytest.fixture(scope="module")
def admin_session():
    """Session logged in as admin (super_admin)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{BASE_URL}/api/auth/staff/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} {resp.text}")
    return s


@pytest.fixture(scope="module")
def client_session():
    """Session logged in as client."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{BASE_URL}/api/auth/client/login", json={
        "email": CLIENT_EMAIL,
        "password": CLIENT_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Client login failed: {resp.status_code} {resp.text}")
    return s


class TestStaffLoginSimple:
    """Staff login - ONE STEP, no TOTP."""

    def test_staff_login_success(self):
        """POST /api/auth/staff/login → 200 with user + cookie, NO temp_token."""
        s = requests.Session()
        resp = s.post(f"{BASE_URL}/api/auth/staff/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Must have user object
        assert "user" in data, "Response should contain 'user'"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "super_admin"
        
        # Must NOT have temp_token (old TOTP flow)
        assert "temp_token" not in data, "Response should NOT contain temp_token"
        assert "requires_totp" not in data, "Response should NOT contain requires_totp"
        assert "totp_setup_required" not in data, "Response should NOT contain totp_setup_required"
        
        # User object must NOT have TOTP fields
        assert "totp_secret" not in data["user"], "User should NOT have totp_secret"
        assert "two_factor_enabled" not in data["user"], "User should NOT have two_factor_enabled"
        
        # must_change_password should be present
        assert "must_change_password" in data
        assert data["must_change_password"] is False
        
        # Cookie should be set
        assert "access_token" in s.cookies or "access_token" in resp.cookies
        print("✓ Staff login returns user directly, no TOTP")

    def test_staff_login_wrong_password(self):
        """POST /api/auth/staff/login with wrong password → 401."""
        resp = requests.post(f"{BASE_URL}/api/auth/staff/login", json={
            "email": ADMIN_EMAIL,
            "password": "WrongPassword123!"
        })
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("✓ Wrong password returns 401")


class TestStaffLoginLockout:
    """Brute-force lockout: 3 attempts/10min → 1 hour."""

    def test_lockout_after_3_attempts(self):
        """3 wrong attempts → 4th request returns 429."""
        test_email = f"lockout_test_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        
        # Make 3 failed attempts
        for i in range(3):
            resp = s.post(f"{BASE_URL}/api/auth/client/login", json={
                "email": test_email,
                "password": "WrongPassword123!"
            })
            assert resp.status_code == 401, f"Attempt {i+1}: Expected 401, got {resp.status_code}"
        
        # 4th attempt should be locked out
        resp = s.post(f"{BASE_URL}/api/auth/client/login", json={
            "email": test_email,
            "password": "WrongPassword123!"
        })
        assert resp.status_code == 429, f"Expected 429 (lockout), got {resp.status_code}"
        assert "Прекалено много опити" in resp.json().get("detail", "")
        print("✓ Lockout triggers after 3 failed attempts")


class TestRemovedEndpoints:
    """Verify TOTP endpoints are removed (return 404)."""

    def test_setup_totp_removed(self):
        """POST /api/auth/staff/setup-totp → 404."""
        resp = requests.post(f"{BASE_URL}/api/auth/staff/setup-totp", json={})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ /auth/staff/setup-totp returns 404")

    def test_verify_totp_removed(self):
        """POST /api/auth/staff/verify-totp → 404."""
        resp = requests.post(f"{BASE_URL}/api/auth/staff/verify-totp", json={})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ /auth/staff/verify-totp returns 404")

    def test_verify_totp_setup_removed(self):
        """POST /api/auth/staff/verify-totp-setup → 404."""
        resp = requests.post(f"{BASE_URL}/api/auth/staff/verify-totp-setup", json={})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ /auth/staff/verify-totp-setup returns 404")

    def test_2fa_setup_removed(self):
        """POST /api/auth/2fa/setup → 404."""
        resp = requests.post(f"{BASE_URL}/api/auth/2fa/setup", json={})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ /auth/2fa/setup returns 404")

    def test_2fa_verify_removed(self):
        """POST /api/auth/2fa/verify → 404."""
        resp = requests.post(f"{BASE_URL}/api/auth/2fa/verify", json={})
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ /auth/2fa/verify returns 404")

    def test_reset_totp_removed(self, admin_session):
        """POST /api/admin/staff-users/{id}/reset-totp → 404."""
        resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users/test-id/reset-totp")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ /admin/staff-users/{id}/reset-totp returns 404")


class TestPasswordPolicy:
    """Password policy: 12+ chars, letter, digit, special char."""

    def test_password_too_short(self):
        """Password < 12 chars → 400/422."""
        resp = requests.post(f"{BASE_URL}/api/auth/client/reset-password", json={
            "token": "fake_token_12345678901234567890",
            "new_password": "Short1!"  # 8 chars
        })
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"
        # Pydantic validation error for min_length
        print("✓ Short password (8 chars) rejected with 422")

    def test_password_no_special_char(self):
        """Password without special char → 400."""
        resp = requests.post(f"{BASE_URL}/api/auth/client/reset-password", json={
            "token": "fake_token_12345678901234567890",
            "new_password": "NoSpecial2026Pwd"  # 16 chars, no special
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "специален символ" in resp.json().get("detail", "")
        print("✓ Password without special char rejected")

    def test_password_no_digit(self):
        """Password without digit → 400."""
        resp = requests.post(f"{BASE_URL}/api/auth/client/reset-password", json={
            "token": "fake_token_12345678901234567890",
            "new_password": "NoDigitsHere!!"  # 14 chars, no digit
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "цифра" in resp.json().get("detail", "")
        print("✓ Password without digit rejected")


class TestAuthMe:
    """GET /api/auth/me tests."""

    def test_me_returns_user_without_totp_fields(self, admin_session):
        """GET /api/auth/me → user without totp_secret/two_factor_enabled."""
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert data["role"] == "super_admin"
        assert "totp_secret" not in data, "User should NOT have totp_secret"
        assert "two_factor_enabled" not in data, "User should NOT have two_factor_enabled"
        assert "totp_setup_completed" not in data, "User should NOT have totp_setup_completed"
        print("✓ /auth/me returns user without TOTP fields")


class TestStaffList:
    """GET /api/admin/staff-users tests."""

    def test_staff_list_no_totp_fields(self, admin_session):
        """Staff list users should NOT have totp_setup_completed field."""
        resp = admin_session.get(f"{BASE_URL}/api/admin/staff-users")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        for user in data:
            assert "totp_setup_completed" not in user, f"User {user['email']} should NOT have totp_setup_completed"
            assert "totp_secret" not in user, f"User {user['email']} should NOT have totp_secret"
            # Should have password_set_at
            assert "password_set_at" in user, f"User {user['email']} should have password_set_at"
        
        print(f"✓ Staff list ({len(data)} users) has no TOTP fields, has password_set_at")


class TestStaffCreate:
    """POST /api/admin/staff-users tests."""

    def test_create_staff_returns_temp_password(self, admin_session):
        """Create staff → temp_password >= 14 chars, meets policy."""
        test_email = f"test_staff_{uuid.uuid4().hex[:8]}@begestates.bg"
        
        resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users", json={
            "email": test_email,
            "name": "Test Staff",
            "role": "sales"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "staff" in data
        assert "temp_password" in data
        
        temp_pw = data["temp_password"]
        assert len(temp_pw) >= 14, f"temp_password should be >= 14 chars, got {len(temp_pw)}"
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/staff-users/{data['staff']['id']}")
        print(f"✓ Staff created with temp_password ({len(temp_pw)} chars)")


class TestStaffResetPassword:
    """POST /api/admin/staff-users/{id}/reset-password tests."""

    def test_reset_password_returns_temp_password(self, admin_session):
        """Reset password → new temp_password."""
        # Create test user
        test_email = f"test_reset_{uuid.uuid4().hex[:8]}@begestates.bg"
        create_resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users", json={
            "email": test_email,
            "name": "Test Reset",
            "role": "sales"
        })
        staff_id = create_resp.json()["staff"]["id"]
        
        # Reset password
        resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users/{staff_id}/reset-password")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "temp_password" in data
        assert len(data["temp_password"]) >= 14
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/staff-users/{staff_id}")
        print("✓ Reset password returns new temp_password")


class TestClientLogin:
    """Client login tests."""

    def test_client_login_success(self):
        """POST /api/auth/client/login → 200 with user + cookie."""
        s = requests.Session()
        resp = s.post(f"{BASE_URL}/api/auth/client/login", json={
            "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "user" in data
        assert data["user"]["role"] == "client"
        assert data["user"]["email"] == CLIENT_EMAIL
        print("✓ Client login success")


class TestClientForgotPassword:
    """Client forgot password tests."""

    def test_forgot_password_creates_token(self, admin_session):
        """POST /api/auth/client/forgot-password → token in admin list."""
        # Request password reset
        resp = requests.post(f"{BASE_URL}/api/auth/client/forgot-password", json={
            "email": CLIENT_EMAIL
        })
        assert resp.status_code == 200
        
        # Check admin can see it
        list_resp = admin_session.get(f"{BASE_URL}/api/auth/admin/password-resets")
        assert list_resp.status_code == 200
        
        resets = list_resp.json()
        client_resets = [r for r in resets if r["user_email"] == CLIENT_EMAIL]
        assert len(client_resets) > 0, "Should have password reset for client"
        print("✓ Forgot password creates token visible to admin")


class TestStaffDeactivateActivateDelete:
    """Staff deactivate/activate/delete tests."""

    def test_deactivate_activate_delete_flow(self, admin_session):
        """Full flow: create → deactivate → activate → delete."""
        test_email = f"test_flow_{uuid.uuid4().hex[:8]}@begestates.bg"
        
        # Create
        create_resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users", json={
            "email": test_email,
            "name": "Test Flow",
            "role": "sales"
        })
        assert create_resp.status_code == 200
        staff_id = create_resp.json()["staff"]["id"]
        
        # Deactivate
        deactivate_resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users/{staff_id}/deactivate")
        assert deactivate_resp.status_code == 200
        
        # Verify deactivated
        list_resp = admin_session.get(f"{BASE_URL}/api/admin/staff-users")
        user = next((u for u in list_resp.json() if u["id"] == staff_id), None)
        assert user and user["is_active"] is False
        
        # Activate
        activate_resp = admin_session.post(f"{BASE_URL}/api/admin/staff-users/{staff_id}/activate")
        assert activate_resp.status_code == 200
        
        # Verify activated
        list_resp = admin_session.get(f"{BASE_URL}/api/admin/staff-users")
        user = next((u for u in list_resp.json() if u["id"] == staff_id), None)
        assert user and user["is_active"] is True
        
        # Delete
        delete_resp = admin_session.delete(f"{BASE_URL}/api/admin/staff-users/{staff_id}")
        assert delete_resp.status_code == 200
        
        # Verify deleted (not in list)
        list_resp = admin_session.get(f"{BASE_URL}/api/admin/staff-users")
        user = next((u for u in list_resp.json() if u["id"] == staff_id), None)
        assert user is None
        
        print("✓ Deactivate/activate/delete flow works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
