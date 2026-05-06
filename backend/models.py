"""Pydantic schemas for request/response models."""
from typing import Optional, List, Literal, Dict
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
class ProjectExpenseEstimate(BaseModel):
    """Прогнозен разход по етапи на строителството (super_admin only)."""
    total: Optional[float] = None
    foundation: Optional[float] = None
    rough_construction: Optional[float] = None
    finishing: Optional[float] = None
    notes: Optional[str] = None


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
    expected_act_2_date: Optional[str] = None
    construction_duration_months: int = 30

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
    expected_act_2_date: Optional[str] = None
    construction_duration_months: Optional[int] = None
    expense_estimate: Optional[ProjectExpenseEstimate] = None
    total_rzp_area: Optional[float] = None

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


# ---------- Clients (unified buyer + login client directory) ----------
_CLIENT_TYPES = {"buyer", "investor", "company", "compensation"}


class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    egn: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    client_type: str = "buyer"

    @field_validator("name")
    @classmethod
    def _name_not_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Името е задължително")
        return v

    @field_validator("client_type")
    @classmethod
    def _client_type_valid(cls, v: str) -> str:
        if v not in _CLIENT_TYPES:
            raise ValueError("Невалиден тип клиент")
        return v


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    egn: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    client_type: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_not_empty(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Името не може да е празно")
        return v

    @field_validator("client_type")
    @classmethod
    def _client_type_valid(cls, v):
        if v is None:
            return v
        if v not in _CLIENT_TYPES:
            raise ValueError("Невалиден тип клиент")
        return v


# ---------- Quotes ----------
_QUOTE_VAT_MODES = {"with_vat", "without_vat"}
_QUOTE_STATUSES = {"draft", "sent", "accepted", "rejected", "expired"}


class QuoteItemInput(BaseModel):
    """Per-item inputs accepted on PUT (admin overrides)."""
    property_id: str
    custom_price: Optional[float] = None
    discount_percent: Optional[float] = None
    notes: Optional[str] = None

    @field_validator("custom_price")
    @classmethod
    def _price_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Цената трябва да е >= 0")
        return v

    @field_validator("discount_percent")
    @classmethod
    def _discount_range(cls, v):
        if v is None:
            return v
        if v < 0 or v > 100:
            raise ValueError("Отстъпката трябва да е 0-100%")
        return v


class QuoteCreate(BaseModel):
    client_id: str
    property_ids: List[str]
    vat_mode: str = "with_vat"
    valid_until: Optional[str] = None  # ISO date; if None → today + 14 days
    discount_amount: Optional[float] = 0.0
    additional_notes: Optional[str] = None
    scheme_type: str = "standard"  # standard | with_bank | custom
    stop_deposit_amount: Optional[float] = 0.0

    @field_validator("vat_mode")
    @classmethod
    def _vat_mode_valid(cls, v):
        if v not in _QUOTE_VAT_MODES:
            raise ValueError("Невалиден ДДС режим")
        return v

    @field_validator("scheme_type")
    @classmethod
    def _scheme_valid(cls, v):
        if v not in {"standard", "with_bank", "custom"}:
            raise ValueError("Невалиден тип схема")
        return v

    @field_validator("property_ids")
    @classmethod
    def _at_least_one(cls, v):
        if not v:
            raise ValueError("Трябва да изберете поне един имот")
        return v


class PaymentStageInput(BaseModel):
    order: int
    label: str
    percent: float
    amount: Optional[float] = None  # auto-calculated if None
    expected_date: Optional[str] = None
    milestone_type: Optional[str] = None
    description: Optional[str] = None
    is_deposit: bool = False


class PaymentScheduleInput(BaseModel):
    scheme_type: Optional[str] = None
    stop_deposit_amount: Optional[float] = None
    expected_act_2_date: Optional[str] = None
    notes: Optional[str] = None
    stages: Optional[List[PaymentStageInput]] = None


class QuoteUpdate(BaseModel):
    items: Optional[List[QuoteItemInput]] = None
    vat_mode: Optional[str] = None
    vat_rate: Optional[float] = None
    discount_amount: Optional[float] = None
    valid_until: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    additional_notes: Optional[str] = None
    payment_schedule: Optional[PaymentScheduleInput] = None
    reset_schedule_to: Optional[str] = None  # standard | with_bank | custom

    @field_validator("vat_mode")
    @classmethod
    def _vat_mode_valid(cls, v):
        if v is None:
            return v
        if v not in _QUOTE_VAT_MODES:
            raise ValueError("Невалиден ДДС режим")
        return v

    @field_validator("vat_rate", "discount_amount")
    @classmethod
    def _non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Стойността трябва да е >= 0")
        return v


class QuoteStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _status_valid(cls, v):
        if v not in _QUOTE_STATUSES:
            raise ValueError("Невалиден статус")
        return v


# ---------- Deals (per-client multi-property sale) ----------
_DEAL_PAYMENT_MODES = {"bank_loan", "own_funds", "combined"}
_DEAL_STATUSES = {"active", "completed", "cancelled"}
_DEAL_BUCKETS = {"bank", "own"}
_DEAL_REGEN_PRESETS = {"standard", "with_bank", "custom"}


class DealCreate(BaseModel):
    client_id: str
    property_ids: List[str]
    agreed_prices: Optional[Dict[str, float]] = None
    payment_mode: str = "own_funds"
    source_quote_id: Optional[str] = None

    @field_validator("property_ids")
    @classmethod
    def _at_least_one_prop(cls, v):
        if not v:
            raise ValueError("Трябва да изберете поне един имот")
        return v

    @field_validator("payment_mode")
    @classmethod
    def _mode_valid(cls, v):
        if v not in _DEAL_PAYMENT_MODES:
            raise ValueError("Невалиден тип плащане")
        return v


class DealItemUpdate(BaseModel):
    property_id: str
    agreed_price: Optional[float] = None
    notes: Optional[str] = None

    @field_validator("agreed_price")
    @classmethod
    def _price_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Цената трябва да е >= 0")
        return v


class DealPaymentModeInput(BaseModel):
    mode: Optional[str] = None
    # combined split
    bank_amount: Optional[float] = None
    own_amount: Optional[float] = None
    # bank invoice/proforma split (works for bank_loan + combined)
    bank_invoice_amount: Optional[float] = None
    bank_proforma_amount: Optional[float] = None
    # own invoice/proforma split (works for own_funds + combined)
    own_invoice_amount: Optional[float] = None
    own_proforma_amount: Optional[float] = None

    @field_validator("mode")
    @classmethod
    def _mode_valid(cls, v):
        if v is None:
            return v
        if v not in _DEAL_PAYMENT_MODES:
            raise ValueError("Невалиден тип плащане")
        return v

    @field_validator(
        "bank_amount", "own_amount",
        "bank_invoice_amount", "bank_proforma_amount",
        "own_invoice_amount", "own_proforma_amount",
    )
    @classmethod
    def _non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Стойността трябва да е >= 0")
        return v


class DealStageInput(BaseModel):
    order: int
    label: str
    percent: Optional[float] = None
    amount: Optional[float] = None
    expected_date: Optional[str] = None
    milestone_type: Optional[str] = None
    bucket: str = "own"
    is_paid: Optional[bool] = None
    paid_date: Optional[str] = None
    paid_amount: Optional[float] = None
    payment_notes: Optional[str] = None

    @field_validator("bucket")
    @classmethod
    def _bucket_valid(cls, v):
        if v not in _DEAL_BUCKETS:
            raise ValueError("Невалиден bucket")
        return v


class DealUpdate(BaseModel):
    items: Optional[List[DealItemUpdate]] = None
    payment_mode: Optional[DealPaymentModeInput] = None
    bank_stages: Optional[List[DealStageInput]] = None
    own_stages: Optional[List[DealStageInput]] = None
    vat_rate: Optional[float] = None
    notes: Optional[str] = None
    expected_act_2_date: Optional[str] = None
    construction_duration_months: Optional[int] = None

    @field_validator("vat_rate")
    @classmethod
    def _vat_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("ДДС % трябва да е >= 0")
        return v


class DealRegenerateScheduleRequest(BaseModel):
    bucket: str = "own"
    preset: str = "standard"

    @field_validator("bucket")
    @classmethod
    def _bucket_valid(cls, v):
        if v not in _DEAL_BUCKETS and v != "both":
            raise ValueError("bucket трябва да е bank, own или both")
        return v

    @field_validator("preset")
    @classmethod
    def _preset_valid(cls, v):
        if v not in _DEAL_REGEN_PRESETS:
            raise ValueError("preset трябва да е standard, with_bank или custom")
        return v


class DealStagePaymentUpdate(BaseModel):
    bucket: str = "own"
    is_paid: Optional[bool] = None
    paid_date: Optional[str] = None
    paid_amount: Optional[float] = None
    payment_notes: Optional[str] = None

    @field_validator("bucket")
    @classmethod
    def _bucket_valid(cls, v):
        if v not in _DEAL_BUCKETS:
            raise ValueError("Невалиден bucket")
        return v

    @field_validator("paid_amount")
    @classmethod
    def _amount_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Сумата трябва да е >= 0")
        return v


class DealSuggestRequest(BaseModel):
    field: str
    value: float

    @field_validator("field")
    @classmethod
    def _field_valid(cls, v):
        valid = {
            "bank_amount", "own_amount",
            "bank_invoice_amount", "bank_proforma_amount",
            "own_invoice_amount", "own_proforma_amount",
        }
        if v not in valid:
            raise ValueError(f"field трябва да е едно от: {sorted(valid)}")
        return v

    @field_validator("value")
    @classmethod
    def _value_non_negative(cls, v):
        if v < 0:
            raise ValueError("value трябва да е >= 0")
        return v


class DealCancelRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_required(cls, v):
        if not v or not v.strip():
            raise ValueError("Причината е задължителна")
        return v.strip()


class DealDeleteRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_required(cls, v):
        if not v or not v.strip():
            raise ValueError("Причината е задължителна")
        return v.strip()
