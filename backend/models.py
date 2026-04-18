"""Pydantic schemas for request/response models."""
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------- Auth ----------
class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None


class ClientOtpRequest(BaseModel):
    email: EmailStr


class ClientOtpVerify(BaseModel):
    email: EmailStr
    code: str


class TotpSetupVerify(BaseModel):
    code: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str
    two_factor_enabled: bool = False


from constants import ProjectStatus


# ---------- Projects ----------
class ProjectCreate(BaseModel):
    name: str
    slug: str
    city: str
    address: str
    short_description: Optional[str] = ""
    description: Optional[str] = ""
    status: str = ProjectStatus.UNDER_CONSTRUCTION.value
    completion_date: Optional[str] = None
    cover_image: Optional[str] = None
    gallery: List[str] = Field(default_factory=list)
    lat: Optional[float] = None
    lng: Optional[float] = None
    progress_percent: int = 0
    is_primary: bool = False

    @field_validator("slug")
    @classmethod
    def _slug_clean(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("slug не може да е празен")
        if " " in v or "/" in v:
            raise ValueError("slug трябва да е без интервали и наклонени черти")
        return v

    @field_validator("progress_percent")
    @classmethod
    def _progress_range(cls, v: int) -> int:
        if v < 0 or v > 100:
            raise ValueError("progress_percent трябва да е между 0 и 100")
        return v


class ProjectUpdate(BaseModel):
    """Partial update — всички полета са optional."""
    name: Optional[str] = None
    slug: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    completion_date: Optional[str] = None
    cover_image: Optional[str] = None
    gallery: Optional[List[str]] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    progress_percent: Optional[int] = None
    is_primary: Optional[bool] = None

    @field_validator("slug")
    @classmethod
    def _slug_clean(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("slug не може да е празен")
        if " " in v or "/" in v:
            raise ValueError("slug трябва да е без интервали и наклонени черти")
        return v

    @field_validator("progress_percent")
    @classmethod
    def _progress_range(cls, v):
        if v is None:
            return v
        if v < 0 or v > 100:
            raise ValueError("progress_percent трябва да е между 0 и 100")
        return v


# ---------- Properties ----------
class PropertyCreate(BaseModel):
    project_id: str
    building_id: Optional[str] = None
    floor: int = 0
    code: str
    property_type: str
    rooms: Optional[int] = None
    area_pure: Optional[float] = None
    area_common: Optional[float] = None
    area_total: Optional[float] = None
    exposure: Optional[str] = None
    price_per_sqm: Optional[float] = None
    price_total: Optional[float] = None
    description: Optional[str] = ""
    plan_url: Optional[str] = None
    gallery: List[str] = Field(default_factory=list)


class PropertyStatusUpdate(BaseModel):
    status: str


class PropertyUpdate(BaseModel):
    """Partial property edit — всички полета са optional.
    Никога не позволява редакция на project_id/building_id/source_ref/linked_unit_ids."""
    code: Optional[str] = None
    property_type: Optional[str] = None
    floor: Optional[int] = None
    rooms: Optional[int] = None
    exposure: Optional[str] = None
    area_pure: Optional[float] = None
    area_common: Optional[float] = None
    area_total: Optional[float] = None
    ideal_parts_area: Optional[float] = None
    raw_area: Optional[float] = None
    price_per_sqm: Optional[float] = None
    base_price: Optional[float] = None
    list_price: Optional[float] = None
    negotiated_price: Optional[float] = None
    reservation_price: Optional[float] = None
    final_contract_price: Optional[float] = None
    description: Optional[str] = None
    plan_url: Optional[str] = None
    gallery: Optional[List[str]] = None
    status: Optional[str] = None
    buyer_id: Optional[str] = None
    admin_notes: Optional[str] = None

    @field_validator(
        "area_pure", "area_common", "area_total", "ideal_parts_area", "raw_area",
        "price_per_sqm", "base_price", "list_price", "negotiated_price",
        "reservation_price", "final_contract_price",
    )
    @classmethod
    def _non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Стойността трябва да е >= 0")
        return v

    @field_validator("rooms")
    @classmethod
    def _rooms_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Броят стаи трябва да е >= 0")
        return v

    @field_validator("code")
    @classmethod
    def _code_clean(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("code не може да е празен")
        return v


# ---------- Reservations ----------
class ReservationCreate(BaseModel):
    property_id: str
    client_id: Optional[str] = None  # admin can pass; client uses self
    reservation_type: str = "zero_deposit"
    notes: Optional[str] = ""


# ---------- Inquiries ----------
class InquiryCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    message: str
    project_id: Optional[str] = None
    property_id: Optional[str] = None
