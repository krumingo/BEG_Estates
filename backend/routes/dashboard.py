"""Dashboard stats + inquiries.

R.5: Разширен dashboard с финансови данни:
- Кеш (платено / очаквано / закъснели)
- Продажби (продадено / остава / по тип)
- Календар вноски (тази седмица / месец / година)
- Топ клиенти
- Последни продажби
- Изисква внимание
"""
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
import uuid

from auth.dependencies import get_current_user, require_staff
from db import get_db
from models import InquiryCreate
from routes.audit import log_action
from constants import Role

router = APIRouter(tags=["dashboard"])


VAT_RATE = 0.20


def with_vat(amount):
    """Добавя 20% ДДС."""
    if amount is None:
        return 0.0
    return round(amount * (1 + VAT_RATE), 2)


def safe_sum(items, key="amount"):
    """Сумира безопасно (None → 0)."""
    return sum((float(i.get(key) or 0) for i in items))


@router.get("/dashboard/admin")
async def admin_dashboard(user=Depends(require_staff())):
    """LEGACY endpoint — пази обратна съвместимост."""
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    stale = await db.reservations.find(
        {"status": "active", "expires_at": {"$lt": now_iso}}, {"_id": 0, "id": 1, "property_id": 1}
    ).to_list(200)
    for r in stale:
        await db.reservations.update_one({"id": r["id"]}, {"$set": {"status": "expired"}})
        await db.properties.update_one(
            {"id": r["property_id"], "status": {"$in": ["reserved_zero_deposit", "reserved_paid_deposit"]}},
            {"$set": {"status": "available"}},
        )

    total_props = await db.properties.count_documents({})
    free = await db.properties.count_documents({"status": "available"})
    reserved_zero = await db.properties.count_documents({"status": "reserved_zero_deposit"})
    reserved_dep = await db.properties.count_documents({"status": "reserved_paid_deposit"})
    sold = await db.properties.count_documents({"status": "sold"})
    compensation = await db.properties.count_documents({"status": "compensation"})
    hidden = await db.properties.count_documents({"status": "hidden"})
    active_zero = await db.reservations.count_documents({"status": "active", "reservation_type": "zero_deposit"})

    soon = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
    expiring_soon = await db.reservations.count_documents({"status": "active", "expires_at": {"$lte": soon}})

    total_clients = await db.users.count_documents({"role": "client"})
    total_projects = await db.projects.count_documents({})

    recent_inquiries = await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_reservations = await db.reservations.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for r in recent_reservations:
        r["property"] = await db.properties.find_one({"id": r["property_id"]}, {"_id": 0})
        r["client"] = await db.users.find_one(
            {"id": r["client_id"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0}
        )

    payments = await db.payments.find({}, {"_id": 0, "amount": 1}).to_list(1000)
    total_collected = sum(p.get("amount", 0) for p in payments)

    return {
        "kpi": {
            "total_properties": total_props,
            "free": free,
            "reserved_zero": reserved_zero,
            "reserved_deposit": reserved_dep,
            "preliminary": reserved_dep,
            "sold": sold,
            "compensation": compensation,
            "hidden": hidden,
            "active_zero_deposit": active_zero,
            "expiring_soon": expiring_soon,
            "total_clients": total_clients,
            "total_projects": total_projects,
            "total_collected": total_collected,
        },
        "recent_inquiries": recent_inquiries,
        "recent_reservations": recent_reservations,
    }


@router.get("/dashboard/admin/full")
async def admin_dashboard_full(
    project_id: str = Query(None, description="Optional filter to specific project"),
    user=Depends(require_staff()),
):
    """R.5: Пълен финансов dashboard."""
    db = get_db()
    is_finance_visible = user.get("role") in (Role.SUPER_ADMIN.value, Role.ADMIN.value)

    prop_filter = {"project_id": project_id} if project_id else {}

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    stale = await db.reservations.find(
        {"status": "active", "expires_at": {"$lt": now_iso}}, {"_id": 0, "id": 1, "property_id": 1}
    ).to_list(200)
    for r in stale:
        await db.reservations.update_one({"id": r["id"]}, {"$set": {"status": "expired"}})
        await db.properties.update_one(
            {"id": r["property_id"], "status": {"$in": ["reserved_zero_deposit", "reserved_paid_deposit"]}},
            {"$set": {"status": "available"}},
        )

    all_props = await db.properties.find(prop_filter, {"_id": 0}).to_list(1000)
    prop_ids = [p["id"] for p in all_props]

    # CASH
    cash = None
    if is_finance_visible:
        pay_filter = {"property_id": {"$in": prop_ids}} if project_id else {}
        payments = await db.payments.find(pay_filter, {"_id": 0, "amount": 1}).to_list(5000)
        total_paid = safe_sum(payments)

        inst_filter = {"status": "предстоящо"}
        if project_id:
            inst_filter["property_id"] = {"$in": prop_ids}
        all_pending = await db.payment_installments.find(
            inst_filter, {"_id": 0, "amount": 1, "due_date": 1, "property_id": 1, "client_id": 1}
        ).to_list(5000)
        total_expected = safe_sum(all_pending)

        overdue = [i for i in all_pending if i.get("due_date", "") < now_iso]
        total_overdue = safe_sum(overdue)
        overdue_client_ids = list({i.get("client_id") for i in overdue if i.get("client_id")})

        cash = {
            "paid": round(total_paid, 2),
            "expected": round(total_expected, 2),
            "overdue": round(total_overdue, 2),
            "overdue_clients_count": len(overdue_client_ids),
        }

    # SALES BY TYPE
    by_type = defaultdict(lambda: {
        "type": "", "total": 0, "sold": 0, "available": 0,
        "reserved": 0, "compensation": 0,
        "sold_value_net": 0.0, "available_value_net": 0.0,
    })

    for p in all_props:
        ptype = p.get("property_type", "unknown")
        status = p.get("status", "")
        lp = float(p.get("list_price") or 0)
        rec = by_type[ptype]
        rec["type"] = ptype
        rec["total"] += 1
        if status == "sold":
            rec["sold"] += 1
            rec["sold_value_net"] += lp
        elif status == "available":
            rec["available"] += 1
            rec["available_value_net"] += lp
        elif status in ("reserved_zero_deposit", "reserved_paid_deposit"):
            rec["reserved"] += 1
        elif status == "compensation":
            rec["compensation"] += 1

    by_type_list = []
    for ptype, rec in by_type.items():
        rec["sold_value_with_vat"] = with_vat(rec["sold_value_net"])
        rec["available_value_with_vat"] = with_vat(rec["available_value_net"])
        by_type_list.append(rec)
    by_type_list.sort(key=lambda x: -x["total"])

    total_sold = sum(r["sold"] for r in by_type_list)
    total_available = sum(r["available"] for r in by_type_list)
    total_reserved = sum(r["reserved"] for r in by_type_list)
    total_compensation = sum(r["compensation"] for r in by_type_list)
    total_count = len(all_props)

    sales_summary = {
        "total_count": total_count,
        "sold_count": total_sold,
        "available_count": total_available,
        "reserved_count": total_reserved,
        "compensation_count": total_compensation,
        "by_type": by_type_list,
    }

    if is_finance_visible:
        sold_value_net = sum(r["sold_value_net"] for r in by_type_list)
        avail_value_net = sum(r["available_value_net"] for r in by_type_list)
        sales_summary["sold_value_net"] = round(sold_value_net, 2)
        sales_summary["sold_value_with_vat"] = with_vat(sold_value_net)
        sales_summary["available_value_net"] = round(avail_value_net, 2)
        sales_summary["available_value_with_vat"] = with_vat(avail_value_net)
        sales_summary["total_value_net"] = round(sold_value_net + avail_value_net, 2)
        sales_summary["total_value_with_vat"] = with_vat(sold_value_net + avail_value_net)
        sales_summary["sold_percent"] = round((total_sold / total_count * 100), 1) if total_count else 0

    # CALENDAR
    calendar = None
    if is_finance_visible:
        inst_filter = {"status": "предстоящо"}
        if project_id:
            inst_filter["property_id"] = {"$in": prop_ids}
        installments = await db.payment_installments.find(
            inst_filter, {"_id": 0, "amount": 1, "due_date": 1, "property_id": 1, "client_id": 1}
        ).to_list(5000)

        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = (today + timedelta(days=7)).isoformat()
        month_end = (today + timedelta(days=30)).isoformat()
        year_end = (today + timedelta(days=365)).isoformat()

        this_week = [i for i in installments if i.get("due_date", "") <= week_end and i.get("due_date", "") >= now_iso]
        this_month = [i for i in installments if i.get("due_date", "") <= month_end and i.get("due_date", "") >= now_iso]
        this_year = [i for i in installments if i.get("due_date", "") <= year_end and i.get("due_date", "") >= now_iso]

        monthly = defaultdict(float)
        for i in installments:
            try:
                dt_str = i.get("due_date", "").replace("Z", "+00:00")
                dt = datetime.fromisoformat(dt_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt < now:
                    continue
                key = f"{dt.year}-{dt.month:02d}"
                monthly[key] += float(i.get("amount") or 0)
            except (ValueError, KeyError):
                continue

        months_list = []
        for offset in range(12):
            target = today + timedelta(days=30 * offset)
            key = f"{target.year}-{target.month:02d}"
            months_list.append({
                "month": key,
                "label": target.strftime("%b %Y"),
                "amount": round(monthly.get(key, 0), 2),
            })

        upcoming = sorted(
            [i for i in installments if i.get("due_date", "") >= now_iso],
            key=lambda x: x.get("due_date", "")
        )[:10]

        for inst in upcoming:
            if inst.get("client_id"):
                client = await db.users.find_one({"id": inst["client_id"]}, {"_id": 0, "name": 1})
                inst["client_name"] = client.get("name") if client else None
            if inst.get("property_id"):
                prop = await db.properties.find_one({"id": inst["property_id"]}, {"_id": 0, "code": 1})
                inst["property_code"] = prop.get("code") if prop else None

        calendar = {
            "this_week": {"amount": round(safe_sum(this_week), 2), "count": len(this_week)},
            "this_month": {"amount": round(safe_sum(this_month), 2), "count": len(this_month)},
            "this_year": {"amount": round(safe_sum(this_year), 2), "count": len(this_year)},
            "by_month": months_list,
            "upcoming": upcoming,
        }

    # TOP CLIENTS
    top_clients = []
    if is_finance_visible:
        sold_props = [p for p in all_props if p.get("status") == "sold" and p.get("buyer_id")]
        by_buyer = defaultdict(lambda: {"count": 0, "value_net": 0.0, "properties": []})
        for p in sold_props:
            buyer_id = p["buyer_id"]
            by_buyer[buyer_id]["count"] += 1
            by_buyer[buyer_id]["value_net"] += float(p.get("list_price") or 0)
            by_buyer[buyer_id]["properties"].append(p.get("code"))

        top5 = sorted(by_buyer.items(), key=lambda kv: -kv[1]["value_net"])[:5]

        for buyer_id, data in top5:
            client = await db.users.find_one(
                {"id": buyer_id},
                {"_id": 0, "name": 1, "email": 1, "phone": 1}
            )
            if client:
                top_clients.append({
                    "client_id": buyer_id,
                    "name": client.get("name"),
                    "email": client.get("email"),
                    "count": data["count"],
                    "properties": data["properties"][:5],
                    "value_net": round(data["value_net"], 2),
                    "value_with_vat": with_vat(data["value_net"]),
                })

    # RECENT SALES
    sold_props_recent = [p for p in all_props if p.get("status") == "sold"]
    sold_props_recent.sort(key=lambda x: x.get("updated_at") or x.get("created_at", ""), reverse=True)
    recent_sales = []
    for p in sold_props_recent[:10]:
        rec = {
            "property_id": p["id"],
            "code": p.get("code"),
            "property_type": p.get("property_type"),
            "list_price_net": float(p.get("list_price") or 0),
            "list_price_with_vat": with_vat(p.get("list_price") or 0) if is_finance_visible else None,
            "buyer_id": p.get("buyer_id"),
            "buyer_name": None,
            "sold_at": p.get("updated_at") or p.get("created_at"),
        }
        if p.get("buyer_id"):
            buyer = await db.users.find_one({"id": p["buyer_id"]}, {"_id": 0, "name": 1})
            if buyer:
                rec["buyer_name"] = buyer.get("name")
        recent_sales.append(rec)

    # RECENT INQUIRIES
    recent_inquiries = await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    # ALERTS
    alerts = []

    if is_finance_visible and cash and cash["overdue"] > 0:
        alerts.append({
            "type": "overdue",
            "severity": "high",
            "title": f"{cash['overdue_clients_count']} закъснели вноски",
            "amount": cash["overdue"],
            "message": f"{round(cash['overdue']):,}€ с просрочен срок",
        })

    next_30_days = (now + timedelta(days=30)).isoformat()
    expiring = await db.reservations.find({
        "status": "active",
        "expires_at": {"$lte": next_30_days, "$gte": now_iso}
    }, {"_id": 0}).to_list(100)
    if expiring:
        alerts.append({
            "type": "expiring_reservations",
            "severity": "medium",
            "title": f"{len(expiring)} капарирани изтичат до 30 дни",
            "count": len(expiring),
            "message": "Подпиши договор или капарото ще бъде освободено",
        })

    ninety_days_ago = (now - timedelta(days=90)).isoformat()
    long_standing = [
        p for p in all_props
        if p.get("status") == "available"
        and (p.get("created_at") or "") < ninety_days_ago
    ]
    if long_standing:
        alerts.append({
            "type": "long_standing",
            "severity": "low",
            "title": f"{len(long_standing)} имота стоят > 90 дни",
            "count": len(long_standing),
            "message": "Помисли отстъпка или промоция",
        })

    seven_days_ago = (now - timedelta(days=7)).isoformat()
    recent_inq_count = await db.inquiries.count_documents({"created_at": {"$gte": seven_days_ago}})
    if recent_inq_count > 0:
        alerts.append({
            "type": "new_inquiries",
            "severity": "low",
            "title": f"{recent_inq_count} нови запитвания",
            "count": recent_inq_count,
            "message": "Последни 7 дни — обади се",
        })

    return {
        "is_finance_visible": is_finance_visible,
        "project_id": project_id,
        "cash": cash,
        "sales": sales_summary,
        "calendar": calendar,
        "top_clients": top_clients,
        "recent_sales": recent_sales,
        "recent_inquiries": recent_inquiries,
        "alerts": alerts,
        "generated_at": now_iso,
    }


@router.post("/inquiries")
async def create_inquiry(payload: InquiryCreate):
    db = get_db()
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["status"] = "new"
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.inquiries.insert_one(doc)
    await log_action(None, "inquiry_create", "inquiry", doc["id"], {"email": doc["email"]})
    doc.pop("_id", None)
    return doc


@router.get("/inquiries")
async def list_inquiries(_=Depends(require_staff())):
    db = get_db()
    return await db.inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
