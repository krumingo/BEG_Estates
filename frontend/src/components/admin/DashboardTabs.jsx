import React from "react";
import { currency, formatDate } from "../../lib/api";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from "recharts";
import { Progress } from "../ui/progress";
import {
    AlertTriangle, Clock, Hourglass, MailOpen, CheckCircle2, AlertCircle,
} from "lucide-react";

/* ============================================================
 * Shared bits
 * ============================================================ */

const TYPE_PLURAL = {
    apartment: "Апартаменти", parking: "Паркоместа", yard_parking: "Дворни паркоместа",
    garage: "Гаражи", storage: "Складове", shop: "Магазини", house: "Къщи",
    compensation: "Обезщетителни", unknown: "Други",
};
const TYPE_SINGULAR = {
    apartment: "Апартамент", parking: "Паркомясто", yard_parking: "Дворно паркомясто",
    garage: "Гараж", storage: "Склад", shop: "Магазин", house: "Къща",
    compensation: "Обезщетителен", unknown: "Друг",
};
const PIE_COLORS = ["#0f172a", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export function StatCard({ label, value, sub, accent = "neutral", testId, big = false }) {
    const accents = {
        neutral: "border-slate-200 bg-white",
        green: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white",
        amber: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white",
        red: "border-red-200 bg-gradient-to-br from-red-50 via-white to-white",
        slate: "border-slate-300 bg-gradient-to-br from-slate-50 via-white to-white",
        blue: "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white",
        violet: "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white",
        dark: "border-slate-900 bg-gradient-to-br from-slate-900 to-slate-800 text-white",
    };
    const labelColor = accent === "dark" ? "text-white/70" : "text-slate-500";
    const valueColor = accent === "dark" ? "text-white" : "text-slate-900";
    const subColor = accent === "dark" ? "text-white/60" : "text-slate-600";
    return (
        <div
            className={`rounded-2xl border ${accents[accent] || accents.neutral} p-6 shadow-sm hover:shadow-md transition-shadow backdrop-blur-sm`}
            data-testid={testId}
        >
            <div className={`text-xs uppercase tracking-wider font-semibold ${labelColor} mb-3`}>{label}</div>
            <div className={`${big ? "text-5xl" : "text-4xl"} font-medium ${valueColor} tabular-nums leading-tight`}>{value}</div>
            {sub && <div className={`text-sm ${subColor} mt-2`}>{sub}</div>}
        </div>
    );
}

export function SectionCard({ title, children, testId, hint }) {
    return (
        <section className="space-y-4" data-testid={testId}>
            {title && (
                <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-serif text-xl text-slate-900">{title}</h3>
                    {hint && <span className="text-xs text-slate-500">{hint}</span>}
                </div>
            )}
            {children}
        </section>
    );
}

function EmptyBox({ children, testId }) {
    return (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-sm text-slate-500 text-center" data-testid={testId}>
            {children}
        </div>
    );
}

/** Малка цветна клетка за status breakdown в Обзор */
function StatusCell({ label, count, color, sub, testId }) {
    const colors = {
        emerald: { bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-900" },
        amber: { bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", text: "text-amber-900" },
        orange: { bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500", text: "text-orange-900" },
        slate: { bg: "bg-slate-50", border: "border-slate-300", dot: "bg-slate-700", text: "text-slate-900" },
        violet: { bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-500", text: "text-violet-900" },
        stone: { bg: "bg-stone-50", border: "border-stone-300", dot: "bg-stone-500", text: "text-stone-700" },
    };
    const c = colors[color] || colors.slate;
    return (
        <div className={`rounded-xl border ${c.border} ${c.bg} p-4 transition-shadow hover:shadow-sm`} data-testid={testId}>
            <div className="flex items-center gap-2 mb-2">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                <div className="text-xs uppercase tracking-wider font-medium text-slate-600">{label}</div>
            </div>
            <div className={`text-3xl font-medium ${c.text} tabular-nums`}>{count}</div>
            {sub && <div className="text-xs text-slate-500 mt-1 truncate">{sub}</div>}
        </div>
    );
}

/* ============================================================
 * 1. ОБЗОР
 * ============================================================ */

export function OverviewTab({ data, isFinanceVisible }) {
    const overview = data?.overview || {};
    const sp = data?.sales_pipeline || {};
    const total = overview.total_properties ?? overview.total_count ?? 0;
    const soldPct = overview.sold_percent ?? 0;
    const reconciliation = overview.count_reconciliation_ok !== false;
    const otherCount = overview.other_count ?? 0;

    return (
        <div className="space-y-8">
            {/* HERO LINE: Sold vs Not Sold split */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Общо имоти"
                    value={total}
                    sub={`${overview.sellable_count ?? 0} продаваеми · ${overview.non_sale_count ?? 0} извън продажба`}
                    accent="dark"
                    testId="overview-card-total"
                    big
                />
                <StatCard
                    label="Продадени"
                    value={overview.sold_count ?? 0}
                    sub={`${soldPct}% от продаваемите` + (isFinanceVisible ? ` · ${currency(overview.sold_value_with_vat || 0)} с ДДС` : "")}
                    accent="green"
                    testId="overview-card-sold"
                    big
                />
                <StatCard
                    label="Непродадени"
                    value={overview.not_sold_count ?? 0}
                    sub={`${overview.market_available_count ?? 0} на пазара · ${overview.non_sale_count ?? 0} извън продажба`}
                    accent="amber"
                    testId="overview-card-not-sold"
                    big
                />
            </div>

            {/* SECOND ROW: Status breakdown — proper counting */}
            <SectionCard
                title="Статус на инвентара"
                hint={reconciliation ? "сметката е балансирана" : `⚠ ${otherCount} имота с непознат статус`}
                testId="overview-inventory-breakdown"
            >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <StatusCell
                        label="Свободни"
                        count={overview.available_count ?? 0}
                        color="emerald"
                        testId="status-cell-available"
                        sub={isFinanceVisible ? currency(overview.available_value_with_vat || 0) : null}
                    />
                    <StatusCell
                        label="Резерв. без капаро"
                        count={overview.reserved_zero_count ?? 0}
                        color="amber"
                        testId="status-cell-reserved-zero"
                    />
                    <StatusCell
                        label="С капаро"
                        count={overview.reserved_deposit_count ?? 0}
                        color="orange"
                        testId="status-cell-reserved-deposit"
                        sub={isFinanceVisible && (overview.reserved_value_with_vat || 0) > 0
                            ? currency(overview.reserved_value_with_vat) : null}
                    />
                    <StatusCell
                        label="Продадени"
                        count={overview.sold_count ?? 0}
                        color="slate"
                        testId="status-cell-sold"
                    />
                    <StatusCell
                        label="Обезщетение"
                        count={overview.compensation_count ?? 0}
                        color="violet"
                        testId="status-cell-compensation"
                        sub={isFinanceVisible && (overview.compensation_value_visual_only_with_vat || 0) > 0
                            ? `${currency(overview.compensation_value_visual_only_with_vat)} (визуално)` : "не за продажба"}
                    />
                    <StatusCell
                        label="Скрити / недост."
                        count={(overview.hidden_count ?? 0) + (overview.unavailable_count ?? 0)}
                        color="stone"
                        testId="status-cell-hidden"
                        sub={(overview.hidden_count ?? 0) + (overview.unavailable_count ?? 0) > 0 ? "не за продажба" : null}
                    />
                </div>
            </SectionCard>

            {/* FINANCE CARDS — only for finance roles */}
            {isFinanceVisible && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                        label="Продаваем потенциал"
                        value={currency(overview.sellable_potential_with_vat || 0)}
                        sub="свободни + резервирани · с ДДС"
                        accent="blue"
                        testId="overview-card-sellable-potential"
                    />
                    <StatCard
                        label="Инкасирано общо"
                        value={currency(overview.paid_total || 0)}
                        sub="платени вноски от deals"
                        accent="green"
                        testId="overview-card-paid"
                    />
                    <StatCard
                        label="Просрочено"
                        value={currency(overview.overdue_total || 0)}
                        sub={(overview.overdue_total || 0) > 0 ? "изисква внимание" : "✓ всичко наред"}
                        accent={(overview.overdue_total || 0) > 0 ? "red" : "green"}
                        testId="overview-card-overdue"
                    />
                </div>
            )}

            <SectionCard title="Продажбена фуния" testId="overview-pipeline">
                <PipelineFunnel pipeline={sp} totalSellable={overview.sellable_count ?? total} />
            </SectionCard>

            <SectionCard title="Изисква внимание" testId="overview-action-items">
                <ActionItems items={data?.action_items || []} isFinanceVisible={isFinanceVisible} />
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SectionCard title="Последни продажби" testId="overview-recent-sales">
                    <RecentSalesMini sales={data?.recent_sales || []} isFinanceVisible={isFinanceVisible} />
                </SectionCard>
                <SectionCard title="Последни запитвания" testId="overview-recent-inquiries">
                    <RecentInquiries inquiries={data?.recent_inquiries || []} />
                </SectionCard>
            </div>
        </div>
    );
}

function PipelineFunnel({ pipeline, totalSellable }) {
    const steps = [
        { key: "available", label: "Свободни", value: pipeline.available || 0 },
        { key: "reserved_zero", label: "Резерв. без капаро", value: pipeline.reserved_zero || 0 },
        { key: "reserved_deposit", label: "С капаро", value: pipeline.reserved_deposit || 0 },
        { key: "active_deals", label: "Активни сделки", value: pipeline.active_deals || 0 },
        { key: "sold", label: "Продадени", value: pipeline.sold || 0 },
    ];
    const max = Math.max(totalSellable || 1, ...steps.map((s) => s.value));
    return (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-3 shadow-sm">
            {steps.map((s) => (
                <div key={s.key} className="flex items-center gap-4" data-testid={`pipeline-step-${s.key}`}>
                    <div className="w-44 text-sm text-slate-700 font-medium shrink-0">{s.label}</div>
                    <div className="flex-1 h-7 bg-stone-100 rounded-lg overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-slate-700 to-slate-900 rounded-lg transition-all"
                            style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} />
                    </div>
                    <div className="w-16 text-right text-lg font-medium text-slate-900 shrink-0 tabular-nums">{s.value}</div>
                </div>
            ))}
        </div>
    );
}

function ActionItems({ items, isFinanceVisible }) {
    if (!items.length) {
        return (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 flex items-center gap-3 shadow-sm" data-testid="action-items-empty">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <div className="text-base font-medium text-emerald-900">✓ Всичко наред — няма проблеми за внимание</div>
            </div>
        );
    }
    const order = { high: 0, medium: 1, low: 2 };
    const sorted = [...items].sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));
    const styles = {
        high: { border: "border-red-200", bg: "bg-gradient-to-br from-red-50 to-white", title: "text-red-900", msg: "text-red-700", icon: "text-red-600" },
        medium: { border: "border-amber-200", bg: "bg-gradient-to-br from-amber-50 to-white", title: "text-amber-900", msg: "text-amber-700", icon: "text-amber-600" },
        low: { border: "border-stone-200", bg: "bg-gradient-to-br from-stone-50 to-white", title: "text-slate-900", msg: "text-slate-600", icon: "text-slate-500" },
    };
    const icons = { overdue: AlertTriangle, expiring_reservations: Hourglass, long_standing: Clock, new_inquiries: MailOpen };
    return (
        <div className="space-y-3">
            {sorted.map((it, idx) => {
                const s = styles[it.severity] || styles.low;
                const Icon = icons[it.type] || AlertCircle;
                const showAmt = it.type === "overdue" && isFinanceVisible && (it.amount || 0) > 0;
                return (
                    <div key={`${it.type}-${idx}`} className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex items-start gap-4 shadow-sm`} data-testid={`action-item-${it.type}`}>
                        <Icon className={`h-6 w-6 ${s.icon} shrink-0 mt-0.5`} />
                        <div className="flex-1 min-w-0">
                            <div className={`text-base font-medium ${s.title}`}>{it.title}</div>
                            {it.message && <div className={`text-sm mt-1 ${s.msg}`}>{it.message}</div>}
                        </div>
                        {showAmt && <div className={`text-lg font-medium ${s.title} shrink-0 tabular-nums`}>{currency(it.amount)}</div>}
                    </div>
                );
            })}
        </div>
    );
}

function RecentSalesMini({ sales, isFinanceVisible }) {
    if (!sales.length) return <EmptyBox testId="recent-sales-empty">Няма продажби.</EmptyBox>;
    return (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden" data-testid="recent-sales-mini">
            <table className="w-full text-base">
                <thead className="bg-stone-50 text-slate-600 text-sm">
                    <tr>
                        <th className="text-left p-3 font-medium">Дата</th>
                        <th className="text-left p-3 font-medium">Имот</th>
                        <th className="text-left p-3 font-medium">Купувач</th>
                        {isFinanceVisible && <th className="text-right p-3 font-medium">Цена</th>}
                    </tr>
                </thead>
                <tbody>
                    {sales.slice(0, 7).map((s) => (
                        <tr key={s.property_id} className="border-t border-stone-100">
                            <td className="p-3 text-slate-600">{formatDate(s.sold_at)}</td>
                            <td className="p-3 font-medium">{s.code}</td>
                            <td className="p-3 text-slate-700">{s.buyer_name || "—"}</td>
                            {isFinanceVisible && (
                                <td className="p-3 text-right font-medium tabular-nums">
                                    {s.list_price_with_vat != null ? currency(s.list_price_with_vat) : "—"}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RecentInquiries({ inquiries }) {
    if (!inquiries.length) return <EmptyBox testId="recent-inquiries-empty">Няма запитвания.</EmptyBox>;
    return (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden" data-testid="recent-inquiries-mini">
            <table className="w-full text-base">
                <thead className="bg-stone-50 text-slate-600 text-sm">
                    <tr>
                        <th className="text-left p-3 font-medium">Дата</th>
                        <th className="text-left p-3 font-medium">Име</th>
                        <th className="text-left p-3 font-medium">Имейл</th>
                    </tr>
                </thead>
                <tbody>
                    {inquiries.slice(0, 7).map((i) => (
                        <tr key={i.id} className="border-t border-stone-100">
                            <td className="p-3 text-slate-600">{formatDate(i.created_at)}</td>
                            <td className="p-3 font-medium">{i.name || "—"}</td>
                            <td className="p-3 text-slate-600 text-sm">{i.email || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ============================================================
 * 2. ПРОДАЖБИ
 * ============================================================ */

export function SalesTab({ data, isFinanceVisible, onTypeClick }) {
    const byType = data?.by_type || [];
    const byFloor = data?.by_floor || [];
    const byBuilding = data?.by_building || [];

    const typeChartData = byType.map((r) => ({
        name: TYPE_PLURAL[r.type] || r.type,
        type: r.type,
        Продадени: r.sold,
        Свободни: r.available,
        Резервирани: r.reserved,
    }));

    const floorChartData = byFloor.map((r) => ({
        name: r.floor === 0 ? "Партер" : (r.floor < 0 ? `Парк ${r.floor}` : `Ет ${r.floor}`),
        Продадени: r.sold,
        Свободни: r.available,
        Резервирани: r.reserved,
    }));

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SectionCard title="По тип имот" testId="sales-chart-type">
                    {typeChartData.length === 0 ? (
                        <EmptyBox>Няма данни.</EmptyBox>
                    ) : (
                        <div className="rounded-2xl border border-stone-200 bg-white p-5 h-80 shadow-sm">
                            <ResponsiveContainer>
                                <BarChart data={typeChartData}
                                    onClick={(e) => onTypeClick && e?.activePayload?.[0]?.payload?.type
                                        && onTypeClick(e.activePayload[0].payload.type)}>
                                    <XAxis dataKey="name" fontSize={12} />
                                    <YAxis fontSize={12} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: 13 }} />
                                    <Bar dataKey="Продадени" stackId="a" fill="#0f172a" />
                                    <Bar dataKey="Резервирани" stackId="a" fill="#f59e0b" />
                                    <Bar dataKey="Свободни" stackId="a" fill="#10b981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="По етаж" testId="sales-chart-floor">
                    {floorChartData.length === 0 ? (
                        <EmptyBox>Няма данни.</EmptyBox>
                    ) : (
                        <div className="rounded-2xl border border-stone-200 bg-white p-5 h-80 shadow-sm">
                            <ResponsiveContainer>
                                <BarChart data={floorChartData}>
                                    <XAxis dataKey="name" fontSize={12} />
                                    <YAxis fontSize={12} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ fontSize: 13 }} />
                                    <Bar dataKey="Продадени" stackId="a" fill="#0f172a" />
                                    <Bar dataKey="Резервирани" stackId="a" fill="#f59e0b" />
                                    <Bar dataKey="Свободни" stackId="a" fill="#10b981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </SectionCard>
            </div>

            <SectionCard title="Таблица по тип" testId="sales-table-type">
                <BreakdownTable rows={byType} keyField="type" labelMap={TYPE_PLURAL} isFinanceVisible={isFinanceVisible} onClick={onTypeClick} />
            </SectionCard>

            <SectionCard title="Таблица по етаж" testId="sales-table-floor">
                <BreakdownTable rows={byFloor} keyField="floor" labelMap={null}
                    formatLabel={(f) => f === 0 ? "Партер" : (f < 0 ? `Паркинг ${f}` : `Етаж ${f}`)}
                    isFinanceVisible={isFinanceVisible} />
            </SectionCard>

            {byBuilding.length > 0 && (
                <SectionCard title="Таблица по сграда" testId="sales-table-building">
                    <BreakdownTable rows={byBuilding} keyField="building_id" labelMap={null}
                        formatLabel={(_, row) => row.name || "—"}
                        isFinanceVisible={isFinanceVisible} />
                </SectionCard>
            )}
        </div>
    );
}

function BreakdownTable({ rows, keyField, labelMap, formatLabel, isFinanceVisible, onClick }) {
    if (!rows || rows.length === 0) return <EmptyBox>Няма данни.</EmptyBox>;
    return (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-base">
                <thead className="bg-stone-50 text-slate-600 text-sm">
                    <tr>
                        <th className="text-left p-3 font-medium">{keyField === "type" ? "Тип" : keyField === "floor" ? "Етаж" : "Сграда"}</th>
                        <th className="text-right p-3 font-medium">Общо</th>
                        <th className="text-right p-3 font-medium">Продадени</th>
                        <th className="text-right p-3 font-medium">Свободни</th>
                        <th className="text-right p-3 font-medium">Резервирани</th>
                        {isFinanceVisible && <th className="text-right p-3 font-medium">Потенциал €</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, idx) => {
                        const k = r[keyField] ?? `idx-${idx}`;
                        const label = formatLabel ? formatLabel(r[keyField], r) : (labelMap?.[r[keyField]] || r[keyField] || "—");
                        const clickable = onClick && keyField === "type";
                        return (
                            <tr key={k} className={`border-t border-stone-100 ${clickable ? "hover:bg-slate-50 cursor-pointer" : ""}`}
                                onClick={() => clickable && onClick(r[keyField])}
                                data-testid={`breakdown-row-${keyField}-${k}`}>
                                <td className="p-3 font-medium text-slate-900">{label}</td>
                                <td className="p-3 text-right tabular-nums">{r.total || 0}</td>
                                <td className="p-3 text-right tabular-nums">{r.sold || 0}</td>
                                <td className="p-3 text-right tabular-nums">{r.available || 0}</td>
                                <td className="p-3 text-right tabular-nums">{r.reserved || 0}</td>
                                {isFinanceVisible && (
                                    <td className="p-3 text-right font-medium tabular-nums">
                                        {(r.available_value_with_vat || 0) > 0 ? currency(r.available_value_with_vat) : "—"}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/* ============================================================
 * 3. ФИНАНСИ
 * ============================================================ */

export function FinanceTab({ data }) {
    const finance = data?.finance;
    if (!finance) {
        return <EmptyBox testId="finance-no-access">Финансовият преглед не е достъпен за вашата роля.</EmptyBox>;
    }
    const remPercent = finance.contracted_net > 0
        ? Math.round((finance.paid_total / finance.contracted_net) * 100) : 0;

    const modeData = [
        { name: "Банков кредит — платено", value: finance.by_payment_mode.bank_paid },
        { name: "Банков кредит — очаквано", value: finance.by_payment_mode.bank_expected },
        { name: "Лични — платено", value: finance.by_payment_mode.own_paid },
        { name: "Лични — очаквано", value: finance.by_payment_mode.own_expected },
    ].filter((d) => d.value > 0);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Договорено" value={currency(finance.contracted_net)} sub="без ДДС" testId="finance-card-contracted" />
                <StatCard label="Платени" value={currency(finance.paid_total)} accent="green" testId="finance-card-paid" />
                <StatCard label="Капаро (платено)" value={currency(finance.deposit_paid)} accent="slate" testId="finance-card-deposit" />
                <StatCard label="Остава" value={currency(finance.remaining_net)} accent="amber" testId="finance-card-remaining" />
                <StatCard label="Очаквано" value={currency(finance.expected_total)} testId="finance-card-expected" />
                <StatCard
                    label="Просрочено"
                    value={currency(finance.overdue_total)}
                    sub={finance.overdue_count > 0 ? `${finance.overdue_count} вноски` : "✓ няма"}
                    accent={finance.overdue_total > 0 ? "red" : "green"}
                    testId="finance-card-overdue"
                />
            </div>

            <SectionCard title="Прогрес платено / договорено" testId="finance-progress">
                <div className="rounded-xl border border-stone-200 bg-white p-5">
                    <div className="flex justify-between text-sm text-slate-700 mb-2">
                        <span>{currency(finance.paid_total)}</span>
                        <span>{remPercent}%</span>
                        <span>{currency(finance.contracted_net)}</span>
                    </div>
                    <Progress value={remPercent} className="h-2" />
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Очаквано — 7 дни" value={currency(finance.expected_7d)} testId="finance-7d" />
                <StatCard label="Очаквано — 30 дни" value={currency(finance.expected_30d)} testId="finance-30d" />
                <StatCard label="Очаквано — 90 дни" value={currency(finance.expected_90d)} testId="finance-90d" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SectionCard title="Платени по месец" testId="finance-paid-by-month">
                    <MonthChart data={finance.paid_by_month || []} color="#10b981" />
                </SectionCard>
                <SectionCard title="Очаквани по месец" testId="finance-expected-by-month">
                    <MonthChart data={finance.expected_by_month || []} color="#0f172a" />
                </SectionCard>
            </div>

            <SectionCard title="Payment mode breakdown" testId="finance-mode">
                {modeData.length === 0 ? (
                    <EmptyBox>Няма payment данни.</EmptyBox>
                ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white p-5 h-80 shadow-sm">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={modeData} dataKey="value" nameKey="name" outerRadius={100} label>
                                    {modeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie>
                                <Legend wrapperStyle={{ fontSize: 13 }} />
                                <Tooltip formatter={(v) => currency(v)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}

function MonthChart({ data, color }) {
    const max = Math.max(...data.map((d) => d.amount || 0), 1);
    const hasData = data.some((d) => (d.amount || 0) > 0);
    if (!hasData) return <EmptyBox>Няма данни за следващите 12 месеца.</EmptyBox>;
    return (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 h-72 shadow-sm">
            <ResponsiveContainer>
                <BarChart data={data}>
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => currency(v)} />
                    <Bar dataKey="amount" fill={color} radius={[6, 6, 0, 0]} maxBarSize={42} />
                </BarChart>
            </ResponsiveContainer>
            <div className="text-xs text-slate-400 mt-1">max {currency(max)}</div>
        </div>
    );
}

/* ============================================================
 * 4. КАЛЕНДАР
 * ============================================================ */

export function CalendarTab({ data, isFinanceVisible }) {
    const cal = data?.money_calendar;
    if (!isFinanceVisible) return <EmptyBox testId="calendar-no-access">Календарът не е достъпен за вашата роля.</EmptyBox>;
    if (!cal) return <EmptyBox testId="calendar-no-access">Календарът не е достъпен за вашата роля.</EmptyBox>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Тази седмица" value={currency(cal.this_week.amount)} sub={`${cal.this_week.count} вноски`} testId="cal-week" />
                <StatCard label="Този месец" value={currency(cal.this_month.amount)} sub={`${cal.this_month.count} вноски`} testId="cal-month" />
                <StatCard label="Тримесечие" value={currency(cal.this_quarter.amount)} sub={`${cal.this_quarter.count} вноски`} testId="cal-quarter" />
            </div>

            <SectionCard title="Очаквано по месец" testId="cal-bar-chart">
                <MonthChart data={(cal.by_month || []).map((m) => ({ ...m, amount: m.expected }))} color="#0f172a" />
            </SectionCard>

            <SectionCard title={`Предстоящи вноски (${cal.upcoming?.length || 0})`} testId="cal-upcoming">
                <InstallmentsTable rows={cal.upcoming} emptyText="Няма предстоящи вноски." />
            </SectionCard>

            <SectionCard title={`Просрочени вноски (${cal.overdue?.length || 0})`} testId="cal-overdue">
                <InstallmentsTable rows={cal.overdue} emptyText="Няма просрочени вноски." overdue />
            </SectionCard>
        </div>
    );
}

function InstallmentsTable({ rows, emptyText, overdue }) {
    if (!rows || rows.length === 0) return <EmptyBox>{emptyText}</EmptyBox>;
    return (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-base">
                <thead className="bg-stone-50 text-slate-600 text-sm">
                    <tr>
                        <th className="text-left p-3 font-medium">Дата</th>
                        <th className="text-left p-3 font-medium">Клиент</th>
                        <th className="text-left p-3 font-medium">Имот</th>
                        <th className="text-left p-3 font-medium">Етикет</th>
                        <th className="text-right p-3 font-medium">Сума</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, idx) => (
                        <tr key={`${r.deal_id}-${idx}`} className={`border-t border-stone-100 ${overdue ? "bg-red-50/30" : ""}`}>
                            <td className="p-3 text-slate-600 whitespace-nowrap">{formatDate(r.expected_date)}</td>
                            <td className="p-3 text-slate-700">{r.client_name || "—"}</td>
                            <td className="p-3 font-medium">{(r.property_codes || []).join(", ") || "—"}</td>
                            <td className="p-3 text-slate-600 text-xs">{r.label || "—"}</td>
                            <td className="p-3 text-right font-medium">{currency(r.amount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ============================================================
 * 5. КЛИЕНТИ
 * ============================================================ */

export function ClientsTab({ data, isFinanceVisible }) {
    const clients = data?.clients_summary || [];
    if (!isFinanceVisible) {
        return <EmptyBox testId="clients-no-access">Видимостта за клиенти е достъпна само за финансови роли.</EmptyBox>;
    }
    if (clients.length === 0) return <EmptyBox testId="clients-empty">Няма сделки с регистрирани клиенти.</EmptyBox>;

    const statusBadge = (s) => {
        const map = {
            overdue: { color: "bg-red-100 text-red-700", label: "Просрочен" },
            in_progress: { color: "bg-amber-100 text-amber-700", label: "В процес" },
            completed: { color: "bg-emerald-100 text-emerald-700", label: "Завършен" },
            no_payment: { color: "bg-stone-100 text-slate-600", label: "Без плащане" },
            ok: { color: "bg-stone-100 text-slate-600", label: "—" },
        };
        const v = map[s] || map.ok;
        return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${v.color}`}>{v.label}</span>;
    };

    return (
        <SectionCard title={`Клиенти със сделки (${clients.length})`} testId="clients-table">
            <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
                <table className="w-full text-base">
                    <thead className="bg-stone-50 text-slate-600 text-sm">
                        <tr>
                            <th className="text-left p-3 font-medium">Клиент</th>
                            <th className="text-left p-3 font-medium">Имоти</th>
                            <th className="text-right p-3 font-medium">Договорено</th>
                            <th className="text-right p-3 font-medium">Платено</th>
                            <th className="text-right p-3 font-medium">Остава</th>
                            <th className="text-right p-3 font-medium">Просроч.</th>
                            <th className="text-left p-3 font-medium">Следваща</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((c) => (
                            <tr key={c.client_id} className="border-t border-stone-100" data-testid={`client-row-${c.client_id}`}>
                                <td className="p-3">
                                    <div className="font-medium text-slate-900">{c.name || "(без име)"}</div>
                                    {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                                </td>
                                <td className="p-3 text-slate-600 text-xs">
                                    <span className="font-medium text-slate-700">{c.property_count}</span>{" "}
                                    {c.properties.slice(0, 3).join(", ")}
                                    {c.properties.length > 3 && ` +${c.properties.length - 3}`}
                                </td>
                                <td className="p-3 text-right font-medium">{currency(c.contracted_net)}</td>
                                <td className="p-3 text-right text-emerald-700">{currency(c.paid)}</td>
                                <td className="p-3 text-right text-slate-700">{currency(c.remaining)}</td>
                                <td className={`p-3 text-right ${c.overdue > 0 ? "text-red-700 font-medium" : "text-slate-400"}`}>
                                    {c.overdue > 0 ? currency(c.overdue) : "—"}
                                </td>
                                <td className="p-3 text-xs text-slate-600">
                                    {c.next_due_date ? (
                                        <>
                                            {formatDate(c.next_due_date)}<br />
                                            <span className="text-slate-500">{currency(c.next_due_amount)}</span>
                                        </>
                                    ) : "—"}
                                </td>
                                <td className="p-3">{statusBadge(c.payment_status)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

/* ============================================================
 * 6. НЕПРОДАДЕНИ
 * ============================================================ */

export function UnsoldTab({ data, isFinanceVisible }) {
    const u = data?.unsold_inventory;
    if (!u) return <EmptyBox>Няма данни.</EmptyBox>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Свободни имоти" value={u.count} sub={`+${u.reserved_count} резервирани`} testId="unsold-count" />
                {isFinanceVisible && (
                    <>
                        <StatCard label="Потенциал" value={currency(u.potential_with_vat)} sub="с ДДС" accent="amber" testId="unsold-potential" />
                        <StatCard label="Средна цена" value={currency(u.average_price_with_vat)} sub="с ДДС" testId="unsold-avg" />
                    </>
                )}
                <StatCard
                    label="Над 90 дни"
                    value={u.long_standing_count}
                    sub={u.long_standing_count > 0 ? "помисли отстъпка" : "✓ няма"}
                    accent={u.long_standing_count > 0 ? "red" : "green"}
                    testId="unsold-long-standing"
                />
            </div>

            <SectionCard title={`Непродаден инвентар (${u.rows?.length || 0})`} testId="unsold-table">
                {!u.rows || u.rows.length === 0 ? (
                    <EmptyBox>Няма непродадени имоти.</EmptyBox>
                ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
                        <table className="w-full text-base">
                            <thead className="bg-stone-50 text-slate-600 text-sm">
                                <tr>
                                    <th className="text-left p-3 font-medium">Код</th>
                                    <th className="text-left p-3 font-medium">Тип</th>
                                    <th className="text-right p-3 font-medium">Етаж</th>
                                    <th className="text-right p-3 font-medium">м²</th>
                                    {isFinanceVisible && <th className="text-right p-3 font-medium">Цена с ДДС</th>}
                                    <th className="text-left p-3 font-medium">Статус</th>
                                    <th className="text-right p-3 font-medium">Дни</th>
                                    <th className="text-left p-3 font-medium">Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {u.rows.map((p) => (
                                    <tr key={p.id} className="border-t border-stone-100" data-testid={`unsold-row-${p.code}`}>
                                        <td className="p-3 font-mono">{p.code}</td>
                                        <td className="p-3 text-slate-600">{TYPE_SINGULAR[p.property_type] || p.property_type}</td>
                                        <td className="p-3 text-right">{p.floor}</td>
                                        <td className="p-3 text-right">{p.area_total ?? "—"}</td>
                                        {isFinanceVisible && (
                                            <td className="p-3 text-right font-medium">
                                                {p.list_price_with_vat != null ? currency(p.list_price_with_vat) : "—"}
                                            </td>
                                        )}
                                        <td className="p-3 text-xs text-slate-600">{p.status}</td>
                                        <td className="p-3 text-right text-xs text-slate-600">{p.days_since_created ?? "—"}</td>
                                        <td className="p-3">
                                            {p.risk_long_standing ? (
                                                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                                    &gt; 90 дни
                                                </span>
                                            ) : (
                                                <span className="text-stone-400 text-xs">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
