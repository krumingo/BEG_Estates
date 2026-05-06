"""Pure helpers for sale amount calculations and validation.

Used by sales endpoints + auto-seed migration. No DB access here.
"""
from typing import Optional


def calculate_invoice_breakdown(invoice_amount: float, vat_rate: float = 20.0) -> dict:
    """Split invoice amount (with VAT) into net + VAT amount.

    Formula:
        vat_amount = invoice_amount × vat_rate / (100 + vat_rate)
        net = invoice_amount - vat_amount
    """
    if not invoice_amount or invoice_amount <= 0:
        return {"net": 0.0, "vat_amount": 0.0}
    vat_amount = round(invoice_amount * vat_rate / (100.0 + vat_rate), 2)
    net = round(invoice_amount - vat_amount, 2)
    return {"net": net, "vat_amount": vat_amount}


def calculate_real_total(invoice_amount: float, proforma_amount: float = 0.0) -> float:
    """Total real cash = invoice (declared) + proforma (undeclared)."""
    return round(float(invoice_amount or 0) + float(proforma_amount or 0), 2)


def validate_sale_amounts(
    property_listprice: float,
    invoice_amount: float,
    proforma_amount: float = 0.0,
    tolerance: float = 0.01,
) -> dict:
    """Validate amounts vs listprice. Returns {valid, warnings, errors}.

    Rules:
    - non-negative amounts
    - real_total > 0
    - real_total > listprice → ERROR (sum exceeds listing)
    - real_total < listprice → WARNING (discount applied)
    """
    warnings: list[str] = []
    errors: list[str] = []

    inv = float(invoice_amount or 0)
    pro = float(proforma_amount or 0)

    if inv < 0:
        errors.append("Сумата по фактура не може да е отрицателна")
    if pro < 0:
        errors.append("Сумата по проформа не може да е отрицателна")

    real_total = calculate_real_total(inv, pro)
    if real_total <= 0:
        errors.append("Реалната сума трябва да е > 0")

    if errors:
        return {"valid": False, "warnings": warnings, "errors": errors}

    listprice = float(property_listprice or 0)
    if listprice > 0:
        diff = real_total - listprice
        if diff > tolerance:
            errors.append(
                f"Реалната сума ({real_total:,.2f} €) надвишава "
                f"листовата ({listprice:,.2f} €) с {diff:,.2f} €"
            )
            return {"valid": False, "warnings": warnings, "errors": errors}
        if diff < -tolerance:
            warnings.append(
                f"Отстъпка от {abs(diff):,.2f} € спрямо листовата цена "
                f"({listprice:,.2f} €)"
            )

    return {"valid": True, "warnings": warnings, "errors": []}
