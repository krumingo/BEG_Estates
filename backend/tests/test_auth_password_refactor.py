"""Regression tests for password-based auth refactor."""
import os
import pytest
import pyotp

from auth.security import (
    hash_password,
    verify_password,
    validate_password_policy,
    generate_password_reset_token,
    create_temp_2fa_token,
    decode_token,
)


def test_password_hash_and_verify_roundtrip():
    h = hash_password("Hello123!")
    assert h.startswith("$2b$") or h.startswith("$2a$")
    assert verify_password("Hello123!", h)
    assert not verify_password("wrong", h)


def test_verify_password_safe_with_empty_inputs():
    # NEVER raise — must just return False
    assert verify_password("", "") is False
    assert verify_password("x", "") is False
    assert verify_password("", "$2b$12$abc") is False


def test_password_policy_minimum_length():
    with pytest.raises(ValueError):
        validate_password_policy("Ab1")


def test_password_policy_requires_letter_and_digit():
    with pytest.raises(ValueError):
        validate_password_policy("12345678")  # без буква
    with pytest.raises(ValueError):
        validate_password_policy("abcdefgh")  # без цифра
    # OK
    validate_password_policy("MyPass12")
    validate_password_policy("парола123")  # cyrillic


def test_password_reset_token_uniqueness():
    tokens = {generate_password_reset_token() for _ in range(50)}
    assert len(tokens) == 50  # всички уникални
    for t in tokens:
        assert len(t) >= 32


def test_temp_2fa_token_roundtrip(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    tok = create_temp_2fa_token("u1", "x@y.bg")
    decoded = decode_token(tok)
    assert decoded["type"] == "temp_2fa"
    assert decoded["sub"] == "u1"
    assert decoded["email"] == "x@y.bg"


def test_totp_secret_compatible_with_pyotp():
    """Уверяваме се, че secret, генериран от pyotp.random_base32(), приема reverse verify."""
    secret = pyotp.random_base32()
    code = pyotp.TOTP(secret).now()
    assert pyotp.TOTP(secret).verify(code, valid_window=1)
