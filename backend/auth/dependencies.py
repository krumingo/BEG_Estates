"""FastAPI dependencies: current user, role guards."""
import jwt
from fastapi import Depends, HTTPException, Request, status

from constants import STAFF_ROLES
from db import get_db
from auth.security import decode_token


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не сте удостоверен")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Токенът е изтекъл")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Невалиден токен")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Невалиден тип токен")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Потребителят не е намерен")
    return user


def require_roles(*roles: str):
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Нямате права за това действие")
        return user
    return _checker


def require_staff():
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in STAFF_ROLES:
            raise HTTPException(status_code=403, detail="Достъп само за служители")
        return user
    return _checker


def require_client():
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") != "client":
            raise HTTPException(status_code=403, detail="Достъп само за клиенти")
        return user
    return _checker
