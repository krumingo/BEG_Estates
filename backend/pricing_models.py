"""G.2.2A: Pricing Models за площообразуване."""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class FloorPriceCorrection(BaseModel):
    floor: int
    price_per_sqm: float

    @field_validator("price_per_sqm")
    @classmethod
    def _ppm_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Цена/м² не може да е отрицателна")
        return v


class TypePriceOverride(BaseModel):
    property_type: str
    price_per_sqm: float

    @field_validator("price_per_sqm")
    @classmethod
    def _ppm_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Цена/м² не може да е отрицателна")
        return v


class ProjectPricingSettings(BaseModel):
    """Pricing settings per проект.
    Resolution priority: manual_override → type → floor → base
    """
    base_price_per_sqm: Optional[float] = None
    vat_rate: float = 20.0
    floor_corrections: List[FloorPriceCorrection] = Field(default_factory=list)
    type_overrides: List[TypePriceOverride] = Field(default_factory=list)

    @field_validator("vat_rate")
    @classmethod
    def _vat_range(cls, v: float) -> float:
        if v < 0 or v > 100:
            raise ValueError("ДДС % трябва да е между 0 и 100")
        return v

    @field_validator("base_price_per_sqm")
    @classmethod
    def _base_non_negative(cls, v):
        if v is None:
            return v
        if v < 0:
            raise ValueError("Базова цена/м² не може да е отрицателна")
        return v


class BulkRecalcRequest(BaseModel):
    project_id: str
    apply_to_types: List[str] = Field(
        default_factory=lambda: ["apartment", "garage", "parking",
                                 "yard_parking", "shop", "storage"]
    )
    overwrite_overrides: bool = False
    only_codes: Optional[List[str]] = None
    dry_run: bool = False


class BulkRecalcResultItem(BaseModel):
    code: str
    property_type: str
    floor: Optional[int] = None
    area_total: Optional[float] = None
    old_list_price: Optional[float] = None
    new_list_price: Optional[float] = None
    delta: Optional[float] = None
    used_pricing_source: str
    skipped: bool = False
    skip_reason: Optional[str] = None


class BulkRecalcResult(BaseModel):
    project_id: str
    dry_run: bool
    total_properties: int
    updated_count: int
    skipped_count: int
    items: List[BulkRecalcResultItem]
