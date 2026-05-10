import React from "react";
import { Wallet, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { currency } from "../../lib/api";

/**
 * R.5 Част 2: Кеш карти горе на дашборда.
 *
 * Показва 3 големи карти:
 * 1. ВЛЯЗЛО В КАСАТА (зелена) — реални пари вече постъпили
 * 2. ОЧАКВАНО (синя) — бъдещи вноски по график
 * 3. ЗАКЪСНЕЛИ (червена ако > 0, зелена със ✓ ако 0)
 *
 * Props:
 *   cash: { paid, expected, overdue, overdue_clients_count } | null
 *   soldCount: брой продадени имоти (от sales summary)
 *   soldValueWithVat: общата стойност на продаденото с ДДС
 *   loading: bool
 */
export default function CashCards({ cash, soldCount, soldValueWithVat, loading = false }) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-stone-200 bg-white p-6 h-40 animate-pulse"
                        data-testid="cash-card-skeleton"
                    >
                        <div className="h-3 bg-stone-200 rounded w-24 mb-4" />
                        <div className="h-8 bg-stone-200 rounded w-40 mb-3" />
                        <div className="h-3 bg-stone-200 rounded w-32" />
                    </div>
                ))}
            </div>
        );
    }

    // Ако няма cash (няма права финансови) — нищо не показваме
    if (!cash) return null;

    // % от продаденото което вече е инкасирано
    const collectedPercent =
        soldValueWithVat > 0
            ? Math.min(100, Math.round((cash.paid / soldValueWithVat) * 100))
            : 0;

    const hasOverdue = cash.overdue > 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* КАРТА 1: ВЛЯЗЛО В КАСАТА (зелена акцент) */}
            <div
                className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm"
                data-testid="cash-card-paid"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-emerald-700">
                        Влязло в касата
                    </div>
                    <Wallet className="h-5 w-5 text-emerald-600" strokeWidth={1.5} />
                </div>
                <div className="text-3xl font-medium text-slate-900 mb-2">
                    {currency(cash.paid)}
                </div>
                <div className="text-xs text-slate-600 mb-2">
                    от {soldCount ?? 0} {soldCount === 1 ? "продажба" : "продажби"}
                </div>
                {/* Прогрес бар: % инкасирано от продаденото */}
                <div className="mt-3">
                    <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${collectedPercent}%` }}
                            data-testid="cash-card-paid-progress"
                        />
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5">
                        {collectedPercent}% инкасирано от продаденото
                    </div>
                </div>
            </div>

            {/* КАРТА 2: ОЧАКВАНО (неутрална/синя) */}
            <div
                className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm"
                data-testid="cash-card-expected"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wider font-medium text-slate-700">
                        Очаквано
                    </div>
                    <TrendingUp className="h-5 w-5 text-slate-600" strokeWidth={1.5} />
                </div>
                <div className="text-3xl font-medium text-slate-900 mb-2">
                    {currency(cash.expected)}
                </div>
                <div className="text-xs text-slate-600">
                    по график предстоящи
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-xs text-slate-500">
                        Бъдещи вноски от подписани сделки
                    </div>
                </div>
            </div>

            {/* КАРТА 3: ЗАКЪСНЕЛИ (червена ако > 0, зелена ако = 0) */}
            {hasOverdue ? (
                <div
                    className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-sm"
                    data-testid="cash-card-overdue"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs uppercase tracking-wider font-medium text-red-700">
                            Закъснели
                        </div>
                        <AlertTriangle
                            className="h-5 w-5 text-red-600"
                            strokeWidth={1.5}
                        />
                    </div>
                    <div className="text-3xl font-medium text-red-700 mb-2">
                        {currency(cash.overdue)}
                    </div>
                    <div className="text-xs text-red-600 font-medium">
                        ⚠ {cash.overdue_clients_count}{" "}
                        {cash.overdue_clients_count === 1 ? "клиент" : "клиента"} закъснели
                    </div>
                    <div className="mt-3 pt-3 border-t border-red-100">
                        <div className="text-xs text-slate-500">
                            Просрочени вноски с минала дата
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm"
                    data-testid="cash-card-overdue-none"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs uppercase tracking-wider font-medium text-emerald-700">
                            Закъснели
                        </div>
                        <CheckCircle2
                            className="h-5 w-5 text-emerald-600"
                            strokeWidth={1.5}
                        />
                    </div>
                    <div className="text-3xl font-medium text-emerald-700 mb-2">
                        {currency(0)}
                    </div>
                    <div className="text-xs text-emerald-600 font-medium">
                        ✓ Всичко наред
                    </div>
                    <div className="mt-3 pt-3 border-t border-emerald-100">
                        <div className="text-xs text-slate-500">
                            Няма просрочени вноски
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
