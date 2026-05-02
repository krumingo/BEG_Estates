"""Pydantic schemas for request/response models."""
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------- Auth ----------
class StaffLoginRequest(BaseModel):
    """Staff login: email + парола (без TOTP)."""
    email: EmailStr
    password: str


class ClientLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=12)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=12)


class AdminSetClientPasswordRequest(BaseModel):
    """Admin задава директно парола на клиент (без reset flow)."""
    new_password: str = Field(..., min_length=8)
    force_change: bool = True


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str


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
    code: str
    property_type: str
    floor: Optional[int] = 0
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
    description: Optional[str] = ""
    plan_url: Optional[str] = None
    gallery: List[str] = Field(default_factory=list)
    status: Optional[str] = None  # default AVAILABLE when None
    buyer_id: Optional[str] = None
    admin_notes: Optional[str] = ""

    @field_validator(
        "area_pure", "area_common", "area_total", "ideal_parts_area", "raw_area",
        "price_per_sqm", "base_price", "list_price",
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
    def _code_clean(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("code не може да е празен")
        return v

    @field_validator("project_id")
    @classmethod
    def _project_id_non_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("project_id е задължителен")
        return v


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
    client_id: Optional[str] = None  # admin passes; client uses self
    reservation_type: str = "zero_deposit"
    amount: Optional[float] = None
    notes: Optional[str] = ""

    @field_validator("amount")
    @classmethod
    def _amount_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("amount трябва да е >= 0")
        return v


class ReservationExtendRequest(BaseModel):
    days: int

    @field_validator("days")
    @classmethod
    def _days_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("days трябва да е > 0")
        return v


class ReservationConvertDepositRequest(BaseModel):
    amount: float
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def _amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount трябва да е > 0")
        return v


# ---------- Inquiries ----------
class InquiryCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    message: str
    project_id: Optional[str] = None
    property_id: Optional[str] = None


# ---------- Property finance (deal view) ----------
class PropertyInstallmentInput(BaseModel):
    number: int
    label: Optional[str] = None
    due_date: str  # ISO date/datetime string
    amount: float = 0.0
    status: Optional[str] = None  # "платено" / "предстоящо" (default)

    @field_validator("amount")
    @classmethod
    def _amount_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("amount трябва да е >= 0")
        return v

    @field_validator("number")
    @classmethod
    def _number_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("number трябва да е >= 1")
        return v

    @field_validator("due_date")
    @classmethod
    def _due_date_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("due_date е задължителен")
        return v.strip()


class PropertyFinancePlanUpdate(BaseModel):
    buyer_id: Optional[str] = None
    final_contract_price: float = 0.0
    deposit_amount: float = 0.0
    payment_scheme_name: Optional[str] = ""
    installments: List[PropertyInstallmentInput] = Field(default_factory=list)

    @field_validator("final_contract_price", "deposit_amount")
    @classmethod
    def _non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Стойността трябва да е >= 0")
        return v


class PropertyPaymentCreate(BaseModel):
    amount: float
    paid_at: str
    note: Optional[str] = ""

    @field_validator("amount")
    @classmethod
    def _amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount трябва да е > 0")
        return v

    @field_validator("paid_at")
    @classmethod
    def _paid_at_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("paid_at е задължителен")
        return v.strip()
