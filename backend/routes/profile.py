"""Client profile + client↔admin correspondence."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, field_validator

from auth.dependencies import get_current_user, require_roles, require_staff
from auth.security import hash_password, generate_temp_password
from constants import STAFF_ROLES, Role
from db import get_db
from routes.audit import log_action

router = APIRouter(tags=["profile"])


PREFERRED_CONTACT_VALUES = {"email", "phone", "viber", "any"}


# ---------- models ----------
class ClientProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    preferred_contact: Optional[str] = None
    client_note: Optional[str] = None

    @field_validator("preferred_contact")
    @classmethod
    def _check_preferred(cls, v):
        if v is None or v == "":
            return v
        if v not in PREFERRED_CONTACT_VALUES:
            raise ValueError(
                f"preferred_contact must be one of {sorted(PREFERRED_CONTACT_VALUES)}"
            )
        return v


class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    client_id: Optional[str] = None  # required when sender is staff

    @field_validator("body")
    @classmethod
    def _body_non_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Съобщението не може да е празно")
        return v


# ---------- helpers ----------
def _profile_completeness(user: dict) -> dict:
    missing = []
    if not (user.get("name") or "").strip():
        missing.append("name")
    if not (user.get("phone") or "").strip():
        missing.append("phone")
    if not (user.get("preferred_contact") or "").strip():
        missing.append("preferred_contact")
    return {
        "is_complete": len(missing) == 0,
        "missing": missing,
    }


def _public_user(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "email": u.get("email"),
        "name": u.get("name") or "",
        "role": u.get("role"),
        "phone": u.get("phone") or "",
        "preferred_contact": u.get("preferred_contact") or "",
        "client_note": u.get("client_note") or "",
        "two_factor_enabled": bool(u.get("two_factor_enabled")),
        "created_at": u.get("created_at"),
    }


# ---------- profile ----------
@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    db = get_db()
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "password_hash": 0, "totp_secret": 0},
    )
    if not u:
        raise HTTPException(status_code=404, detail="Потребителят не е намерен")
    out = _public_user(u)
    out["completeness"] = _profile_completeness(u)
    return out


@router.put("/profile")
async def update_profile(
    payload: ClientProfileUpdate,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    changes = payload.model_dump(exclude_unset=True)
    # Never allow role/email/password mutation through this endpoint.
    changes.pop("email", None)
    changes.pop("role", None)
    if not changes:
        # nothing to update → just return current profile
        return await get_profile(user)

    # Normalise: trim strings
    for k in ("name", "phone", "preferred_contact", "client_note"):
        if k in changes and isinstance(changes[k], str):
            changes[k] = changes[k].strip()
    await db.users.update_one({"id": user["id"]}, {"$set": changes})
    await log_action(
        user["id"], "profile_update", "user", user["id"],
        {"fields": list(changes.keys())},
    )
    return await get_profile(user)


# ---------- correspondence ----------
def _message_dto(m: dict) -> dict:
    return {
        "id": m.get("id"),
        "client_id": m.get("client_id"),
        "sender_role": m.get("sender_role"),
        "sender_id": m.get("sender_id"),
        "sender_name": m.get("sender_name") or "",
        "body": m.get("body") or "",
        "created_at": m.get("created_at"),
    }


@router.get("/messages")
async def list_messages(
    client_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """
    Client → always sees own thread.
    Staff  → must pass ?client_id=<id> to load that client's thread.
    """
    db = get_db()
    if user["role"] in STAFF_ROLES:
        if not client_id:
            raise HTTPException(
                status_code=400, detail="Липсва параметър client_id"
            )
        target = await db.users.find_one({"id": client_id, "role": "client"})
        if not target:
            raise HTTPException(status_code=404, detail="Клиентът не е намерен")
        q = {"client_id": client_id}
    else:
        q = {"client_id": user["id"]}

    items = (
        await db.messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    )
    return [_message_dto(m) for m in items]


@router.post("/messages")
async def create_message(
    payload: MessageCreate,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    is_staff = user["role"] in STAFF_ROLES

    if is_staff:
        if not payload.client_id:
            raise HTTPException(status_code=400, detail="Липсва client_id")
        client = await db.users.find_one(
            {"id": payload.client_id, "role": "client"}, {"_id": 0, "id": 1}
        )
        if not client:
            raise HTTPException(status_code=404, detail="Клиентът не е намерен")
        client_id = payload.client_id
        sender_role = "staff"
    else:
        client_id = user["id"]
        sender_role = "client"

    doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "sender_role": sender_role,
        "sender_id": user["id"],
        "sender_name": user.get("name") or "",
        "body": payload.body,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    await log_action(
        user["id"], "message_create", "message", doc["id"],
        {"client_id": client_id, "sender_role": sender_role},
    )
    return _message_dto(doc)


# ---------- staff-only: enriched clients list ----------
@router.get("/clients-enriched")
async def list_clients_enriched(_=Depends(require_staff())):
    db = get_db()
    users = await db.users.find(
        {"role": "client", "is_deleted": {"$ne": True}},
        {"_id": 0, "totp_secret": 0},
    ).to_list(500)
    out = []
    for u in users:
        enriched = _public_user(u)
        enriched["completeness"] = _profile_completeness(u)
        enriched["reservation_count"] = await db.reservations.count_documents(
            {"client_id": u["id"], "status": {"$in": ["active", "converted"]}}
        )
        enriched["has_password"] = bool(u.get("password_hash"))
        enriched["must_change_password"] = bool(u.get("must_change_password"))
        out.append(enriched)
    return out


# ===========================================================================
# Admin CRUD за клиенти
# ===========================================================================
class AdminClientCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=120)
    phone: Optional[str] = None
    preferred_contact: Optional[str] = "any"
    notes: Optional[str] = None
    send_password: bool = True

    @field_validator("name")
    @classmethod
    def _name_clean(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Името трябва да е поне 2 символа")
        return v

    @field_validator("phone")
    @classmethod
    def _phone_clean(cls, v):
        if v is None:
            return v
        v = v.strip()
        if v == "":
            return None
        if len(v) < 5:
            raise ValueError("Телефонът трябва да е поне 5 символа")
        return v

    @field_validator("preferred_contact")
    @classmethod
    def _preferred(cls, v):
        if v is None or v == "":
            return "any"
        if v not in PREFERRED_CONTACT_VALUES:
            raise ValueError(f"preferred_contact must be one of {sorted(PREFERRED_CONTACT_VALUES)}")
        return v


class AdminClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    preferred_contact: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_clean(cls, v):
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Името трябва да е поне 2 символа")
        return v

    @field_validator("phone")
    @classmethod
    def _phone_clean(cls, v):
        if v is None:
            return v
        v = v.strip()
        if v == "":
            return None
        if len(v) < 5:
            raise ValueError("Телефонът трябва да е поне 5 символа")
        return v

    @field_validator("preferred_contact")
    @classmethod
    def _preferred(cls, v):
        if v is None or v == "":
            return v
        if v not in PREFERRED_CONTACT_VALUES:
            raise ValueError(f"preferred_contact must be one of {sorted(PREFERRED_CONTACT_VALUES)}")
        return v


@router.post("/admin/clients")
async def admin_create_client(
    payload: AdminClientCreate,
    actor: dict = Depends(require_staff()),
):
    db = get_db()
    email = payload.email.lower().strip()

    # Unique check (включваме и soft-deleted, за да не дублираме email-а)
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Клиент с този имейл вече съществува",
        )

    now = datetime.now(timezone.utc).isoformat()
    new_id = str(uuid.uuid4())
    temp_password: Optional[str] = None
    update_fields = {
        "id": new_id,
        "email": email,
        "name": payload.name,
        "role": Role.CLIENT.value,
        "phone": payload.phone or "",
        "preferred_contact": payload.preferred_contact or "any",
        "client_note": payload.notes or "",
        "two_factor_enabled": False,
        "must_change_password": True,
        "is_deleted": False,
        "created_at": now,
        "created_by": actor["id"],
    }
    if payload.send_password:
        temp_password = generate_temp_password()
        update_fields["password_hash"] = hash_password(temp_password)
        update_fields["password_set_at"] = now
    else:
        update_fields["password_hash"] = None
        update_fields["password_set_at"] = None

    await db.users.insert_one(update_fields)
    await log_action(
        actor["id"], "client_created", "user", new_id,
        {"email": email, "with_password": payload.send_password},
    )

    fresh = await db.users.find_one(
        {"id": new_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
    )
    return {
        "client": _public_user(fresh),
        "temp_password": temp_password,
        "must_change_password": True,
    }


@router.patch("/admin/clients/{client_id}")
async def admin_update_client(
    client_id: str,
    payload: AdminClientUpdate,
    actor: dict = Depends(require_staff()),
):
    db = get_db()
    target = await db.users.find_one({"id": client_id, "role": Role.CLIENT.value})
    if not target or target.get("is_deleted"):
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")

    changes = payload.model_dump(exclude_unset=True)
    # Никога през тоя endpoint: email, role, password
    for forbidden in ("email", "role", "password_hash", "id"):
        changes.pop(forbidden, None)
    # Map "notes" → "client_note" (вътрешният field name)
    if "notes" in changes:
        changes["client_note"] = changes.pop("notes") or ""
    if not changes:
        return _public_user(target)
    await db.users.update_one({"id": client_id}, {"$set": changes})
    await log_action(
        actor["id"], "client_updated", "user", client_id,
        {"fields": list(changes.keys())},
    )
    fresh = await db.users.find_one(
        {"id": client_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
    )
    return _public_user(fresh)


@router.delete("/admin/clients/{client_id}")
async def admin_delete_client(
    client_id: str,
    actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value, Role.ADMIN.value)),
):
    """Soft delete (запазваме reservation history)."""
    db = get_db()
    target = await db.users.find_one({"id": client_id, "role": Role.CLIENT.value})
    if not target:
        raise HTTPException(status_code=404, detail="Клиентът не е намерен")
    if target.get("is_deleted"):
        return {"ok": True, "already_deleted": True}
    await db.users.update_one(
        {"id": client_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": actor["id"],
            # Анонимизираме email, за да освободим uniqueness без да губим връзка с резервациите
            "email": f"deleted+{client_id}@begestates.bg",
            "password_hash": None,
        }},
    )
    await log_action(
        actor["id"], "client_deleted", "user", client_id,
        {"original_email": target.get("email")},
    )
    return {"ok": True}


# ===========================================================================
# Admin CRUD за служители (само super_admin)
# ===========================================================================
from auth.security import hash_password as _hash_pw, generate_temp_password as _gen_temp  # noqa: E402,F811

_STAFF_ROLES_VALUES = {
    Role.SUPER_ADMIN.value, Role.ADMIN.value, Role.SALES.value,
    Role.PROJECT_MANAGER.value, Role.ACCOUNTING.value, Role.BROKER.value,
}


class AdminStaffCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=120)
    phone: Optional[str] = None
    role: str = Field(..., description="admin | sales | project_manager | accounting | broker")
    notes: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_clean(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Името трябва да е поне 2 символа")
        return v

    @field_validator("role")
    @classmethod
    def _role_clean(cls, v):
        if v not in _STAFF_ROLES_VALUES - {Role.SUPER_ADMIN.value}:
            raise ValueError("Невалидна роля (super_admin не може да се създава оттук)")
        return v


class AdminStaffUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("role")
    @classmethod
    def _role_clean(cls, v):
        if v is None:
            return v
        if v not in _STAFF_ROLES_VALUES - {Role.SUPER_ADMIN.value}:
            raise ValueError("Невалидна роля")
        return v


def _public_staff(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u["role"],
        "phone": u.get("phone", ""),
        "notes": u.get("staff_note") or u.get("client_note") or "",
        "is_active": u.get("is_active", True),
        "totp_setup_completed": bool(u.get("totp_setup_completed")),
        "must_change_password": bool(u.get("must_change_password")),
        "created_at": u.get("created_at"),
    }


@router.get("/admin/staff-users")
async def admin_list_staff(actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value))):
    db = get_db()
    users = await db.users.find(
        {"role": {"$in": list(_STAFF_ROLES_VALUES)}, "is_deleted": {"$ne": True}},
        {"_id": 0, "password_hash": 0, "totp_secret": 0},
    ).sort("created_at", -1).to_list(200)
    return [_public_staff(u) for u in users]


@router.post("/admin/staff-users")
async def admin_create_staff(
    payload: AdminStaffCreate,
    actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value)),
):
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Потребител с този имейл вече съществува")
    new_id = str(uuid.uuid4())
    temp_pw = _gen_temp()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": new_id,
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "phone": payload.phone or "",
        "staff_note": payload.notes or "",
        "password_hash": _hash_pw(temp_pw),
        "password_set_at": now,
        "must_change_password": True,
        "totp_setup_completed": False,
        "two_factor_enabled": False,
        "is_active": True,
        "is_deleted": False,
        "created_at": now,
        "created_by": actor["id"],
    }
    await db.users.insert_one(doc)
    await log_action(actor["id"], "staff_created", "user", new_id,
                     {"email": email, "role": payload.role})
    fresh = await db.users.find_one(
        {"id": new_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
    )
    return {"staff": _public_staff(fresh), "temp_password": temp_pw}


@router.patch("/admin/staff-users/{staff_id}")
async def admin_update_staff(
    staff_id: str, payload: AdminStaffUpdate,
    actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value)),
):
    db = get_db()
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] not in _STAFF_ROLES_VALUES:
        raise HTTPException(status_code=404, detail="Служителят не е намерен")
    if target.get("role") == Role.SUPER_ADMIN.value and payload.role and payload.role != Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=400, detail="Super admin ролята не може да се променя оттук")
    changes = payload.model_dump(exclude_unset=True)
    changes.pop("email", None)
    if "notes" in changes:
        changes["staff_note"] = changes.pop("notes") or ""
    await db.users.update_one({"id": staff_id}, {"$set": changes})
    await log_action(actor["id"], "staff_updated", "user", staff_id, {"fields": list(changes.keys())})
    fresh = await db.users.find_one({"id": staff_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
    return _public_staff(fresh)


@router.post("/admin/staff-users/{staff_id}/reset-password")
async def admin_reset_staff_password(
    staff_id: str, actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value)),
):
    db = get_db()
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] not in _STAFF_ROLES_VALUES:
        raise HTTPException(status_code=404, detail="Служителят не е намерен")
    temp_pw = _gen_temp()
    await db.users.update_one(
        {"id": staff_id},
        {"$set": {
            "password_hash": _hash_pw(temp_pw),
            "password_set_at": datetime.now(timezone.utc).isoformat(),
            "must_change_password": True,
        }},
    )
    await log_action(actor["id"], "staff_password_reset", "user", staff_id, {})
    return {"ok": True, "temp_password": temp_pw}


@router.post("/admin/staff-users/{staff_id}/reset-totp")
async def admin_reset_staff_totp(
    staff_id: str, actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value)),
):
    db = get_db()
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] not in _STAFF_ROLES_VALUES:
        raise HTTPException(status_code=404, detail="Служителят не е намерен")
    await db.users.update_one(
        {"id": staff_id},
        {"$set": {
            "totp_secret": None,
            "totp_setup_completed": False,
            "two_factor_enabled": False,
        }},
    )
    await log_action(actor["id"], "staff_totp_reset", "user", staff_id, {})
    return {"ok": True, "message": "TOTP е нулиран. При следващ login ще се поиска нов setup."}


@router.post("/admin/staff-users/{staff_id}/deactivate")
async def admin_deactivate_staff(
    staff_id: str, actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value)),
):
    db = get_db()
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] not in _STAFF_ROLES_VALUES:
        raise HTTPException(status_code=404, detail="Служителят не е намерен")
    if target["id"] == actor["id"]:
        raise HTTPException(status_code=400, detail="Не може да деактивирате собствения си акаунт")
    await db.users.update_one(
        {"id": staff_id}, {"$set": {"is_active": False}},
    )
    await log_action(actor["id"], "staff_deactivated", "user", staff_id, {})
    return {"ok": True}


@router.post("/admin/staff-users/{staff_id}/activate")
async def admin_activate_staff(
    staff_id: str, actor: dict = Depends(require_roles(Role.SUPER_ADMIN.value)),
):
    db = get_db()
    target = await db.users.find_one({"id": staff_id})
    if not target or target["role"] not in _STAFF_ROLES_VALUES:
        raise HTTPException(status_code=404, detail="Служителят не е намерен")
    await db.users.update_one({"id": staff_id}, {"$set": {"is_active": True}})
    await log_action(actor["id"], "staff_activated", "user", staff_id, {})
    return {"ok": True}
