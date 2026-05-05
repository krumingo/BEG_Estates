"""Shared enums/constants for the EstateFlow platform."""
from enum import Enum


class Role(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    SALES = "sales"
    ACCOUNTING = "accounting"
    PROJECT_MANAGER = "project_manager"
    CLIENT = "client"
    BROKER = "broker"


STAFF_ROLES = {
    Role.SUPER_ADMIN.value,
    Role.ADMIN.value,
    Role.SALES.value,
    Role.ACCOUNTING.value,
    Role.PROJECT_MANAGER.value,
    Role.BROKER.value,
}


class PropertyStatus(str, Enum):
    """Normalized english keys; Bulgarian labels live in PROPERTY_STATUS_LABELS."""
    AVAILABLE = "available"
    RESERVED_ZERO_DEPOSIT = "reserved_zero_deposit"
    RESERVED_PAID_DEPOSIT = "reserved_paid_deposit"
    SOLD = "sold"
    COMPENSATION = "compensation"
    UNAVAILABLE = "unavailable"
    HIDDEN = "hidden"


PROPERTY_STATUS_LABELS = {
    PropertyStatus.AVAILABLE.value: "Свободен",
    PropertyStatus.RESERVED_ZERO_DEPOSIT.value: "Резервиран · Капаро 0",
    PropertyStatus.RESERVED_PAID_DEPOSIT.value: "Резервиран · Капаро",
    PropertyStatus.SOLD.value: "Продаден",
    PropertyStatus.COMPENSATION.value: "Обезщетение",
    PropertyStatus.UNAVAILABLE.value: "Недостъпен",
    PropertyStatus.HIDDEN.value: "Скрит",
}

# Public-visible statuses — ONLY these may ever reach a public caller.
# `compensation` is masked as "sold" publicly. `unavailable` and `hidden` stay internal-only.
PUBLIC_VISIBLE_STATUSES = frozenset({
    PropertyStatus.AVAILABLE.value,
    PropertyStatus.RESERVED_ZERO_DEPOSIT.value,
    PropertyStatus.RESERVED_PAID_DEPOSIT.value,
    PropertyStatus.SOLD.value,
    PropertyStatus.COMPENSATION.value,
})

INTERNAL_STATUSES = frozenset({
    PropertyStatus.UNAVAILABLE.value,
    PropertyStatus.HIDDEN.value,
})

# Statuses that get masked as "sold" when leaving the public boundary.
PUBLIC_SOLD_MASK_STATUSES = frozenset({
    PropertyStatus.COMPENSATION.value,
})

# Statuses that allow zero-deposit reservation
RESERVABLE_STATUSES = {PropertyStatus.AVAILABLE.value}

# Mapping reservation_type -> new property status
RESERVATION_TYPE_TO_STATUS = {
    "zero_deposit": PropertyStatus.RESERVED_ZERO_DEPOSIT.value,
    "deposit": PropertyStatus.RESERVED_PAID_DEPOSIT.value,
    "preliminary": PropertyStatus.RESERVED_PAID_DEPOSIT.value,
}


class PropertyType(str, Enum):
    APARTMENT = "apartment"
    GARAGE = "garage"
    PARKING = "parking"
    YARD_PARKING = "yard_parking"
    STORAGE = "storage"
    HOUSE = "house"
    SHOP = "shop"


PROPERTY_TYPE_LABELS_BG = {
    PropertyType.APARTMENT.value: "Апартамент",
    PropertyType.GARAGE.value: "Гараж",
    PropertyType.PARKING.value: "Паркомясто",
    PropertyType.YARD_PARKING.value: "Дворно паркомясто",
    PropertyType.STORAGE.value: "Склад",
    PropertyType.HOUSE.value: "Къща",
    PropertyType.SHOP.value: "Магазин",
}


class ReservationType(str, Enum):
    ZERO_DEPOSIT = "zero_deposit"
    DEPOSIT = "deposit"
    PRELIMINARY = "preliminary"


class ReservationStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CONVERTED = "converted"
    CANCELLED = "cancelled"


class ProjectStatus(str, Enum):
    PLANNED = "planned"
    UNDER_CONSTRUCTION = "under_construction"
    COMPLETED = "completed"


PROJECT_STATUS_LABELS = {
    ProjectStatus.PLANNED.value: "Планиран",
    ProjectStatus.UNDER_CONSTRUCTION.value: "В строеж",
    ProjectStatus.COMPLETED.value: "Завършен",
}

# Public-safe property fields — any field outside this list is stripped on public endpoints
PUBLIC_PROPERTY_FIELDS = {
    "id", "project_id", "building_id", "floor", "code", "property_type",
    "rooms", "area_pure", "area_common", "area_total", "ideal_parts_area",
    "exposure", "price_per_sqm", "list_price", "base_price",
    "description", "plan_url", "gallery", "status", "linked_unit_ids", "created_at",
}

# Schema version tag — bump to force reseed
SEED_VERSION = "hd-v2-source-driven-r1"
