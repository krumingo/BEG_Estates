import React from "react";
import { Home, TrendingDown, Building2 } from "lucide-react";
import { currency } from "../../lib/api";

/**
 * R.5 Част 3: Sales карти под Кеш секцията.
 *
 * Показва 3 карти:
 * 1. ПРОДАДЕНО — брой + € с ДДС + прогрес бар
 * 2. ОСТАВА — свободни имоти + потенциална € с ДДС
 * 3. ОБЩО — целия проект (брой + €) + бележка за обезщетителни
 *
 * Props:
 *   sales: { sold_count, available_count, compensation_count, total_count,
 *            sold_value_with_vat, available_value_with_vat, total_value_with_vat,
 *            sold_percent } | null
 *   isFinanceVisible: bool — ако false, скриваме € сумите
 *   loading: bool
 */
export default function SalesCards({ sales, isFinanceVisible, loading = false }) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-stone-200 bg-white p-6 h-40 animate-pulse"
                        data-testid="sales-card-skeleton"
                    >
                        <div className="h-3 bg-stone-200 rounded w-24 mb-4" />
                        <div className="h-8 bg-stone-200 rounded w-32 mb-3" />
                        <div className="h-3 bg-stone-200 rounded w-40" />
                    </div>
                ))}
            </div>
        );
    }

    if (!sales) return null;

    const soldCount = sales.sold_count ?? 0;
    const availableCount = sales.available_count ?? 0;
    const totalCount = sales.total_count ?? 0;
    const compensationCount = sales.compensation_count ?? 0;
    const soldPercent = sales.sold_percent ?? 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* КАРТА 1: ПРОДАДЕНО */}
            <div
                className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm"
                data-testid="sales-card-sold"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-slate-700">
                        Продадено
                    </div>
                    <Home className="h-5 w-5 text-slate-600" strokeWidth={1.5} />
                </div>
                <div className="text-3xl font-medium text-slate-900 mb-1">
                    {soldCount} {soldCount === 1 ? "имот" : "имота"}
                </div>
                {isFinanceVisible && (
                    <div className="text-sm text-slate-600 mb-2">
                        {currency(sales.sold_value_with_vat)}{" "}
                        <span className="text-xs text-slate-500">с ДДС</span>
                    </div>
                )}
                <div className="mt-3">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-slate-700 rounded-full transition-all"
                            style={{ width: `${Math.min(100, soldPercent)}%` }}
                            data-testid="sales-card-sold-progress"
                        />
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5">
                        {soldPercent}% от целия проект
                    </div>
                </div>
            </div>

            {/* КАРТА 2: ОСТАВА */}
            <div
                className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm"
                data-testid="sales-card-available"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-amber-700">
                        Остава
                    </div>
                    <TrendingDown
                        className="h-5 w-5 text-amber-600"
                        strokeWidth={1.5}
                    />
                </div>
                <div className="text-3xl font-medium text-slate-900 mb-1">
                    {availableCount} {availableCount === 1 ? "имот" : "имота"}
                </div>
                {isFinanceVisible && (
                    <div className="text-sm text-slate-600 mb-2">
                        {currency(sales.available_value_with_vat)}{" "}
                        <span className="text-xs text-slate-500">потенциал с ДДС</span>
                    </div>
                )}
                <div className="mt-3 pt-3 border-t border-amber-100">
                    <div className="text-xs text-slate-500">
                        Свободни имоти за продажба
                    </div>
                </div>
            </div>

            {/* КАРТА 3: ОБЩО */}
            <div
                className="rounded-xl border border-stone-200 bg-gradient-to-br from-stone-50 to-white p-6 shadow-sm"
                data-testid="sales-card-total"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-stone-700">
                        Общо
                    </div>
                    <Building2
                        className="h-5 w-5 text-stone-600"
                        strokeWidth={1.5}
                    />
                </div>
                <div className="text-3xl font-medium text-slate-900 mb-1">
                    {totalCount} {totalCount === 1 ? "имот" : "имота"}
                </div>
                {isFinanceVisible && (
                    <div className="text-sm text-slate-600 mb-2">
                        {currency(sales.total_value_with_vat)}{" "}
                        <span className="text-xs text-slate-500">целия проект</span>
                    </div>
                )}
                {compensationCount > 0 && (
                    <div className="mt-3 pt-3 border-t border-stone-200">
                        <div className="text-xs text-slate-500">
                            + {compensationCount}{" "}
                            {compensationCount === 1 ? "обезщетителен" : "обезщетителни"}{" "}
                            (не се продават)
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
