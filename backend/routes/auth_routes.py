"""Authentication routes: staff login (pwd+TOTP) and client login (email OTP)."""
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth.dependencies import get_current_user
from auth.security import (
    create_access_token,
    create_refresh_token,
    generate_otp_code,
    generate_totp_secret,
    hash_password,
    totp_uri,
    verify_password,
    verify_totp,
)
from constants import STAFF_ROLES, Role
from db import get_db
from models import (
    ClientOtpRequest,
    ClientOtpVerify,
    StaffLoginRequest,
    TotpSetupVerify,
)
from routes.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_KW = dict(httponly=True, secure=True, samesite="none", path="/")


def _set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, max_age=3600, **COOKIE_KW)
    response.set_cookie("refresh_token", refresh, max_age=604800, **COOKIE_KW)


def _clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user["role"],
        "two_factor_enabled": bool(user.get("two_factor_enabled", False)),
        "phone": user.get("phone", ""),
    }


# ---------- STAFF: email + password + TOTP ----------
@router.post("/staff/login")
async def staff_login(payload: StaffLoginRequest, request: Request, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    ip = request.client.host if request.client else "?"

    # brute force check
    key = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": key})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Прекалено много опити. Опитайте по-късно.")

    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": key},
            {
                "$inc": {"count": 1},
                "$set": {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()},
            },
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Невалидни данни за вход")

    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Моля, използвайте клиентския вход")

    # 2FA for staff (mandatory once set up; first-time login before setup is allowed to bootstrap)
    if user.get("two_factor_enabled"):
        if not payload.totp_code:
            raise HTTPException(status_code=401, detail="Моля, въведете 2FA код")
        if not verify_totp(user.get("totp_secret", ""), payload.totp_code):
            raise HTTPException(status_code=401, detail="Невалиден 2FA код")

    await db.login_attempts.delete_one({"identifier": key})

    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)

    await db.login_history.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "ip": ip,
            "user_agent": request.headers.get("user-agent", ""),
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await log_action(user["id"], "staff_login", "user", user["id"], None)

    return {"user": _public_user(user), "needs_2fa_setup": not user.get("two_factor_enabled")}


# ---------- CLIENT: email OTP ----------
@router.post("/client/request-otp")
async def client_request_otp(payload: ClientOtpRequest):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        # auto-create client on first request for scaffold
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": email.split("@")[0].title(),
            "role": Role.CLIENT.value,
            "two_factor_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    elif user["role"] != Role.CLIENT.value:
        raise HTTPException(status_code=403, detail="Използвайте служебния вход")

    code = generate_otp_code()
    await db.otp_codes.update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "code": code,
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    # In scaffold we return the OTP so frontend can show it / for testing.
    return {"message": "Кодът е изпратен", "dev_otp": code}


@router.post("/client/verify-otp")
async def client_verify_otp(payload: ClientOtpVerify, request: Request, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    entry = await db.otp_codes.find_one({"email": email}, {"_id": 0})
    if not entry or entry.get("code") != payload.code:
        raise HTTPException(status_code=401, detail="Невалиден код")
    if datetime.fromisoformat(entry["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Кодът е изтекъл")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="Потребителят не е намерен")

    await db.otp_codes.delete_one({"email": email})
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)
    await db.login_history.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "ip": request.client.host if request.client else "?",
            "user_agent": request.headers.get("user-agent", ""),
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"user": _public_user(user)}


# ---------- 2FA setup ----------
@router.post("/2fa/setup")
async def totp_setup(user: dict = Depends(get_current_user)):
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="2FA е задължително само за служители")
    db = get_db()
    secret = generate_totp_secret()
    await db.users.update_one({"id": user["id"]}, {"$set": {"totp_secret": secret, "two_factor_enabled": False}})
    return {"secret": secret, "uri": totp_uri(secret, user["email"])}


@router.post("/2fa/verify")
async def totp_verify(payload: TotpSetupVerify, user: dict = Depends(get_current_user)):
    db = get_db()
    full = await db.users.find_one({"id": user["id"]})
    secret = full.get("totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="Първо инициирайте 2FA")
    if not verify_totp(secret, payload.code):
        raise HTTPException(status_code=401, detail="Невалиден код")
    await db.users.update_one({"id": user["id"]}, {"$set": {"two_factor_enabled": True}})
    return {"two_factor_enabled": True}


# ---------- me / logout ----------
@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return _public_user(user)


@router.post("/logout")
async def logout(response: Response):
    _clear_auth_cookies(response)
    return {"ok": True}
