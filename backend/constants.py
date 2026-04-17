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
    FREE = "свободен"
    RESERVED_ZERO = "резервиран_капаро_0"
    RESERVED_DEPOSIT = "резервиран_с_капаро"
    PRELIMINARY = "предварителен_договор"
    SOLD = "продаден"


class PropertyType(str, Enum):
    APARTMENT = "apartment"
    GARAGE = "garage"
    PARKING = "parking"
    STORAGE = "storage"
    HOUSE = "house"


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
    PLANNING = "планиран"
    UNDER_CONSTRUCTION = "в_строеж"
    COMPLETED = "завършен"


PROPERTY_TYPE_LABELS_BG = {
    PropertyType.APARTMENT.value: "Апартамент",
    PropertyType.GARAGE.value: "Гараж",
    PropertyType.PARKING.value: "Паркомясто",
    PropertyType.STORAGE.value: "Склад",
    PropertyType.HOUSE.value: "Къща",
}
