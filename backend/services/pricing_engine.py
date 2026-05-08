"""G.2.2A: Pricing Engine — изчислителна логика за площообразуване."""
from typing import Optional, Tuple


SOURCE_MANUAL_OVERRIDE = "manual_override"
SOURCE_TYPE_OVERRIDE = "type_override"
SOURCE_FLOOR_CORRECTION = "floor_correction"
SOURCE_BASE = "base"
SOURCE_NONE = "none"


def resolve_price_per_sqm(property_doc, pricing_settings=None):
    """Determine price_per_sqm. Priority: manual → type → floor → base."""
    manual = property_doc.get("price_per_sqm")
    if manual is not None and float(manual) > 0:
        return float(manual), SOURCE_MANUAL_OVERRIDE

    if not pricing_settings:
        return None, SOURCE_NONE

    prop_type = property_doc.get("property_type")
    floor = property_doc.get("floor")

    if prop_type and prop_type != "apartment":
        for to in (pricing_settings.get("type_overrides") or []):
            if to.get("property_type") == prop_type:
                ppm = to.get("price_per_sqm")
                if ppm is not None:
                    return float(ppm), SOURCE_TYPE_OVERRIDE

    if floor is not None:
        for fc in (pricing_settings.get("floor_corrections") or []):
            if fc.get("floor") == floor:
                ppm = fc.get("price_per_sqm")
                if ppm is not None:
                    return float(ppm), SOURCE_FLOOR_CORRECTION

    base = pricing_settings.get("base_price_per_sqm")
    if base is not None and float(base) > 0:
        return float(base), SOURCE_BASE

    return None, SOURCE_NONE


def calculate_list_price(property_doc, pricing_settings=None):
    """list_price = price_per_sqm × area_total (БЕЗ ДДС)."""
    ppm, source = resolve_price_per_sqm(property_doc, pricing_settings)
    if ppm is None:
        return None, source

    area = property_doc.get("area_total")
    if area is None or float(area) <= 0:
        return None, "no_area"

    return round(float(ppm) * float(area), 2), source


def calculate_display_price_with_vat(list_price_net, vat_rate=20.0):
    """Display цена С ДДС за публичен сайт."""
    if list_price_net is None:
        return None
    return round(float(list_price_net) * (1.0 + float(vat_rate) / 100.0), 2)


def bulk_recalc_properties(properties, pricing_settings, apply_to_types=None,
                           overwrite_overrides=False, only_codes=None):
    """Pure function — calculates new prices без да пише в DB."""
    if apply_to_types is None:
        apply_to_types = ["apartment", "garage", "parking", "yard_parking", "shop", "storage"]

    results = []
    for p in properties:
        code = p.get("code", "")
        prop_type = p.get("property_type", "")
        floor = p.get("floor")
        area = p.get("area_total")
        old_lp = p.get("list_price") if p.get("list_price") is not None else p.get("base_price")
        manual_override = p.get("price_per_sqm")

        item = {
            "code": code, "property_type": prop_type, "floor": floor,
            "area_total": area, "old_list_price": old_lp,
            "new_list_price": None, "delta": None,
            "used_pricing_source": SOURCE_NONE,
            "skipped": False, "skip_reason": None,
        }

        if only_codes and code not in only_codes:
            item["skipped"] = True
            item["skip_reason"] = "не е в only_codes"
            results.append(item)
            continue

        if prop_type not in apply_to_types:
            item["skipped"] = True
            item["skip_reason"] = f"типът {prop_type} не е в apply_to_types"
            results.append(item)
            continue

        if not area or float(area) <= 0:
            item["skipped"] = True
            item["skip_reason"] = "няма area_total"
            results.append(item)
            continue

        if manual_override is not None and not overwrite_overrides:
            new_lp, source = calculate_list_price(p, pricing_settings)
            item["new_list_price"] = new_lp
            item["used_pricing_source"] = source
            item["delta"] = round((new_lp or 0) - (old_lp or 0), 2) if new_lp is not None else None
            results.append(item)
            continue

        new_lp, source = calculate_list_price(p, pricing_settings)
        item["new_list_price"] = new_lp
        item["used_pricing_source"] = source
        if new_lp is None:
            item["skipped"] = True
            item["skip_reason"] = f"не може да се определи цена ({source})"
        else:
            item["delta"] = round(new_lp - (old_lp or 0), 2)

        results.append(item)

    return results


def hadzhi_dimitar_default_pricing():
    """Default pricing settings за Хаджи Димитър."""
    return {
        "base_price_per_sqm": 2200.0,
        "vat_rate": 20.0,
        "floor_corrections": [
            {"floor": 1, "price_per_sqm": 2200.0},
            {"floor": 2, "price_per_sqm": 2280.0},
            {"floor": 3, "price_per_sqm": 2360.0},
            {"floor": 4, "price_per_sqm": 2440.0},
            {"floor": 5, "price_per_sqm": 2520.0},
            {"floor": 6, "price_per_sqm": 2600.0},
            {"floor": 7, "price_per_sqm": 2680.0},
        ],
        "type_overrides": [
            {"property_type": "shop", "price_per_sqm": 2131.0},
            {"property_type": "garage", "price_per_sqm": 1212.0},
            {"property_type": "parking", "price_per_sqm": 760.0},
            {"property_type": "yard_parking", "price_per_sqm": 600.0},
            {"property_type": "storage", "price_per_sqm": 350.0},
        ],
    }
