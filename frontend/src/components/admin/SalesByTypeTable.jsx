import React from "react";
import { currency } from "../../lib/api";

/**
 * R.5 Част 3: Таблица "Продажби по тип имот".
 *
 * Показва за всеки тип имот: общо / продадени / свободни / резервирани / потенциал €.
 * Footer ред със сумите.
 *
 * Props:
 *   byType: array от { type, total, sold, available, reserved, compensation,
 *                       sold_value_with_vat, available_value_with_vat }
 *   isFinanceVisible: bool — ако false, скриваме колона "Потенциал €"
 *   loading: bool
 */

// Map: backend type → BG label (множествено число)
const TYPE_LABELS_PLURAL = {
    apartment: "Апартаменти",
    parking: "Паркоместа",
    yard_parking: "Дворни паркоместа",
    garage: "Гаражи",
    storage: "Складове",
    shop: "Магазини",
    house: "Къщи",
    compensation: "Обезщетителни",
    unknown: "Други",
};

function typeLabel(t) {
    return TYPE_LABELS_PLURAL[t] || t || "Други";
}

export default function SalesByTypeTable({ byType, isFinanceVisible, loading = false }) {
    if (loading) {
        return (
            <div
                className="rounded-xl border border-stone-200 bg-white overflow-hidden"
                data-testid="sales-by-type-skeleton"
            >
                <div className="p-6">
                    <div className="space-y-3">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-6 bg-stone-100 rounded animate-pulse"
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!byType || byType.length === 0) {
        return (
            <div
                className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-slate-500"
                data-testid="sales-by-type-empty"
            >
                Няма данни за имотите.
            </div>
        );
    }

    // Изчисляваме totals
    const totals = byType.reduce(
        (acc, r) => {
            acc.total += r.total || 0;
            acc.sold += r.sold || 0;
            acc.available += r.available || 0;
            acc.reserved += r.reserved || 0;
            acc.available_value_with_vat += r.available_value_with_vat || 0;
            return acc;
        },
        { total: 0, sold: 0, available: 0, reserved: 0, available_value_with_vat: 0 }
    );

    return (
        <div
            className="rounded-xl border border-stone-200 bg-white overflow-hidden"
            data-testid="sales-by-type-table"
        >
            <table className="w-full text-sm">
                <thead className="bg-stone-50 text-slate-600">
                    <tr>
                        <th className="text-left p-3 font-medium">Тип</th>
                        <th className="text-right p-3 font-medium">Общо</th>
                        <th className="text-right p-3 font-medium">Продадени</th>
                        <th className="text-right p-3 font-medium">Свободни</th>
                        <th className="text-right p-3 font-medium">Резервирани</th>
                        {isFinanceVisible && (
                            <th className="text-right p-3 font-medium">
                                Потенциал €
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {byType.map((row) => {
                        const potential = row.available_value_with_vat || 0;
                        const allSold = (row.available || 0) === 0 && (row.sold || 0) > 0;
                        return (
                            <tr
                                key={row.type}
                                className="border-t border-stone-100 hover:bg-stone-50"
                                data-testid={`sales-by-type-row-${row.type}`}
                            >
                                <td className="p-3 font-medium text-slate-900">
                                    {typeLabel(row.type)}
                                </td>
                                <td className="p-3 text-right text-slate-700">
                                    {row.total || 0}
                                </td>
                                <td className="p-3 text-right text-slate-700">
                                    {row.sold || 0}
                                </td>
                                <td className="p-3 text-right text-slate-700">
                                    {row.available || 0}
                                </td>
                                <td className="p-3 text-right text-slate-700">
                                    {row.reserved || 0}
                                </td>
                                {isFinanceVisible && (
                                    <td className="p-3 text-right text-slate-900 font-medium">
                                        {potential > 0 ? (
                                            currency(potential)
                                        ) : allSold ? (
                                            <span className="text-xs text-emerald-600 font-normal">
                                                всички продадени
                                            </span>
                                        ) : (
                                            <span className="text-stone-400">—</span>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr
                        className="border-t-2 border-stone-200 bg-stone-50 font-medium text-slate-900"
                        data-testid="sales-by-type-total"
                    >
                        <td className="p-3">ОБЩО</td>
                        <td className="p-3 text-right">{totals.total}</td>
                        <td className="p-3 text-right">{totals.sold}</td>
                        <td className="p-3 text-right">{totals.available}</td>
                        <td className="p-3 text-right">{totals.reserved}</td>
                        {isFinanceVisible && (
                            <td className="p-3 text-right">
                                {totals.available_value_with_vat > 0
                                    ? currency(totals.available_value_with_vat)
                                    : "—"}
                            </td>
                        )}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
