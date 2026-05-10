import React from "react";
import { currency } from "../../lib/api";

// NOTE: Names show as plain text. Когато бъде добавен /admin/clients/:id detail
// route в App.js, можем лесно да ги направим Link-ове към профила на клиента.

/**
 * R.5 Част 4: Топ 5 клиенти по обща стойност на имотите.
 *
 * Props:
 *   clients: array от { client_id, name, email, count, properties[], value_net, value_with_vat }
 *   loading: bool
 */
export default function TopClientsTable({ clients, loading = false }) {
    if (loading) {
        return (
            <div
                className="rounded-xl border border-stone-200 bg-white overflow-hidden"
                data-testid="top-clients-skeleton"
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

    if (!clients || clients.length === 0) {
        return (
            <div
                className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-slate-500"
                data-testid="top-clients-empty"
            >
                Няма продажби с регистрирани клиенти.
            </div>
        );
    }

    return (
        <div
            className="rounded-xl border border-stone-200 bg-white overflow-hidden"
            data-testid="top-clients-table"
        >
            <table className="w-full text-sm">
                <thead className="bg-stone-50 text-slate-600">
                    <tr>
                        <th className="text-left p-3 font-medium w-10">#</th>
                        <th className="text-left p-3 font-medium">Име</th>
                        <th className="text-right p-3 font-medium">Имоти</th>
                        <th className="text-left p-3 font-medium">Кодове</th>
                        <th className="text-right p-3 font-medium">
                            Стойност с ДДС
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map((c, idx) => (
                        <tr
                            key={c.client_id}
                            className="border-t border-stone-100 hover:bg-stone-50"
                            data-testid={`top-clients-row-${c.client_id}`}
                        >
                            <td className="p-3 text-slate-500 font-medium">
                                {idx + 1}
                            </td>
                            <td className="p-3">
                                <div className="font-medium text-slate-900">
                                    {c.name || "(без име)"}
                                </div>
                                {c.email && (
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {c.email}
                                    </div>
                                )}
                            </td>
                            <td className="p-3 text-right text-slate-700">
                                {c.count || 0}
                            </td>
                            <td className="p-3 text-slate-600 text-xs">
                                {(c.properties || []).slice(0, 5).join(", ") || "—"}
                            </td>
                            <td className="p-3 text-right text-slate-900 font-medium">
                                {currency(c.value_with_vat || 0)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
