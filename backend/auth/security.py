"""Password hashing, JWT tokens, TOTP utilities."""
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    # bcrypt 12 rounds (per playbook)
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verify. Empty hash → False (no timing leak)."""
    if not plain or not hashed:
        # Изпълняваме „dummy" hashpw, за да изравним времето при липсващ хеш.
        bcrypt.hashpw(b"x", bcrypt.gensalt(rounds=4))
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def create_temp_2fa_token(user_id: str, email: str) -> str:
    """Кратък (5 мин) токен за междинна стъпка между парола и TOTP."""
    payload = {
        "sub": user_id,
        "email": email,
        "type": "temp_2fa",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, account_name: str, issuer: str = "BEG Estates") -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def generate_password_reset_token() -> str:
    """32-byte URL-safe token за password reset link."""
    return secrets.token_urlsafe(32)


def generate_temp_password(length: int = 12) -> str:
    """Безопасна временна парола за миграции и admin-set."""
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length)) + "!1"


_PASSWORD_POLICY_RE_LETTER = re.compile(r"[A-Za-zА-Яа-я]")
_PASSWORD_POLICY_RE_DIGIT = re.compile(r"\d")


def validate_password_policy(password: str) -> None:
    """Минимум: 8 символа, поне 1 буква, поне 1 цифра.

    Raises:
        ValueError: ако паролата не отговаря на изискванията.
    """
    if not password or len(password) < 8:
        raise ValueError("Паролата трябва да е поне 8 символа")
    if not _PASSWORD_POLICY_RE_LETTER.search(password):
        raise ValueError("Паролата трябва да съдържа поне 1 буква")
    if not _PASSWORD_POLICY_RE_DIGIT.search(password):
        raise ValueError("Паролата трябва да съдържа поне 1 цифра")
