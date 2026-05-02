"""Authentication routes: классически email/password логин за клиенти и staff с TOTP 2FA."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth.dependencies import get_current_user, require_staff
from auth.security import (
    create_access_token,
    create_refresh_token,
    create_temp_2fa_token,
    decode_token,
    generate_password_reset_token,
    generate_totp_secret,
    hash_password,
    totp_uri,
    validate_password_policy,
    verify_password,
    verify_totp,
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
    StaffTotpVerifyRequest,
    TotpSetupVerify,
)
from routes.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_KW = dict(httponly=True, secure=True, samesite="none", path="/")

# Lockout policy
LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_MIN = 15
LOCKOUT_DURATION_MIN = 30
PASSWORD_RESET_TTL_HOURS = 1


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
        "totp_setup_required": bool(user.get("totp_setup_required", False)),
        "must_change_password": bool(user.get("must_change_password", False)),
        "phone": user.get("phone", ""),
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _check_lockout(db, key: str) -> None:
    """Хвърля 429, ако ip:email е заключен."""
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
    """Брои неуспешни опити; при >= 5 за 15 мин → заключва за 30 мин."""
    now = _now()
    window_start = (now - timedelta(minutes=LOCKOUT_WINDOW_MIN)).isoformat()
    existing = await db.login_attempts.find_one({"identifier": key})
    # ако последният опит е извън прозореца → reset брояча
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
    """Винаги връща 200 (за да не разкрива дали имейлът съществува).

    НЕ изпраща email. Admin вижда заявката в /admin/password-resets и ръчно
    дава линка на клиента (WhatsApp / Viber / телефон).
    """
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
# STAFF — email + password (стъпка 1) → temp_token → TOTP (стъпка 2)
# =============================================================================
@router.post("/staff/login")
async def staff_login(payload: StaffLoginRequest, request: Request):
    """Стъпка 1: проверка на парола → връща temp_token + дали е нужно TOTP setup."""
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

    # Първа стъпка ОК — никога не издаваме access cookie тук.
    temp_token = create_temp_2fa_token(user["id"], user["email"])
    needs_setup = not user.get("totp_secret") or not user.get("two_factor_enabled")
    return {
        "requires_totp": True,
        "temp_token": temp_token,
        "totp_setup_required": needs_setup,
    }


@router.post("/staff/verify-totp")
async def staff_verify_totp(
    payload: StaffTotpVerifyRequest,
    request: Request,
    response: Response,
):
    """Стъпка 2: verify TOTP с temp_token → издава access/refresh cookies."""
    db = get_db()
    ip = request.client.host if request.client else "?"

    try:
        decoded = decode_token(payload.temp_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Сесията за вход е изтекла, моля въведете паролата отново")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Невалиден токен")
    if decoded.get("type") != "temp_2fa":
        raise HTTPException(status_code=401, detail="Невалиден тип токен")

    user_id = decoded["sub"]
    user = await db.users.find_one({"id": user_id})
    if not user or user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=401, detail="Невалидна сесия")

    # 3 неуспешни опита със същия temp_token → invalidate
    key = f"totp:{user_id}:{ip}"
    await _check_lockout(db, key)

    secret = user.get("totp_secret")
    if not secret or not verify_totp(secret, payload.code):
        await _record_failed_attempt(db, key)
        await log_action(
            user["id"], "totp_verify_failure", "user", user["id"],
            {"ip": ip},
        )
        raise HTTPException(status_code=401, detail="Невалиден 2FA код")

    # Успех — активираме 2FA, ако е първи verify, и издаваме реални cookies
    updates = {}
    if not user.get("two_factor_enabled"):
        updates["two_factor_enabled"] = True
    if user.get("totp_setup_required"):
        updates["totp_setup_required"] = False
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})

    await _clear_attempts(db, key)
    await _clear_attempts(db, f"staff:{ip}:{user['email']}")

    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)

    await _record_login_history(db, user["id"], request)
    await log_action(user["id"], "login_success", "user", user["id"], {"role": "staff", "totp": True})

    fresh = await db.users.find_one({"id": user["id"]})
    return {
        "user": _public_user(fresh),
        "must_change_password": bool(fresh.get("must_change_password", False)),
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


@router.post("/staff/setup-totp")
async def staff_setup_totp_with_temp_token(payload: StaffTotpVerifyRequest):
    """Bootstrap setup на TOTP при първи staff login (още няма access cookie).

    Използва temp_token като auth — `code` е игнориран в payload-а. Връща secret + QR uri.
    След това клиентът извиква /auth/staff/verify-totp с temp_token + code от authenticator.
    """
    db = get_db()
    try:
        decoded = decode_token(payload.temp_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Сесията за вход е изтекла")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Невалиден токен")
    if decoded.get("type") != "temp_2fa":
        raise HTTPException(status_code=401, detail="Невалиден тип токен")

    user = await db.users.find_one({"id": decoded["sub"]})
    if not user or user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=401, detail="Невалидна сесия")

    # Ако вече има secret и 2FA е активен — не позволяваме нов setup без re-auth.
    if user.get("totp_secret") and user.get("two_factor_enabled"):
        raise HTTPException(
            status_code=400,
            detail="2FA вече е настроено. Свържете се с администратор за рестарт.",
        )

    secret = generate_totp_secret()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "totp_secret": secret,
            "two_factor_enabled": False,
            "totp_setup_required": True,
        }},
    )
    await log_action(user["id"], "totp_setup_started", "user", user["id"], {"context": "first_login"})
    return {
        "secret": secret,
        "uri": totp_uri(secret, user["email"]),
        "issuer": "BEG Estates",
        "account": user["email"],
    }


# =============================================================================
# 2FA setup (forced при първи staff login или manual rotation)
# =============================================================================
@router.post("/2fa/setup")
async def totp_setup(user: dict = Depends(get_current_user)):
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="2FA е задължително само за служители")
    db = get_db()
    secret = generate_totp_secret()
    # Генерираме нов secret, но НЕ маркираме като enabled преди verify.
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "totp_secret": secret,
            "two_factor_enabled": False,
            "totp_setup_required": True,
        }},
    )
    await log_action(user["id"], "totp_setup_started", "user", user["id"], {})
    return {"secret": secret, "uri": totp_uri(secret, user["email"])}


@router.post("/2fa/verify")
async def totp_verify(payload: TotpSetupVerify, user: dict = Depends(get_current_user)):
    db = get_db()
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="2FA е задължително само за служители")
    full = await db.users.find_one({"id": user["id"]})
    secret = full.get("totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="Първо инициирайте 2FA")
    if not verify_totp(secret, payload.code):
        await log_action(user["id"], "totp_verify_failure", "user", user["id"], {"context": "setup"})
        raise HTTPException(status_code=401, detail="Невалиден код")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"two_factor_enabled": True, "totp_setup_required": False}},
    )
    await log_action(user["id"], "totp_setup_completed", "user", user["id"], {})
    return {"two_factor_enabled": True}


# =============================================================================
# ADMIN — pending password resets management
# =============================================================================
def _frontend_origin() -> str:
    """Първият CORS origin = публичният frontend URL."""
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
    """Admin задава директно нова парола на клиент (например при телефонен разговор)."""
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
        {"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="Потребителят не е намерен")
    access = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", access, max_age=3600, **COOKIE_KW)
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
