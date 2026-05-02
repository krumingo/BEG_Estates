"""Authentication routes — email + парола за client и staff (БЕЗ TOTP)."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth.dependencies import get_current_user, require_staff
from auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_password_reset_token,
    hash_password,
    validate_password_policy,
    verify_password,
)
from constants import STAFF_ROLES, Role
from db import get_db
from models import (
    AdminSetClientPasswordRequest,
    ChangePasswordRequest,
    ClientLoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    StaffLoginRequest,
)
from routes.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_KW = dict(httponly=True, secure=True, samesite="none", path="/")

# Strict lockout (компенсация за липса на 2FA): 3 неуспешни/10мин → 1ч заключване
LOCKOUT_MAX_ATTEMPTS = 3
LOCKOUT_WINDOW_MIN = 10
LOCKOUT_DURATION_MIN = 60
PASSWORD_RESET_TTL_HOURS = 1
# Принудителна смяна на парола на staff след 90 дни
PASSWORD_MAX_AGE_DAYS = 90
# 8 часа сесия
ACCESS_TOKEN_MAX_AGE = 8 * 3600


def _set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, max_age=ACCESS_TOKEN_MAX_AGE, **COOKIE_KW)
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
        "must_change_password": bool(user.get("must_change_password", False)),
        "phone": user.get("phone", ""),
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _password_aged_out(user: dict) -> bool:
    """True ако паролата на staff е по-стара от PASSWORD_MAX_AGE_DAYS."""
    set_at = user.get("password_set_at")
    if not set_at:
        return False
    try:
        ts = datetime.fromisoformat(set_at)
    except ValueError:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (_now() - ts).days >= PASSWORD_MAX_AGE_DAYS


async def _check_lockout(db, key: str) -> None:
    attempt = await db.login_attempts.find_one({"identifier": key})
    if not attempt:
        return
    locked_until = attempt.get("locked_until")
    if locked_until and datetime.fromisoformat(locked_until) > _now():
        raise HTTPException(
            status_code=429,
            detail="Прекалено много опити. Опитайте по-късно.",
        )


async def _record_failed_attempt(db, key: str) -> None:
    now = _now()
    window_start = (now - timedelta(minutes=LOCKOUT_WINDOW_MIN)).isoformat()
    existing = await db.login_attempts.find_one({"identifier": key})
    if existing and existing.get("last_attempt", "") < window_start:
        await db.login_attempts.update_one(
            {"identifier": key},
            {"$set": {"count": 1, "last_attempt": now.isoformat(), "locked_until": None}},
        )
        return
    new_count = (existing.get("count", 0) if existing else 0) + 1
    update = {"count": new_count, "last_attempt": now.isoformat()}
    if new_count >= LOCKOUT_MAX_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_DURATION_MIN)).isoformat()
    await db.login_attempts.update_one(
        {"identifier": key}, {"$set": update}, upsert=True
    )


async def _clear_attempts(db, key: str) -> None:
    await db.login_attempts.delete_one({"identifier": key})


async def _record_login_history(db, user_id: str, request: Request) -> None:
    await db.login_history.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "ip": request.client.host if request.client else "?",
            "user_agent": request.headers.get("user-agent", ""),
            "at": _now().isoformat(),
        }
    )


def _ensure_password_policy(pw: str) -> None:
    try:
        validate_password_policy(pw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# CLIENT — email + password
# =============================================================================
@router.post("/client/login")
async def client_login(payload: ClientLoginRequest, request: Request, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    ip = request.client.host if request.client else "?"
    key = f"{ip}:{email}"

    await _check_lockout(db, key)

    user = await db.users.find_one({"email": email})
    if not user or user.get("role") != Role.CLIENT.value or not verify_password(
        payload.password, user.get("password_hash", "")
    ):
        await _record_failed_attempt(db, key)
        await log_action(
            user["id"] if user else None,
            "login_failure",
            "user",
            user["id"] if user else email,
            {"role": "client", "ip": ip},
        )
        raise HTTPException(status_code=401, detail="Невалидни данни за вход")

    await _clear_attempts(db, key)

    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)

    await _record_login_history(db, user["id"], request)
    await log_action(user["id"], "login_success", "user", user["id"], {"role": "client"})

    return {
        "user": _public_user(user),
        "must_change_password": bool(user.get("must_change_password", False)),
    }


@router.post("/client/forgot-password")
async def client_forgot_password(payload: ForgotPasswordRequest, request: Request):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email, "role": Role.CLIENT.value})

    if user:
        token = generate_password_reset_token()
        await db.password_reset_tokens.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "user_email": user["email"],
                "user_name": user.get("name") or "",
                "user_role": user["role"],
                "token": token,
                "expires_at": (_now() + timedelta(hours=PASSWORD_RESET_TTL_HOURS)).isoformat(),
                "created_at": _now().isoformat(),
                "used_at": None,
                "cancelled_at": None,
                "delivered_at": None,
            }
        )
        await log_action(
            user["id"], "password_reset_requested", "user", user["id"],
            {"role": "client"},
        )

    return {"ok": True, "message": "Ако имейлът съществува, заявката е създадена. Свържете се с екипа за линк."}


@router.post("/client/reset-password")
async def client_reset_password(payload: ResetPasswordRequest):
    db = get_db()
    _ensure_password_policy(payload.new_password)
    entry = await db.password_reset_tokens.find_one({"token": payload.token, "user_role": Role.CLIENT.value})
    if not entry:
        raise HTTPException(status_code=400, detail="Невалиден или изтекъл линк")
    if entry.get("used_at") or entry.get("cancelled_at"):
        raise HTTPException(status_code=400, detail="Линкът вече е използван или отменен")
    if datetime.fromisoformat(entry["expires_at"]) < _now():
        raise HTTPException(status_code=400, detail="Линкът е изтекъл")

    await db.users.update_one(
        {"id": entry["user_id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_set_at": _now().isoformat(),
            "must_change_password": False,
        }},
    )
    await db.password_reset_tokens.update_one(
        {"id": entry["id"]}, {"$set": {"used_at": _now().isoformat()}}
    )
    await log_action(
        entry["user_id"], "password_reset_completed", "user", entry["user_id"], {"role": "client"}
    )
    return {"ok": True}


@router.post("/client/change-password")
async def client_change_password(
    payload: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != Role.CLIENT.value:
        raise HTTPException(status_code=403, detail="Само за клиенти")
    db = get_db()
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(payload.current_password, full.get("password_hash", "")):
        await log_action(user["id"], "password_change_failure", "user", user["id"], {})
        raise HTTPException(status_code=401, detail="Текущата парола е невалидна")
    _ensure_password_policy(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_set_at": _now().isoformat(),
            "must_change_password": False,
        }},
    )
    await log_action(user["id"], "password_changed", "user", user["id"], {})
    return {"ok": True}


# =============================================================================
# STAFF — email + password (БЕЗ TOTP)
# =============================================================================
@router.post("/staff/login")
async def staff_login(payload: StaffLoginRequest, request: Request, response: Response):
    """Един-стъпков staff login: email + парола → JWT cookie веднага."""
    db = get_db()
    email = payload.email.lower().strip()
    ip = request.client.host if request.client else "?"
    key = f"staff:{ip}:{email}"

    await _check_lockout(db, key)

    user = await db.users.find_one({"email": email})
    if not user or user["role"] not in STAFF_ROLES or not verify_password(
        payload.password, user.get("password_hash", "")
    ):
        await _record_failed_attempt(db, key)
        await log_action(
            user["id"] if user else None,
            "login_failure",
            "user",
            user["id"] if user else email,
            {"role": "staff", "ip": ip},
        )
        raise HTTPException(status_code=401, detail="Невалидни данни за вход")

    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Акаунтът е деактивиран")
    if user.get("is_deleted"):
        raise HTTPException(status_code=403, detail="Акаунтът е изтрит")

    await _clear_attempts(db, key)

    # Принудителна 90-дневна ротация на пароли за staff
    must_change = bool(user.get("must_change_password", False))
    if _password_aged_out(user) and not must_change:
        await db.users.update_one(
            {"id": user["id"]}, {"$set": {"must_change_password": True}}
        )
        must_change = True
        await log_action(
            user["id"], "password_aged_out", "user", user["id"],
            {"max_age_days": PASSWORD_MAX_AGE_DAYS},
        )

    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)

    await _record_login_history(db, user["id"], request)
    await log_action(user["id"], "login_success", "user", user["id"], {"role": "staff"})

    fresh = await db.users.find_one({"id": user["id"]})
    return {
        "user": _public_user(fresh),
        "must_change_password": must_change,
    }


@router.post("/staff/forgot-password")
async def staff_forgot_password(payload: ForgotPasswordRequest, request: Request):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if user and user["role"] in STAFF_ROLES:
        token = generate_password_reset_token()
        await db.password_reset_tokens.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "user_email": user["email"],
                "user_name": user.get("name") or "",
                "user_role": user["role"],
                "token": token,
                "expires_at": (_now() + timedelta(hours=PASSWORD_RESET_TTL_HOURS)).isoformat(),
                "created_at": _now().isoformat(),
                "used_at": None,
                "cancelled_at": None,
                "delivered_at": None,
            }
        )
        await log_action(
            user["id"], "password_reset_requested", "user", user["id"],
            {"role": "staff"},
        )
    return {"ok": True}


@router.post("/staff/reset-password")
async def staff_reset_password(payload: ResetPasswordRequest):
    db = get_db()
    _ensure_password_policy(payload.new_password)
    entry = await db.password_reset_tokens.find_one(
        {"token": payload.token, "user_role": {"$in": list(STAFF_ROLES)}}
    )
    if not entry:
        raise HTTPException(status_code=400, detail="Невалиден или изтекъл линк")
    if entry.get("used_at") or entry.get("cancelled_at"):
        raise HTTPException(status_code=400, detail="Линкът вече е използван или отменен")
    if datetime.fromisoformat(entry["expires_at"]) < _now():
        raise HTTPException(status_code=400, detail="Линкът е изтекъл")

    await db.users.update_one(
        {"id": entry["user_id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_set_at": _now().isoformat(),
            "must_change_password": False,
        }},
    )
    await db.password_reset_tokens.update_one(
        {"id": entry["id"]}, {"$set": {"used_at": _now().isoformat()}}
    )
    await log_action(entry["user_id"], "password_reset_completed", "user", entry["user_id"], {"role": "staff"})
    return {"ok": True}


@router.post("/staff/change-password")
async def staff_change_password(
    payload: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
):
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Само за служители")
    db = get_db()
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(payload.current_password, full.get("password_hash", "")):
        await log_action(user["id"], "password_change_failure", "user", user["id"], {})
        raise HTTPException(status_code=401, detail="Текущата парола е невалидна")
    _ensure_password_policy(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_set_at": _now().isoformat(),
            "must_change_password": False,
        }},
    )
    await log_action(user["id"], "password_changed", "user", user["id"], {})
    return {"ok": True}


# =============================================================================
# ADMIN — pending password resets management
# =============================================================================
def _frontend_origin() -> str:
    origins = os.environ.get("CORS_ORIGINS", "").split(",")
    for o in origins:
        o = o.strip()
        if o and o.startswith("http") and "localhost" not in o:
            return o.rstrip("/")
    return ""


@router.get("/admin/password-resets")
async def admin_list_password_resets(_=Depends(require_staff())):
    db = get_db()
    items = (
        await db.password_reset_tokens.find(
            {"used_at": None, "cancelled_at": None},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(200)
    )
    base = _frontend_origin()
    out = []
    now = _now()
    for it in items:
        expired = datetime.fromisoformat(it["expires_at"]) < now
        out.append({
            **it,
            "expired": expired,
            "reset_url": f"{base}/reset-password?token={it['token']}&role={it.get('user_role','client')}" if base else f"/reset-password?token={it['token']}&role={it.get('user_role','client')}",
        })
    return out


@router.post("/admin/password-resets/{reset_id}/cancel")
async def admin_cancel_password_reset(
    reset_id: str, user: dict = Depends(require_staff())
):
    db = get_db()
    res = await db.password_reset_tokens.update_one(
        {"id": reset_id, "used_at": None, "cancelled_at": None},
        {"$set": {"cancelled_at": _now().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Заявката не е намерена или вече е обработена")
    await log_action(user["id"], "password_reset_cancelled", "password_reset", reset_id, {})
    return {"ok": True}


@router.post("/admin/password-resets/{reset_id}/mark-delivered")
async def admin_mark_password_reset_delivered(
    reset_id: str, user: dict = Depends(require_staff())
):
    db = get_db()
    res = await db.password_reset_tokens.update_one(
        {"id": reset_id, "used_at": None, "cancelled_at": None},
        {"$set": {"delivered_at": _now().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Заявката не е намерена или вече е обработена")
    await log_action(user["id"], "password_reset_marked_delivered", "password_reset", reset_id, {})
    return {"ok": True}


@router.post("/admin/clients/{client_id}/set-password")
async def admin_set_client_password(
    client_id: str,
    payload: AdminSetClientPasswordRequest,
    user: dict = Depends(require_staff()),
):
    """Admin задава директно нова парола на клиент."""
    db = get_db()
    target = await db.users.find_one({"id": client_id, "role": Role.CLIENT.value})
    if not target:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    _ensure_password_policy(payload.new_password)
    await db.users.update_one(
        {"id": client_id},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_set_at": _now().isoformat(),
            "must_change_password": payload.force_change,
        }},
    )
    await log_action(
        user["id"], "admin_set_client_password", "user", client_id,
        {"force_change": payload.force_change},
    )
    return {"ok": True, "must_change_password": payload.force_change}


# =============================================================================
# me / refresh / logout
# =============================================================================
@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return _public_user(user)


@router.post("/refresh")
async def refresh_access_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Сесията е изтекла")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Сесията е изтекла")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Невалидна сесия")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Невалиден тип токен")
    db = get_db()
    user = await db.users.find_one(
        {"id": payload["sub"]}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="Потребителят не е намерен")
    access = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", access, max_age=ACCESS_TOKEN_MAX_AGE, **COOKIE_KW)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response, request: Request):
    user_id = None
    token = request.cookies.get("access_token")
    if token:
        try:
            decoded = decode_token(token)
            user_id = decoded.get("sub")
        except Exception:
            pass
    _clear_auth_cookies(response)
    if user_id:
        await log_action(user_id, "logout", "user", user_id, {})
    return {"ok": True}
