import React from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { currency, formatDate } from "../../lib/api";

/**
 * R.5 Част 4: Календар на вноски.
 *
 * Включва:
 *   1. 3 малки карти: Тази седмица / Този месец / Тази година
 *   2. Bar chart 12 месеца напред
 *   3. Таблица с 10 предстоящи вноски
 *
 * Props:
 *   calendar: { this_week, this_month, this_year, by_month[], upcoming[] } | null
 *   loading: bool
 */

function PeriodCard({ label, amount, count }) {
    return (
        <div
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            data-testid={`calendar-period-${label.replace(/\s+/g, "-").toLowerCase()}`}
        >
            <div className="text-xs uppercase tracking-wider font-medium text-slate-500 mb-2">
                {label}
            </div>
            <div className="text-2xl font-medium text-slate-900 mb-1">
                {currency(amount || 0)}
            </div>
            <div className="text-xs text-slate-600">
                {count || 0} {count === 1 ? "вноска" : "вноски"}
            </div>
        </div>
    );
}

function MonthBar({ month, label, amount, maxAmount }) {
    const widthPercent = maxAmount > 0 ? Math.round((amount / maxAmount) * 100) : 0;
    return (
        <div
            className="flex items-center gap-3"
            data-testid={`calendar-month-bar-${month}`}
        >
            <div className="w-20 text-xs text-slate-600 font-medium shrink-0">
                {label}
            </div>
            <div className="flex-1 h-6 bg-stone-100 rounded overflow-hidden relative">
                {amount > 0 && (
                    <div
                        className="h-full bg-slate-700 rounded transition-all"
                        style={{ width: `${Math.max(2, widthPercent)}%` }}
                    />
                )}
            </div>
            <div className="w-32 text-right text-xs text-slate-700 shrink-0">
                {amount > 0 ? currency(amount) : <span className="text-stone-400">—</span>}
            </div>
        </div>
    );
}

export default function CalendarSection({ calendar, loading = false }) {
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="rounded-xl border border-stone-200 bg-white p-5 h-24 animate-pulse"
                            data-testid="calendar-skeleton-card"
                        >
                            <div className="h-3 bg-stone-200 rounded w-24 mb-2" />
                            <div className="h-6 bg-stone-200 rounded w-32" />
                        </div>
                    ))}
                </div>
                <div
                    className="rounded-xl border border-stone-200 bg-white p-6 h-64 animate-pulse"
                    data-testid="calendar-skeleton-chart"
                />
            </div>
        );
    }

    if (!calendar) return null;

    const byMonth = calendar.by_month || [];
    const maxMonthAmount = Math.max(...byMonth.map((m) => m.amount || 0), 0);
    const upcoming = calendar.upcoming || [];
    const hasAnyData =
        (calendar.this_year?.amount || 0) > 0 ||
        upcoming.length > 0 ||
        maxMonthAmount > 0;

    return (
        <div className="space-y-4">
            {/* 3 МАЛКИ КАРТИ ПЕРИОДИ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PeriodCard
                    label="Тази седмица"
                    amount={calendar.this_week?.amount}
                    count={calendar.this_week?.count}
                />
                <PeriodCard
                    label="Този месец"
                    amount={calendar.this_month?.amount}
                    count={calendar.this_month?.count}
                />
                <PeriodCard
                    label="Тази година"
                    amount={calendar.this_year?.amount}
                    count={calendar.this_year?.count}
                />
            </div>

            {/* BAR CHART 12 МЕСЕЦА */}
            <div
                className="rounded-xl border border-stone-200 bg-white p-6"
                data-testid="calendar-bar-chart"
            >
                <div className="flex items-center gap-2 mb-4">
                    <CalendarIcon
                        className="h-4 w-4 text-slate-500"
                        strokeWidth={1.5}
                    />
                    <div className="text-sm font-medium text-slate-700">
                        Очаквани вноски по месец (12 месеца напред)
                    </div>
                </div>
                {maxMonthAmount > 0 ? (
                    <div className="space-y-2">
                        {byMonth.map((m) => (
                            <MonthBar
                                key={m.month}
                                month={m.month}
                                label={m.label}
                                amount={m.amount}
                                maxAmount={maxMonthAmount}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-slate-500 py-4 text-center">
                        Няма предстоящи вноски в следващите 12 месеца
                    </div>
                )}
            </div>

            {/* ТАБЛИЦА UPCOMING INSTALLMENTS */}
            <div
                className="rounded-xl border border-stone-200 bg-white overflow-hidden"
                data-testid="calendar-upcoming-table"
            >
                <div className="flex items-center gap-2 p-4 border-b border-stone-100">
                    <Clock className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
                    <div className="text-sm font-medium text-slate-700">
                        Предстоящи вноски (10 най-близки)
                    </div>
                </div>
                {upcoming.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="text-left p-3 font-medium">Дата</th>
                                <th className="text-left p-3 font-medium">Клиент</th>
                                <th className="text-left p-3 font-medium">Имот</th>
                                <th className="text-right p-3 font-medium">Сума</th>
                            </tr>
                        </thead>
                        <tbody>
                            {upcoming.map((inst, idx) => (
                                <tr
                                    key={inst.id || `${inst.due_date}-${idx}`}
                                    className="border-t border-stone-100 hover:bg-stone-50"
                                    data-testid={`calendar-upcoming-row-${idx}`}
                                >
                                    <td className="p-3 text-slate-600 whitespace-nowrap">
                                        {formatDate(inst.due_date)}
                                    </td>
                                    <td className="p-3 text-slate-700">
                                        {inst.client_name || (
                                            <span className="text-stone-400">—</span>
                                        )}
                                    </td>
                                    <td className="p-3 font-medium text-slate-900">
                                        {inst.property_code || (
                                            <span className="text-stone-400">—</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right text-slate-900 font-medium">
                                        {currency(inst.amount || 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div
                        className="p-6 text-sm text-slate-500 text-center"
                        data-testid="calendar-upcoming-empty"
                    >
                        {hasAnyData
                            ? "Няма предстоящи вноски."
                            : "Няма предстоящи вноски — създай сделка със schedule, за да започне да се пълни календарът."}
                    </div>
                )}
            </div>
        </div>
    );
}
