"""Dashboard aggregations service.

Builds the rich dashboard payload from deals (primary), properties, reservations,
clients and legacy payments. Used by GET /dashboard/admin/full.

Key rules:
- Counts/availability come from `properties`.
- Sold value comes from `deals.items[].agreed_price` (NOT properties.list_price).
- Payments come from `deals.bank_stages + deals.own_stages`.
- Paid: stage.is_paid=True → use stage.paid_amount or stage.amount.
- Expected: unpaid stages with future expected_date.
- Overdue: unpaid stages with expected_date < today.
- Deposit: stage.is_deposit OR label "Капаро" OR milestone_type "deposit"/"signing".
- compensation/hidden are not part of sellable potential.
- Multi-property deals split value via deal.items.
"""
from datetime import datetime, timezone, timedelta
from collections import defaultdict


VAT_RATE = 0.20


def with_vat(amount):
    if amount is None:
        return 0.0
    return round(amount * (1 + VAT_RATE), 2)


def safe_num(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def today_iso():
    return datetime.now(timezone.utc).date().isoformat()


def stage_paid_amount(stage):
    """Effective paid amount for a stage."""
    if not stage.get("is_paid"):
        return 0.0
    pa = stage.get("paid_amount")
    if pa is not None:
        return safe_num(pa)
    return safe_num(stage.get("amount"))


def stage_unpaid_amount(stage):
    if stage.get("is_paid"):
        return 0.0
    return safe_num(stage.get("amount"))


def stage_is_deposit(stage):
    if stage.get("is_deposit"):
        return True
    label = (stage.get("label") or "").lower()
    if "капаро" in label or "задатък" in label:
        return True
    mt = (stage.get("milestone_type") or "").lower()
    if "deposit" in mt or "signing" in mt:
        return True
    return False


def stage_is_overdue(stage, today):
    if stage.get("is_paid"):
        return False
    ed = stage.get("expected_date") or ""
    if not ed:
        return False
    return ed < today


def stage_in_period(stage, start_iso, end_iso):
    """Stage's expected_date in [start, end] (paid OR unpaid, doesn't matter for filter)."""
    ed = stage.get("expected_date") or ""
    if not ed:
        return False
    return start_iso <= ed <= end_iso


def all_stages(deal):
    return list(deal.get("bank_stages") or []) + list(deal.get("own_stages") or [])


def deal_property_ids(deal):
    return [it.get("property_id") for it in (deal.get("items") or []) if it.get("property_id")]


def deal_total_agreed(deal):
    return sum(safe_num(it.get("agreed_price")) for it in (deal.get("items") or []))


def deal_belongs_to_project(deal, project_prop_ids_set):
    """Returns True if any deal item is in the project."""
    if not project_prop_ids_set:
        return True
    for pid in deal_property_ids(deal):
        if pid in project_prop_ids_set:
            return True
    return False


def parse_iso_date(d):
    if not d:
        return None
    try:
        return datetime.fromisoformat(d.replace("Z", "+00:00").split("T")[0]).date()
    except (ValueError, AttributeError):
        return None


# ============================================================
# AGGREGATION ENTRY
# ============================================================


async def build_dashboard(
    db,
    *,
    project_id=None,
    building_id=None,
    property_type=None,
    status=None,
    client_id=None,
    period=None,
    only_overdue=False,
    only_available=False,
    is_finance_visible=True,
):
    """Returns full dashboard payload (new + legacy keys)."""

    # ----- LOAD PROPERTIES (filtered) -----
    prop_filter = {}
    if project_id:
        prop_filter["project_id"] = project_id
    if building_id:
        prop_filter["building_id"] = building_id
    if property_type:
        prop_filter["property_type"] = property_type
    if status:
        prop_filter["status"] = status
    if only_available:
        prop_filter["status"] = "available"

    all_props = await db.properties.find(prop_filter, {"_id": 0}).to_list(5000)
    prop_ids_set = {p["id"] for p in all_props}

    # ----- LOAD DEALS -----
    deal_filter = {}
    if client_id:
        deal_filter["client_id"] = client_id
    raw_deals = await db.deals.find(deal_filter, {"_id": 0}).to_list(5000)

    # Filter deals to those that intersect our property scope
    if project_id or building_id or property_type or status or only_available:
        deals = [d for d in raw_deals if any(pid in prop_ids_set for pid in deal_property_ids(d))]
    else:
        deals = raw_deals

    active_deals = [d for d in deals if d.get("status") == "active"]
    completed_deals = [d for d in deals if d.get("status") == "completed"]
    sellable_deals = active_deals + completed_deals  # exclude cancelled

    # Deals where AT LEAST ONE item is sold
    # We'll aggregate per item

    today = today_iso()
    now = datetime.now(timezone.utc)

    # ----- OVERVIEW: counts from properties -----
    total_count = len(all_props)
    sold = [p for p in all_props if p.get("status") == "sold"]
    available = [p for p in all_props if p.get("status") == "available"]
    reserved_zero = [p for p in all_props if p.get("status") == "reserved_zero_deposit"]
    reserved_dep = [p for p in all_props if p.get("status") == "reserved_paid_deposit"]
    compensation = [p for p in all_props if p.get("status") == "compensation"]
    hidden = [p for p in all_props if p.get("status") == "hidden"]
    unavailable = [p for p in all_props if p.get("status") == "unavailable"]

    sellable = [
        p for p in all_props
        if p.get("status") not in ("compensation", "hidden", "unavailable")
    ]
    # Properties that count as not_sold (everything except sold)
    not_sold = [p for p in all_props if p.get("status") != "sold"]
    # Properties on the active market (avail + reserved)
    market_available = available + reserved_zero + reserved_dep

    # ----- DEAL ITEM AGGREGATION -----
    # Build a map property_id -> agreed_price (for sold from deals)
    agreed_by_pid = {}
    deal_by_pid = {}
    for d in sellable_deals:
        for it in d.get("items") or []:
            pid = it.get("property_id")
            if pid and pid in prop_ids_set:
                agreed_by_pid[pid] = safe_num(it.get("agreed_price"))
                deal_by_pid[pid] = d

    # Sold value = sum of agreed_price for SOLD properties (from deals if available, fallback to list_price)
    sold_value_net = 0.0
    for p in sold:
        ap = agreed_by_pid.get(p["id"])
        if ap is not None and ap > 0:
            sold_value_net += ap
        else:
            sold_value_net += safe_num(p.get("list_price"))

    # Available sellable potential — from list_price (no deal yet)
    available_value_net = sum(safe_num(p.get("list_price")) for p in available)
    # Reserved value (still part of sellable potential — not yet sold)
    reserved_value_net = sum(safe_num(p.get("list_price")) for p in (reserved_zero + reserved_dep))
    # Sellable potential total (available + reserved) — excludes compensation/hidden/unavailable
    sellable_potential_net = available_value_net + reserved_value_net
    # Compensation value — visual only, NEVER part of sellable potential
    compensation_value_net = sum(safe_num(p.get("list_price")) for p in compensation)

    # ----- FINANCE: from deal stages -----
    contracted_net = 0.0  # sum(deal_total_agreed) for sellable deals
    paid_total = 0.0
    deposit_paid = 0.0
    deposit_expected = 0.0
    expected_total = 0.0  # all unpaid stages
    expected_future = 0.0  # only with future expected_date
    overdue_total = 0.0
    overdue_count = 0
    overdue_client_ids = set()

    expected_7d = 0.0
    expected_30d = 0.0
    expected_90d = 0.0

    paid_by_month = defaultdict(float)
    expected_by_month = defaultdict(float)

    bank_paid = 0.0
    bank_expected = 0.0
    own_paid = 0.0
    own_expected = 0.0

    seven_iso = (now + timedelta(days=7)).date().isoformat()
    thirty_iso = (now + timedelta(days=30)).date().isoformat()
    ninety_iso = (now + timedelta(days=90)).date().isoformat()

    upcoming_unpaid = []  # for calendar table
    overdue_list = []

    for d in sellable_deals:
        contracted_net += deal_total_agreed(d)
        for stage in (d.get("bank_stages") or []):
            paid_amt = stage_paid_amount(stage)
            if paid_amt:
                paid_total += paid_amt
                bank_paid += paid_amt
                pdate = stage.get("paid_date") or stage.get("expected_date") or ""
                pkey = pdate[:7] if len(pdate) >= 7 else ""
                if pkey:
                    paid_by_month[pkey] += paid_amt
                if stage_is_deposit(stage):
                    deposit_paid += paid_amt
            else:
                amt = stage_unpaid_amount(stage)
                expected_total += amt
                bank_expected += amt
                if stage_is_deposit(stage):
                    deposit_expected += amt
                ed = stage.get("expected_date") or ""
                if ed:
                    if ed < today:
                        overdue_total += amt
                        overdue_count += 1
                        overdue_client_ids.add(d.get("client_id"))
                        overdue_list.append({
                            "deal_id": d.get("id"),
                            "client_id": d.get("client_id"),
                            "label": stage.get("label"),
                            "expected_date": ed,
                            "amount": amt,
                            "bucket": "bank",
                        })
                    else:
                        expected_future += amt
                        if ed <= seven_iso:
                            expected_7d += amt
                        if ed <= thirty_iso:
                            expected_30d += amt
                        if ed <= ninety_iso:
                            expected_90d += amt
                        upcoming_unpaid.append({
                            "deal_id": d.get("id"),
                            "client_id": d.get("client_id"),
                            "label": stage.get("label"),
                            "expected_date": ed,
                            "amount": amt,
                            "bucket": "bank",
                        })
                    expected_by_month[ed[:7]] += amt
        for stage in (d.get("own_stages") or []):
            paid_amt = stage_paid_amount(stage)
            if paid_amt:
                paid_total += paid_amt
                own_paid += paid_amt
                pdate = stage.get("paid_date") or stage.get("expected_date") or ""
                pkey = pdate[:7] if len(pdate) >= 7 else ""
                if pkey:
                    paid_by_month[pkey] += paid_amt
                if stage_is_deposit(stage):
                    deposit_paid += paid_amt
            else:
                amt = stage_unpaid_amount(stage)
                expected_total += amt
                own_expected += amt
                if stage_is_deposit(stage):
                    deposit_expected += amt
                ed = stage.get("expected_date") or ""
                if ed:
                    if ed < today:
                        overdue_total += amt
                        overdue_count += 1
                        overdue_client_ids.add(d.get("client_id"))
                        overdue_list.append({
                            "deal_id": d.get("id"),
                            "client_id": d.get("client_id"),
                            "label": stage.get("label"),
                            "expected_date": ed,
                            "amount": amt,
                            "bucket": "own",
                        })
                    else:
                        expected_future += amt
                        if ed <= seven_iso:
                            expected_7d += amt
                        if ed <= thirty_iso:
                            expected_30d += amt
                        if ed <= ninety_iso:
                            expected_90d += amt
                        upcoming_unpaid.append({
                            "deal_id": d.get("id"),
                            "client_id": d.get("client_id"),
                            "label": stage.get("label"),
                            "expected_date": ed,
                            "amount": amt,
                            "bucket": "own",
                        })
                    expected_by_month[ed[:7]] += amt

    # Active reservations contribute their deposit (they're not yet sold/dealed)
    res_filter = {"status": "active"}
    active_reservations = await db.reservations.find(res_filter, {"_id": 0}).to_list(500)
    if project_id or building_id or property_type:
        active_reservations = [r for r in active_reservations if r.get("property_id") in prop_ids_set]
    res_deposit_paid = sum(safe_num(r.get("amount")) for r in active_reservations
                           if r.get("reservation_type") == "deposit")

    # Legacy fallback: if no deal stages at all, use payment_installments
    if expected_total == 0 and paid_total == 0:
        legacy_pay = await db.payments.find({}, {"_id": 0, "amount": 1, "client_id": 1}).to_list(2000)
        paid_total = sum(safe_num(p.get("amount")) for p in legacy_pay)
        legacy_inst = await db.payment_installments.find(
            {"status": "предстоящо"}, {"_id": 0, "amount": 1, "due_date": 1, "client_id": 1}
        ).to_list(2000)
        for inst in legacy_inst:
            amt = safe_num(inst.get("amount"))
            expected_total += amt
            ed = inst.get("due_date") or ""
            if ed:
                if ed < today:
                    overdue_total += amt
                    overdue_count += 1
                    overdue_client_ids.add(inst.get("client_id"))
                else:
                    expected_future += amt

    # Apply filters: only_overdue → strip expected/upcoming
    if only_overdue:
        upcoming_unpaid = []

    upcoming_unpaid.sort(key=lambda x: x.get("expected_date", ""))
    overdue_list.sort(key=lambda x: x.get("expected_date", ""))

    # Enrich upcoming/overdue with client_name + property_code
    async def enrich(items):
        out = []
        for it in items[:50]:
            row = dict(it)
            if it.get("client_id"):
                client = await db.users.find_one({"id": it["client_id"]}, {"_id": 0, "name": 1, "email": 1})
                if client:
                    row["client_name"] = client.get("name")
                    row["client_email"] = client.get("email")
            # Find property via deal
            deal = next((d for d in sellable_deals if d.get("id") == it.get("deal_id")), None)
            if deal and deal.get("items"):
                row["property_codes"] = [i.get("property_code") for i in deal["items"] if i.get("property_code")]
            out.append(row)
        return out

    upcoming_enriched = await enrich(upcoming_unpaid[:20])
    overdue_enriched = await enrich(overdue_list[:50])

    contracted_with_vat = with_vat(contracted_net)
    remaining_net = max(0.0, contracted_net - paid_total)

    # ----- BY TYPE -----
    by_type = defaultdict(lambda: {
        "type": "", "total": 0, "sold": 0, "available": 0,
        "reserved": 0, "compensation": 0,
        "sold_value_net": 0.0, "available_value_net": 0.0,
    })
    for p in all_props:
        ptype = p.get("property_type") or "unknown"
        s = p.get("status") or ""
        rec = by_type[ptype]
        rec["type"] = ptype
        rec["total"] += 1
        if s == "sold":
            rec["sold"] += 1
            rec["sold_value_net"] += agreed_by_pid.get(p["id"]) or safe_num(p.get("list_price"))
        elif s == "available":
            rec["available"] += 1
            rec["available_value_net"] += safe_num(p.get("list_price"))
        elif s in ("reserved_zero_deposit", "reserved_paid_deposit"):
            rec["reserved"] += 1
        elif s == "compensation":
            rec["compensation"] += 1

    by_type_list = []
    for ptype, rec in by_type.items():
        rec["sold_value_with_vat"] = with_vat(rec["sold_value_net"])
        rec["available_value_with_vat"] = with_vat(rec["available_value_net"])
        by_type_list.append(rec)
    by_type_list.sort(key=lambda x: -x["total"])

    # ----- BY FLOOR -----
    by_floor_map = defaultdict(lambda: {
        "floor": 0, "total": 0, "sold": 0, "available": 0, "reserved": 0,
        "sold_value_net": 0.0, "available_value_net": 0.0,
    })
    for p in all_props:
        floor = p.get("floor")
        if floor is None:
            continue
        s = p.get("status") or ""
        rec = by_floor_map[floor]
        rec["floor"] = floor
        rec["total"] += 1
        if s == "sold":
            rec["sold"] += 1
            rec["sold_value_net"] += agreed_by_pid.get(p["id"]) or safe_num(p.get("list_price"))
        elif s == "available":
            rec["available"] += 1
            rec["available_value_net"] += safe_num(p.get("list_price"))
        elif s in ("reserved_zero_deposit", "reserved_paid_deposit"):
            rec["reserved"] += 1

    by_floor_list = sorted([
        {**v, "sold_value_with_vat": with_vat(v["sold_value_net"]),
         "available_value_with_vat": with_vat(v["available_value_net"])}
        for v in by_floor_map.values()
    ], key=lambda x: x["floor"])

    # ----- BY BUILDING -----
    by_building_map = defaultdict(lambda: {
        "building_id": None, "name": None, "total": 0, "sold": 0,
        "available": 0, "reserved": 0,
        "sold_value_net": 0.0, "available_value_net": 0.0,
    })
    building_ids = {p.get("building_id") for p in all_props if p.get("building_id")}
    buildings = await db.buildings.find(
        {"id": {"$in": list(building_ids)}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(100) if building_ids else []
    bld_name_by_id = {b["id"]: b.get("name") for b in buildings}

    for p in all_props:
        bid = p.get("building_id") or "_no_building"
        rec = by_building_map[bid]
        rec["building_id"] = bid if bid != "_no_building" else None
        rec["name"] = bld_name_by_id.get(bid, "—" if bid == "_no_building" else bid[:8])
        rec["total"] += 1
        s = p.get("status") or ""
        if s == "sold":
            rec["sold"] += 1
            rec["sold_value_net"] += agreed_by_pid.get(p["id"]) or safe_num(p.get("list_price"))
        elif s == "available":
            rec["available"] += 1
            rec["available_value_net"] += safe_num(p.get("list_price"))
        elif s in ("reserved_zero_deposit", "reserved_paid_deposit"):
            rec["reserved"] += 1

    by_building_list = sorted([
        {**v, "sold_value_with_vat": with_vat(v["sold_value_net"]),
         "available_value_with_vat": with_vat(v["available_value_net"])}
        for v in by_building_map.values()
    ], key=lambda x: -x["total"])

    # ----- CLIENTS SUMMARY -----
    # For each client with at least 1 deal: properties, contracted, paid, remaining, overdue, next_due
    clients_map = defaultdict(lambda: {
        "client_id": None, "name": None, "email": None,
        "properties": [], "property_count": 0,
        "contracted_net": 0.0, "paid": 0.0, "remaining": 0.0,
        "overdue": 0.0, "next_due_date": None, "next_due_amount": 0.0,
        "payment_status": "ok",
    })
    for d in sellable_deals:
        cid = d.get("client_id")
        if not cid:
            continue
        rec = clients_map[cid]
        rec["client_id"] = cid
        for it in d.get("items") or []:
            if it.get("property_code"):
                rec["properties"].append(it.get("property_code"))
            rec["contracted_net"] += safe_num(it.get("agreed_price"))
        rec["property_count"] = len(rec["properties"])

        next_unpaid_date = None
        next_unpaid_amount = 0.0
        for stage in all_stages(d):
            paid_amt = stage_paid_amount(stage)
            if paid_amt:
                rec["paid"] += paid_amt
            else:
                amt = stage_unpaid_amount(stage)
                ed = stage.get("expected_date") or ""
                if ed and ed < today:
                    rec["overdue"] += amt
                elif ed:
                    if next_unpaid_date is None or ed < next_unpaid_date:
                        next_unpaid_date = ed
                        next_unpaid_amount = amt
        if next_unpaid_date and (rec["next_due_date"] is None or next_unpaid_date < rec["next_due_date"]):
            rec["next_due_date"] = next_unpaid_date
            rec["next_due_amount"] = next_unpaid_amount

    for cid, rec in clients_map.items():
        rec["remaining"] = max(0.0, rec["contracted_net"] - rec["paid"])
        rec["contracted_with_vat"] = with_vat(rec["contracted_net"])
        if rec["overdue"] > 0:
            rec["payment_status"] = "overdue"
        elif rec["remaining"] == 0 and rec["contracted_net"] > 0:
            rec["payment_status"] = "completed"
        elif rec["paid"] > 0:
            rec["payment_status"] = "in_progress"
        else:
            rec["payment_status"] = "no_payment"

    # Fetch client names
    if clients_map:
        client_users = await db.users.find(
            {"id": {"$in": list(clients_map.keys())}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1}
        ).to_list(500)
        for u in client_users:
            if u["id"] in clients_map:
                clients_map[u["id"]]["name"] = u.get("name")
                clients_map[u["id"]]["email"] = u.get("email")

    clients_summary = sorted(clients_map.values(), key=lambda c: -c["contracted_net"])

    # ----- MONEY CALENDAR (12 months ahead by month) -----
    months_list = []
    today_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for offset in range(12):
        target = today_dt + timedelta(days=30 * offset)
        key = f"{target.year}-{target.month:02d}"
        months_list.append({
            "month": key,
            "label": target.strftime("%b %Y"),
            "expected": round(expected_by_month.get(key, 0), 2),
            "paid": round(paid_by_month.get(key, 0), 2),
        })

    money_calendar = {
        "this_week": {"amount": round(expected_7d, 2), "count": sum(
            1 for s in upcoming_unpaid if s.get("expected_date", "") <= seven_iso)},
        "this_month": {"amount": round(expected_30d, 2), "count": sum(
            1 for s in upcoming_unpaid if s.get("expected_date", "") <= thirty_iso)},
        "this_quarter": {"amount": round(expected_90d, 2), "count": sum(
            1 for s in upcoming_unpaid if s.get("expected_date", "") <= ninety_iso)},
        "by_month": months_list,
        "upcoming": upcoming_enriched[:10],
        "overdue": overdue_enriched[:50],
    }

    # ----- UNSOLD INVENTORY -----
    ninety_days_ago = (now - timedelta(days=90)).isoformat()
    available_avg = (available_value_net / len(available)) if available else 0
    unsold_rows = []
    for p in available + reserved_zero + reserved_dep:
        created = p.get("created_at") or ""
        is_long = created and created < ninety_days_ago
        unsold_rows.append({
            "id": p["id"],
            "code": p.get("code"),
            "property_type": p.get("property_type"),
            "floor": p.get("floor"),
            "area_total": p.get("area_total"),
            "list_price_net": safe_num(p.get("list_price")),
            "list_price_with_vat": with_vat(p.get("list_price")) if is_finance_visible else None,
            "status": p.get("status"),
            "days_since_created": _days_since(p.get("created_at"), now),
            "risk_long_standing": bool(is_long),
        })
    unsold_rows.sort(key=lambda x: -(x.get("days_since_created") or 0))

    unsold_inventory = {
        "count": len(available),
        "reserved_count": len(reserved_zero) + len(reserved_dep),
        "potential_net": round(available_value_net, 2),
        "potential_with_vat": with_vat(available_value_net),
        "average_price_net": round(available_avg, 2),
        "average_price_with_vat": with_vat(available_avg),
        "rows": unsold_rows,
        "long_standing_count": sum(1 for r in unsold_rows if r["risk_long_standing"]),
    }

    # ----- SALES PIPELINE -----
    sales_pipeline = {
        "available": len(available),
        "reserved_zero": len(reserved_zero),
        "reserved_deposit": len(reserved_dep),
        "active_deals": len(active_deals),
        "completed_deals": len(completed_deals),
        "sold": len(sold),
    }

    # ----- ACTION ITEMS -----
    action_items = []
    if overdue_total > 0:
        action_items.append({
            "id": "overdue",
            "type": "overdue",
            "severity": "high",
            "title": f"{overdue_count} закъснели вноски",
            "message": f"{round(overdue_total):,}€ просрочени от {len(overdue_client_ids)} клиент(а)",
            "amount": round(overdue_total, 2),
            "count": overdue_count,
        })

    next_30 = (now + timedelta(days=30)).isoformat()
    expiring_filter = {"status": "active", "expires_at": {"$lte": next_30, "$gte": now.isoformat()}}
    expiring = await db.reservations.find(expiring_filter, {"_id": 0}).to_list(100)
    if project_id or building_id:
        expiring = [r for r in expiring if r.get("property_id") in prop_ids_set]
    if expiring:
        action_items.append({
            "id": "expiring_reservations",
            "type": "expiring_reservations",
            "severity": "medium",
            "title": f"{len(expiring)} капарирани изтичат до 30 дни",
            "message": "Подпиши договор или капарото ще бъде освободено",
            "count": len(expiring),
        })

    if unsold_inventory["long_standing_count"] > 0:
        action_items.append({
            "id": "long_standing",
            "type": "long_standing",
            "severity": "low",
            "title": f"{unsold_inventory['long_standing_count']} имота стоят > 90 дни",
            "message": "Помисли отстъпка или промоция",
            "count": unsold_inventory["long_standing_count"],
        })

    seven_days_ago = (now - timedelta(days=7)).isoformat()
    recent_inq_count = await db.inquiries.count_documents({"created_at": {"$gte": seven_days_ago}})
    if recent_inq_count > 0:
        action_items.append({
            "id": "new_inquiries",
            "type": "new_inquiries",
            "severity": "low",
            "title": f"{recent_inq_count} нови запитвания",
            "message": "Последни 7 дни — обади се",
            "count": recent_inq_count,
        })

    # ----- RECENT SALES -----
    sold_props_sorted = sorted(
        [p for p in sold],
        key=lambda x: x.get("updated_at") or x.get("created_at", ""),
        reverse=True
    )[:10]
    recent_sales = []
    for p in sold_props_sorted:
        ap = agreed_by_pid.get(p["id"])
        net = ap if (ap is not None and ap > 0) else safe_num(p.get("list_price"))
        rec = {
            "property_id": p["id"],
            "code": p.get("code"),
            "property_type": p.get("property_type"),
            "list_price_net": net,
            "list_price_with_vat": with_vat(net) if is_finance_visible else None,
            "buyer_id": p.get("buyer_id"),
            "buyer_name": None,
            "sold_at": p.get("updated_at") or p.get("created_at"),
        }
        if p.get("buyer_id"):
            buyer = await db.users.find_one({"id": p["buyer_id"]}, {"_id": 0, "name": 1})
            if buyer:
                rec["buyer_name"] = buyer.get("name")
        recent_sales.append(rec)

    # ----- TOP CLIENTS -----
    top_clients = []
    for c in clients_summary[:5]:
        top_clients.append({
            "client_id": c["client_id"],
            "name": c["name"],
            "email": c["email"],
            "count": c["property_count"],
            "properties": c["properties"][:5],
            "value_net": round(c["contracted_net"], 2),
            "value_with_vat": c["contracted_with_vat"],
        })

    # ----- RECENT INQUIRIES -----
    recent_inquiries = await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    # ----- ASSEMBLE PAYLOAD -----

    # Helper: strip finance fields for non-finance roles
    def hide_finance(d, keys):
        if is_finance_visible:
            return d
        out = {**d}
        for k in keys:
            out[k] = None
        return out

    # Reconciliation check: sum of all status buckets must equal total
    accounted = (
        len(sold) + len(available) + len(reserved_zero) + len(reserved_dep)
        + len(compensation) + len(hidden) + len(unavailable)
    )
    other_count = total_count - accounted

    overview = {
        # Total inventory
        "total_properties": total_count,
        "total_count": total_count,  # legacy alias
        # Hard split: sold vs not_sold
        "sold_count": len(sold),
        "not_sold_count": len(not_sold),
        # Active market split (not_sold breakdown)
        "available_count": len(available),
        "reserved_count": len(reserved_zero) + len(reserved_dep),
        "reserved_zero_count": len(reserved_zero),
        "reserved_deposit_count": len(reserved_dep),
        "market_available_count": len(market_available),
        # Non-sale inventory (visual only)
        "compensation_count": len(compensation),
        "hidden_count": len(hidden),
        "unavailable_count": len(unavailable),
        "non_sale_count": len(compensation) + len(hidden) + len(unavailable),
        "other_count": other_count,
        # Sellable potential (excludes compensation/hidden/unavailable)
        "sellable_count": len(sellable),
        "sold_percent": round((len(sold) / len(sellable) * 100), 1) if sellable else 0,
        # Reconciliation flag for UI
        "count_reconciliation_ok": (other_count == 0),
    }
    if is_finance_visible:
        overview["sold_value_net"] = round(sold_value_net, 2)
        overview["sold_value_with_vat"] = with_vat(sold_value_net)
        overview["available_value_net"] = round(available_value_net, 2)
        overview["available_value_with_vat"] = with_vat(available_value_net)
        overview["reserved_value_net"] = round(reserved_value_net, 2)
        overview["reserved_value_with_vat"] = with_vat(reserved_value_net)
        overview["sellable_potential_net"] = round(sellable_potential_net, 2)
        overview["sellable_potential_with_vat"] = with_vat(sellable_potential_net)
        overview["compensation_value_visual_only_net"] = round(compensation_value_net, 2)
        overview["compensation_value_visual_only_with_vat"] = with_vat(compensation_value_net)
        overview["paid_total"] = round(paid_total, 2)
        overview["overdue_total"] = round(overdue_total, 2)

    finance = None
    if is_finance_visible:
        finance = {
            "contracted_net": round(contracted_net, 2),
            "contracted_with_vat": contracted_with_vat,
            "deposit_paid": round(deposit_paid, 2),
            "deposit_expected": round(deposit_expected, 2),
            "reservation_deposits_held": round(res_deposit_paid, 2),
            "paid_total": round(paid_total, 2),
            "remaining_net": round(remaining_net, 2),
            "expected_total": round(expected_total, 2),
            "expected_future": round(expected_future, 2),
            "overdue_total": round(overdue_total, 2),
            "overdue_count": overdue_count,
            "expected_7d": round(expected_7d, 2),
            "expected_30d": round(expected_30d, 2),
            "expected_90d": round(expected_90d, 2),
            "by_payment_mode": {
                "bank_paid": round(bank_paid, 2),
                "bank_expected": round(bank_expected, 2),
                "own_paid": round(own_paid, 2),
                "own_expected": round(own_expected, 2),
            },
            "paid_by_month": [
                {"month": m["month"], "label": m["label"], "amount": m["paid"]}
                for m in months_list
            ],
            "expected_by_month": [
                {"month": m["month"], "label": m["label"], "amount": m["expected"]}
                for m in months_list
            ],
        }

    # ----- LEGACY KEYS (backward compatible) -----
    cash = None
    if is_finance_visible:
        cash = {
            "paid": round(paid_total, 2),
            "expected": round(expected_total, 2),
            "overdue": round(overdue_total, 2),
            "overdue_clients_count": len(overdue_client_ids),
        }

    sales_summary = {
        "total_count": total_count,
        "sold_count": len(sold),
        "available_count": len(available),
        "reserved_count": len(reserved_zero) + len(reserved_dep),
        "compensation_count": len(compensation),
        "by_type": by_type_list,
    }
    if is_finance_visible:
        sales_summary["sold_value_net"] = round(sold_value_net, 2)
        sales_summary["sold_value_with_vat"] = with_vat(sold_value_net)
        sales_summary["available_value_net"] = round(available_value_net, 2)
        sales_summary["available_value_with_vat"] = with_vat(available_value_net)
        sales_summary["total_value_net"] = round(sold_value_net + available_value_net, 2)
        sales_summary["total_value_with_vat"] = with_vat(sold_value_net + available_value_net)
        sales_summary["sold_percent"] = round((len(sold) / total_count * 100), 1) if total_count else 0

    calendar_legacy = None
    if is_finance_visible:
        calendar_legacy = {
            "this_week": money_calendar["this_week"],
            "this_month": money_calendar["this_month"],
            "this_year": {"amount": round(sum(m["expected"] for m in months_list), 2),
                          "count": len([s for s in upcoming_unpaid])},
            "by_month": [{"month": m["month"], "label": m["label"], "amount": m["expected"]}
                         for m in months_list],
            "upcoming": [
                {"client_name": e.get("client_name"),
                 "property_code": (e.get("property_codes") or [None])[0],
                 "amount": e.get("amount"),
                 "due_date": e.get("expected_date")}
                for e in upcoming_enriched[:10]
            ],
        }

    # Legacy alerts mirror action_items but with same shape
    alerts = action_items

    # ----- R.7: CONSTRUCTION CASHFLOW (only for finance roles + when project selected) -----
    construction_cashflow = {
        "available": False,
        "reason": "Избери проект, за да видиш строителния cashflow",
        "settings": {}, "totals": {}, "monthly": [], "alerts": [],
    }
    if is_finance_visible and project_id:
        from services.construction_cashflow import build_construction_cashflow
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if project:
            ccs = project.get("construction_cashflow_settings") or {}
            # Fallback: copy total_rzp_area from project root if settings doesn't have it
            if not ccs.get("total_rzp_area") and project.get("total_rzp_area"):
                ccs = {**ccs, "total_rzp_area": project.get("total_rzp_area")}
            construction_cashflow = await build_construction_cashflow(
                db,
                project_id=project_id,
                property_ids=list(prop_ids_set),
                deals=sellable_deals,
                settings=ccs,
                now=datetime.now(timezone.utc),
                overdue_total=overdue_total,
            )

    return {
        "is_finance_visible": is_finance_visible,
        "filters": {
            "project_id": project_id,
            "building_id": building_id,
            "property_type": property_type,
            "status": status,
            "client_id": client_id,
            "period": period,
            "only_overdue": only_overdue,
            "only_available": only_available,
        },
        # New blocks
        "overview": overview,
        "finance": finance,
        "sales_pipeline": sales_pipeline,
        "by_type": by_type_list,
        "by_floor": by_floor_list,
        "by_building": by_building_list,
        "clients_summary": clients_summary,
        "money_calendar": money_calendar,
        "unsold_inventory": unsold_inventory,
        "action_items": action_items,
        "construction_cashflow": construction_cashflow,
        # Legacy / backward-compat
        "cash": cash,
        "sales": sales_summary,
        "calendar": calendar_legacy,
        "top_clients": top_clients if is_finance_visible else [],
        "recent_sales": recent_sales,
        "recent_inquiries": recent_inquiries,
        "alerts": alerts,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _days_since(iso, now):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (now - dt).days
    except (ValueError, AttributeError):
        return None
