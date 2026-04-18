"""Pydantic schemas for request/response models."""
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


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
    description: Optional[str] = ""
    status: str = ProjectStatus.UNDER_CONSTRUCTION.value
    completion_date: Optional[str] = None
    cover_image: Optional[str] = None
    gallery: List[str] = Field(default_factory=list)
    lat: Optional[float] = None
    lng: Optional[float] = None
    progress_percent: int = 0


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
