"""R.7 — Construction Cashflow Forecast service.

Builds a project-level construction cashflow forecast comparing planned
construction costs (rough + remaining) against expected revenue from
unpaid deal stages, starting from a manually entered opening cash balance.

This is NOT accounting — it's a forward-looking management forecast.
"""
from datetime import datetime, timezone, timedelta
from collections import defaultdict


DEFAULT_FRONTLOAD_MONTHS = 3
DEFAULT_FRONTLOAD_PERCENT = 50
DEFAULT_REMAINING_MONTHS_TO_ACT14 = 8
DEFAULT_FORECAST_MONTHS = 24


def safe_num(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00").split("T")[0])
    except (ValueError, AttributeError):
        return None


def _month_key(dt):
    return f"{dt.year}-{dt.month:02d}"


def _month_label(dt):
    months = ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"]
    return f"{months[dt.month - 1]} {dt.year}"


def _add_months(dt, n):
    y, m = dt.year, dt.month + n
    while m > 12:
        y += 1
        m -= 12
    while m < 1:
        y -= 1
        m += 12
    return dt.replace(year=y, month=m, day=1)


async def build_construction_cashflow(db, project_id, property_ids, deals, settings, now=None, overdue_total=0.0):
    """Build the construction cashflow forecast for one project.

    Args:
        db: motor DB (unused for now — kept for future hooks).
        project_id: selected project id (string or None).
        property_ids: iterable of property ids that belong to the project.
        deals: list of deal documents (sellable: active + completed) intersecting this project.
        settings: project.construction_cashflow_settings dict (or None).
        now: datetime (defaults to UTC now).
        overdue_total: dashboard overdue figure (for alerts).
    Returns:
        Dict with shape: {available, reason, settings, totals, monthly, alerts}.
    """
    if not project_id:
        return {
            "available": False,
            "reason": "Избери проект, за да видиш строителния cashflow",
            "settings": {},
            "totals": {},
            "monthly": [],
            "alerts": [],
        }

    s = dict(settings or {})

    rzp = safe_num(s.get("total_rzp_area"))
    rough_per_sqm = safe_num(s.get("rough_cost_per_sqm"))
    full_per_sqm = safe_num(s.get("full_cost_per_sqm"))
    cash_opening = safe_num(s.get("cash_opening_balance"))
    min_reserve = safe_num(s.get("minimum_cash_reserve"))
    reserve_pct = safe_num(s.get("reserve_percent"))
    frontload_months = int(s.get("rough_frontload_months") or DEFAULT_FRONTLOAD_MONTHS)
    frontload_percent = safe_num(s.get("rough_frontload_percent")) or DEFAULT_FRONTLOAD_PERCENT
    remaining_months_to_act14 = int(s.get("rough_remaining_months_to_act14") or DEFAULT_REMAINING_MONTHS_TO_ACT14)
    forecast_months = int(s.get("forecast_months") or DEFAULT_FORECAST_MONTHS)
    notes = s.get("notes") or ""

    rough_total = round(rzp * rough_per_sqm, 2)
    full_total = round(rzp * full_per_sqm, 2)
    remaining_after_rough = max(0.0, round(full_total - rough_total, 2))

    rough_frontload_cost = round(rough_total * frontload_percent / 100.0, 2)
    rough_remaining_cost = round(rough_total - rough_frontload_cost, 2)

    # Missing settings → return early with alert
    if rzp <= 0 or rough_per_sqm <= 0:
        return {
            "available": True,
            "reason": None,
            "settings": s,
            "totals": {
                "total_rzp_area": rzp, "rough_cost_per_sqm": rough_per_sqm,
                "full_cost_per_sqm": full_per_sqm,
                "rough_total_cost": rough_total, "full_total_cost": full_total,
                "remaining_after_rough": remaining_after_rough,
                "rough_frontload_cost": rough_frontload_cost,
                "rough_remaining_cost": rough_remaining_cost,
                "expected_revenue_during_rough": 0.0,
                "expected_revenue_until_act14": 0.0,
                "expected_revenue_total_forecast": 0.0,
                "cash_opening_balance": cash_opening,
                "minimum_cash_reserve": min_reserve,
                "reserve_percent": reserve_pct,
                "max_cash_deficit": 0.0,
                "max_reserve_gap": 0.0,
                "recommended_credit_buffer": 0.0,
                "minimum_required_sales_amount": 0.0,
                "notes": notes,
            },
            "monthly": [],
            "alerts": [{
                "type": "missing_settings",
                "severity": "warning",
                "title": "Липсват настройки",
                "message": "Въведи РЗП и прогнозен разход за груб строеж, за да се изчисли строителният cashflow.",
            }],
        }

    now = now or datetime.now(timezone.utc)
    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Rough construction schedule — anchored at rough_start_date if provided, else now
    rough_start = _parse_date(s.get("rough_start_date")) or start_month
    rough_start = rough_start.replace(day=1, tzinfo=timezone.utc) if rough_start.tzinfo is None else rough_start.replace(day=1)

    # Cost per month buckets
    cost_by_month = defaultdict(float)

    if frontload_months > 0 and rough_frontload_cost > 0:
        per_month = rough_frontload_cost / frontload_months
        for i in range(frontload_months):
            cost_by_month[_month_key(_add_months(rough_start, i))] += per_month

    if remaining_months_to_act14 > 0 and rough_remaining_cost > 0:
        per_month = rough_remaining_cost / remaining_months_to_act14
        for i in range(remaining_months_to_act14):
            cost_by_month[_month_key(_add_months(rough_start, frontload_months + i))] += per_month

    act14_month = _add_months(rough_start, frontload_months + remaining_months_to_act14)

    # Remaining (post-Act14) — spread evenly from act14_month to end of forecast
    post_act14_months_until_end = max(0, forecast_months - (
        ((act14_month.year - start_month.year) * 12) + (act14_month.month - start_month.month)
    ))
    if remaining_after_rough > 0 and post_act14_months_until_end > 0:
        per_month = remaining_after_rough / post_act14_months_until_end
        for i in range(post_act14_months_until_end):
            cost_by_month[_month_key(_add_months(act14_month, i))] += per_month

    # ----- REVENUE from unpaid deal stages -----
    revenue_by_month = defaultdict(float)
    project_pids = set(property_ids or [])

    start_month_iso = start_month.date().isoformat()

    for d in deals:
        # Verify at least one item is in this project
        deal_pids = {it.get("property_id") for it in (d.get("items") or []) if it.get("property_id")}
        if project_pids and not (deal_pids & project_pids):
            continue
        for stage in (d.get("bank_stages") or []) + (d.get("own_stages") or []):
            if stage.get("is_paid"):
                continue
            ed = stage.get("expected_date") or ""
            if not ed or ed < start_month_iso:
                continue
            amt = safe_num(stage.get("amount"))
            if amt <= 0:
                continue
            mk = ed[:7]
            revenue_by_month[mk] += amt

    # ----- MONTHLY ROLLUP -----
    monthly = []
    balance = cash_opening
    max_deficit = 0.0
    max_reserve_gap = 0.0
    expected_rev_during_rough = 0.0
    expected_rev_until_act14 = 0.0
    expected_rev_total = 0.0

    rough_end_index = frontload_months + remaining_months_to_act14

    for i in range(forecast_months):
        cur = _add_months(start_month, i)
        mk = _month_key(cur)
        revenue = round(revenue_by_month.get(mk, 0), 2)
        cost = round(cost_by_month.get(mk, 0), 2)
        # Split cost into rough vs other
        rough_anchor_index = ((cur.year - rough_start.year) * 12) + (cur.month - rough_start.month)
        is_rough_month = 0 <= rough_anchor_index < rough_end_index
        planned_rough = cost if is_rough_month else 0.0
        planned_other = cost if not is_rough_month else 0.0

        opening = balance
        closing = opening + revenue - cost

        # Reserve required = max(min_reserve, percent_of_next_3_months_cost)
        next_3_cost = 0.0
        for j in range(1, 4):
            nxt = _add_months(cur, j)
            next_3_cost += cost_by_month.get(_month_key(nxt), 0)
        pct_reserve = next_3_cost * (reserve_pct / 100.0) if reserve_pct > 0 else 0.0
        reserve_required = max(min_reserve, pct_reserve)

        below_reserve = closing < reserve_required and reserve_required > 0
        deficit = abs(closing) if closing < 0 else 0.0
        max_deficit = max(max_deficit, deficit)
        if below_reserve:
            max_reserve_gap = max(max_reserve_gap, reserve_required - closing)

        status = "deficit" if closing < 0 else ("below_reserve" if below_reserve else "ok")

        expected_rev_total += revenue
        if is_rough_month:
            expected_rev_during_rough += revenue
        if i < rough_end_index:
            expected_rev_until_act14 += revenue

        monthly.append({
            "month": mk,
            "month_label": _month_label(cur),
            "period_index": i,
            "opening_balance": round(opening, 2),
            "expected_revenue": revenue,
            "planned_rough_cost": round(planned_rough, 2),
            "planned_remaining_construction_cost": round(planned_other, 2),
            "total_planned_cost": round(cost, 2),
            "closing_balance": round(closing, 2),
            "reserve_required": round(reserve_required, 2),
            "below_reserve": below_reserve,
            "deficit": round(deficit, 2),
            "status": status,
        })
        balance = closing

    recommended_buffer = round(max(max_deficit, max_reserve_gap), 2)
    minimum_required_sales = round(max_deficit, 2)

    totals = {
        "total_rzp_area": rzp,
        "rough_cost_per_sqm": rough_per_sqm,
        "full_cost_per_sqm": full_per_sqm,
        "rough_total_cost": rough_total,
        "full_total_cost": full_total,
        "remaining_after_rough": remaining_after_rough,
        "rough_frontload_cost": rough_frontload_cost,
        "rough_remaining_cost": rough_remaining_cost,
        "expected_revenue_during_rough": round(expected_rev_during_rough, 2),
        "expected_revenue_until_act14": round(expected_rev_until_act14, 2),
        "expected_revenue_total_forecast": round(expected_rev_total, 2),
        "cash_opening_balance": cash_opening,
        "minimum_cash_reserve": min_reserve,
        "reserve_percent": reserve_pct,
        "max_cash_deficit": round(max_deficit, 2),
        "max_reserve_gap": round(max_reserve_gap, 2),
        "recommended_credit_buffer": recommended_buffer,
        "minimum_required_sales_amount": minimum_required_sales,
        "notes": notes,
    }

    # ----- ALERTS -----
    alerts = []
    if max_deficit > 0:
        worst = max(monthly, key=lambda m: m["deficit"])
        alerts.append({
            "type": "cash_deficit",
            "severity": "critical",
            "title": f"Очакван недостиг през {worst['month_label']}",
            "message": "Очакван недостиг в cashflow-а. Нужен е кредитен буфер или ускоряване на приходи.",
            "amount": round(max_deficit, 2),
        })
    if max_reserve_gap > 0:
        alerts.append({
            "type": "below_reserve",
            "severity": "warning",
            "title": "Балансът пада под резерв",
            "message": "Балансът пада под минималния резерв.",
            "amount": round(max_reserve_gap, 2),
        })
    if overdue_total > 0:
        alerts.append({
            "type": "overdue_installments",
            "severity": "warning",
            "title": "Просрочени вноски",
            "message": "Има просрочени вноски. Провери клиентите и плащанията.",
            "amount": round(overdue_total, 2),
        })
    if recommended_buffer > 0:
        alerts.append({
            "type": "credit_buffer_recommended",
            "severity": "info" if max_deficit == 0 else "warning",
            "title": "Препоръчителен кредитен буфер",
            "message": f"Препоръчителен кредитен буфер: {round(recommended_buffer):,} €".replace(",", " "),
            "amount": recommended_buffer,
        })

    return {
        "available": True,
        "reason": None,
        "settings": s,
        "totals": totals,
        "monthly": monthly,
        "alerts": alerts,
    }
