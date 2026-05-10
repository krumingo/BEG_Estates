import React from "react";
import { currency, formatDate } from "../../lib/api";

/**
 * R.5 Част 3: Таблица "Последни продажби".
 *
 * Показва последните 10 продажби: дата, имот код, тип, купувач, цена.
 *
 * Props:
 *   sales: array от { property_id, code, property_type, list_price_net,
 *                      list_price_with_vat, buyer_id, buyer_name, sold_at }
 *   isFinanceVisible: bool — ако false, скриваме колона "Цена"
 *   loading: bool
 */

const TYPE_LABELS_SINGULAR = {
    apartment: "Апартамент",
    parking: "Паркомясто",
    yard_parking: "Дворно паркомясто",
    garage: "Гараж",
    storage: "Склад",
    shop: "Магазин",
    house: "Къща",
    compensation: "Обезщетителен",
    unknown: "Друг",
};

function typeLabel(t) {
    return TYPE_LABELS_SINGULAR[t] || t || "—";
}

export default function RecentSalesTable({ sales, isFinanceVisible, loading = false }) {
    if (loading) {
        return (
            <div
                className="rounded-xl border border-stone-200 bg-white overflow-hidden"
                data-testid="recent-sales-skeleton"
            >
                <div className="p-6 space-y-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-6 bg-stone-100 rounded animate-pulse"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (!sales || sales.length === 0) {
        return (
            <div
                className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-slate-500"
                data-testid="recent-sales-empty"
            >
                Няма продажби за показване.
            </div>
        );
    }

    return (
        <div
            className="rounded-xl border border-stone-200 bg-white overflow-hidden"
            data-testid="recent-sales-table"
        >
            <table className="w-full text-sm">
                <thead className="bg-stone-50 text-slate-600">
                    <tr>
                        <th className="text-left p-3 font-medium">Дата</th>
                        <th className="text-left p-3 font-medium">Имот</th>
                        <th className="text-left p-3 font-medium">Тип</th>
                        <th className="text-left p-3 font-medium">Купувач</th>
                        {isFinanceVisible && (
                            <th className="text-right p-3 font-medium">Цена</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {sales.map((s) => (
                        <tr
                            key={s.property_id}
                            className="border-t border-stone-100 hover:bg-stone-50"
                            data-testid={`recent-sales-row-${s.property_id}`}
                        >
                            <td className="p-3 text-slate-600 whitespace-nowrap">
                                {formatDate(s.sold_at)}
                            </td>
                            <td className="p-3 font-medium text-slate-900">
                                {s.code || "—"}
                            </td>
                            <td className="p-3 text-slate-600">
                                {typeLabel(s.property_type)}
                            </td>
                            <td className="p-3 text-slate-700">
                                {s.buyer_name || (
                                    <span className="text-stone-400">—</span>
                                )}
                            </td>
                            {isFinanceVisible && (
                                <td className="p-3 text-right text-slate-900 font-medium">
                                    {s.list_price_with_vat != null ? (
                                        <>
                                            {currency(s.list_price_with_vat)}{" "}
                                            <span className="text-xs text-slate-500 font-normal">
                                                с ДДС
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-stone-400">—</span>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
