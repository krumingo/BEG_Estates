"""Password hashing, JWT tokens, password policy."""
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verify. Empty hash → False."""
    if not plain or not hashed:
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
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])


def generate_password_reset_token() -> str:
    """32-byte URL-safe token за password reset link."""
    return secrets.token_urlsafe(32)


def generate_temp_password(length: int = 14) -> str:
    """Безопасна временна парола: 14 alphanum + спец. символ + цифра.

    >= 16 символа total → винаги отговаря на новата 12-символна полиция.
    """
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    base = "".join(secrets.choice(alphabet) for _ in range(length))
    return base + "!1"


_PASSWORD_POLICY_RE_LETTER = re.compile(r"[A-Za-zА-Яа-я]")
_PASSWORD_POLICY_RE_DIGIT = re.compile(r"\d")
_PASSWORD_POLICY_RE_SPECIAL = re.compile(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]")


def validate_password_policy(password: str) -> None:
    """Минимум: 12 символа, поне 1 буква, 1 цифра, 1 специален символ.

    Raises:
        ValueError: ако паролата не отговаря на изискванията.
    """
    if not password or len(password) < 12:
        raise ValueError("Паролата трябва да е поне 12 символа")
    if not _PASSWORD_POLICY_RE_LETTER.search(password):
        raise ValueError("Паролата трябва да съдържа поне 1 буква")
    if not _PASSWORD_POLICY_RE_DIGIT.search(password):
        raise ValueError("Паролата трябва да съдържа поне 1 цифра")
    if not _PASSWORD_POLICY_RE_SPECIAL.search(password):
        raise ValueError("Паролата трябва да съдържа поне 1 специален символ (!@#$%^&* и т.н.)")
