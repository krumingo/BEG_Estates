"""Payment scheme builders for Quote Builder.

Standard schemes for "Билдинг Експрес Груп" residential projects.
All amounts/dates are auto-populated from project data, but admin can
override every field per quote.
"""
from datetime import date, datetime, timedelta
from typing import Optional

_BG_MONTHS = [
    "Януари", "Февруари", "Март", "Април", "Май", "Юни",
    "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември",
]


def fmt_bg_month_year(d: Optional[date]) -> str:
    if not d:
        return "—"
    return f"{_BG_MONTHS[d.month - 1]} {d.year}"


def _parse_iso_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        return date.fromisoformat(s)
    except Exception:
        return None


def _add_days(d: Optional[date], days: int) -> Optional[str]:
    if not d:
        return None
    return (d + timedelta(days=days)).isoformat()


def build_standard_scheme(total: float, project: Optional[dict] = None) -> dict:
    """8-stage standard scheme (без банков кредит): 20/15/15/10/10/10/10/10."""
    act_2 = _parse_iso_date((project or {}).get("expected_act_2_date"))
    today_iso = date.today().isoformat()

    stages = [
        {
            "order": 1, "label": "Капаро (задатък)", "percent": 20.0,
            "amount": round(total * 0.20, 2),
            "milestone_type": "signing", "expected_date": today_iso,
            "is_deposit": True,
            "description": "при подписване на предварителен договор",
        },
        {
            "order": 2, "label": "Изкопни работи", "percent": 15.0,
            "amount": round(total * 0.15, 2),
            "milestone_type": "excavation", "expected_date": _add_days(act_2, 30),
            "is_deposit": False,
            "description": "при започване на изкопните работи",
        },
        {
            "order": 3, "label": "Кота 0 (фундамент)", "percent": 15.0,
            "amount": round(total * 0.15, 2),
            "milestone_type": "kota_0", "expected_date": _add_days(act_2, 120),
            "is_deposit": False,
            "description": "при достигане на завършеност на етап „кота 0\"",
        },
        {
            "order": 4, "label": "Кота +6.29 (3 етаж)", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "intermediate", "expected_date": _add_days(act_2, 240),
            "is_deposit": False,
            "description": "при достигане на завършеност на етап „кота +6.29\"",
        },
        {
            "order": 5, "label": "Кота +12.07 (5 етаж)", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "intermediate", "expected_date": _add_days(act_2, 360),
            "is_deposit": False,
            "description": "при достигане на завършеност на етап „кота +12.07\"",
        },
        {
            "order": 6, "label": "Кота +17.85 (покрив)", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "intermediate", "expected_date": _add_days(act_2, 540),
            "is_deposit": False,
            "description": "при завършване на покрива",
        },
        {
            "order": 7, "label": "Акт 14 (груб строеж)", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "act_14", "expected_date": _add_days(act_2, 720),
            "is_deposit": False,
            "description": "след получаване на Акт 14",
        },
        {
            "order": 8, "label": "Удостоверение за въвеждане в експлоатация",
            "percent": 10.0, "amount": round(total * 0.10, 2),
            "milestone_type": "act_16", "expected_date": _add_days(act_2, 900),
            "is_deposit": False,
            "description": "след издаване на Удостоверение за въвеждане в експлоатация",
        },
    ]
    return {
        "scheme_type": "standard",
        "stages": stages,
        "expected_act_2_date": act_2.isoformat() if act_2 else None,
        "stop_deposit_amount": 0.0,
        "notes": None,
    }


def build_bank_scheme(total: float, project: Optional[dict] = None) -> dict:
    """4-stage bank-credit scheme: 10/10/10/70."""
    act_2 = _parse_iso_date((project or {}).get("expected_act_2_date"))
    today_iso = date.today().isoformat()

    stages = [
        {
            "order": 1, "label": "Капаро (задатък)", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "signing", "expected_date": today_iso,
            "is_deposit": True,
            "description": "при подписване на предварителен договор",
        },
        {
            "order": 2, "label": "Изкопни работи", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "excavation", "expected_date": _add_days(act_2, 30),
            "is_deposit": False,
            "description": "при започване на изкопните работи",
        },
        {
            "order": 3, "label": "Кота 0 (фундамент)", "percent": 10.0,
            "amount": round(total * 0.10, 2),
            "milestone_type": "kota_0", "expected_date": _add_days(act_2, 120),
            "is_deposit": False,
            "description": "при завършване на кота 0",
        },
        {
            "order": 4, "label": "Банков кредит (след Акт 14)", "percent": 70.0,
            "amount": round(total * 0.70, 2),
            "milestone_type": "bank_credit", "expected_date": _add_days(act_2, 720),
            "is_deposit": False,
            "description": "с банков кредит след получаване на Акт 14",
        },
    ]
    return {
        "scheme_type": "with_bank",
        "stages": stages,
        "expected_act_2_date": act_2.isoformat() if act_2 else None,
        "stop_deposit_amount": 0.0,
        "notes": None,
    }


def build_custom_scheme(total: float, project: Optional[dict] = None) -> dict:
    act_2 = _parse_iso_date((project or {}).get("expected_act_2_date"))
    return {
        "scheme_type": "custom",
        "stages": [],
        "expected_act_2_date": act_2.isoformat() if act_2 else None,
        "stop_deposit_amount": 0.0,
        "notes": None,
    }


def build_scheme(scheme_type: str, total: float, project: Optional[dict] = None) -> dict:
    if scheme_type == "with_bank":
        return build_bank_scheme(total, project)
    if scheme_type == "custom":
        return build_custom_scheme(total, project)
    return build_standard_scheme(total, project)


def apply_stop_deposit(schedule: dict, stop_amount: float) -> dict:
    """Auto-deduct stop-deposit from earliest stages.

    Mutates and returns the schedule dict.
    """
    if not stop_amount or stop_amount <= 0:
        schedule["stop_deposit_amount"] = 0.0
        return schedule
    schedule["stop_deposit_amount"] = float(stop_amount)
    remaining = float(stop_amount)
    for stage in schedule.get("stages", []):
        if remaining <= 0:
            break
        cur = float(stage.get("amount") or 0)
        deduction = min(remaining, cur)
        if deduction > 0:
            stage["amount"] = round(cur - deduction, 2)
            base_desc = stage.get("description") or ""
            note = f" (приспаднати {deduction:,.0f} € от внесено стоп-капаро)".replace(",", " ")
            if "приспаднати" not in base_desc:
                stage["description"] = (base_desc + note).strip()
            remaining -= deduction
    return schedule


def recalc_amounts(schedule: dict, total: float) -> dict:
    """Recalculate stage.amount from stage.percent × total. Preserves description.
    Then re-applies stop_deposit_amount."""
    stop = float(schedule.get("stop_deposit_amount") or 0)
    for stage in schedule.get("stages", []):
        pct = float(stage.get("percent") or 0)
        stage["amount"] = round(total * pct / 100.0, 2)
        # Strip any prior "(приспаднати ...)" suffix so re-application is clean
        desc = stage.get("description") or ""
        if "приспаднати" in desc:
            stage["description"] = desc.split(" (приспаднати")[0].strip()
    if stop:
        apply_stop_deposit(schedule, stop)
    return schedule
