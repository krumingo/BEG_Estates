import React, { useEffect, useState } from "react";
import { api, currency, formatDate } from "../../lib/api";

export default function ClientPayments() {
    const [data, setData] = useState(null);
    useEffect(() => {
        api.get("/dashboard/client").then((r) => setData(r.data)).catch(() => {});
    }, []);
    if (!data) return <div className="text-slate-500">Зареждане…</div>;

    const total = (data.installments || []).reduce((s, i) => s + (i.amount || 0), 0);
    const paid = (data.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const remaining = total - paid;

    return (
        <div className="space-y-10">
            <div>
                <div className="overline mb-2">Плащания</div>
                <h1 className="font-serif text-4xl text-slate-900">Моят погасителен план</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPI label="Обща сума" value={currency(total)} />
                <KPI label="Платено" value={currency(paid)} highlight />
                <KPI label="Остава" value={currency(remaining)} />
            </div>

            <section>
                <h2 className="font-serif text-2xl text-slate-900 mb-4">Вноски</h2>
                <div className="rounded-xl border hairline overflow-hidden bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="text-left p-3 font-medium">#</th>
                                <th className="text-left p-3 font-medium">Падеж</th>
                                <th className="text-right p-3 font-medium">Сума</th>
                                <th className="text-left p-3 font-medium">Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data.installments || []).map((i) => (
                                <tr key={i.id} className="border-t hairline" data-testid={`installment-row-${i.number}`}>
                                    <td className="p-3 font-mono">{i.number}</td>
                                    <td className="p-3">{formatDate(i.due_date)}</td>
                                    <td className="p-3 text-right font-medium">{currency(i.amount, i.currency)}</td>
                                    <td className="p-3 text-slate-600">{i.status}</td>
                                </tr>
                            ))}
                            {(!data.installments || data.installments.length === 0) && (
                                <tr><td className="p-5 text-slate-500 text-sm" colSpan={4}>Няма активен погасителен план.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function KPI({ label, value, highlight }) {
    return (
        <div className={`rounded-xl border hairline p-5 ${highlight ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`}>
            <div className={`overline ${highlight ? "text-white/60" : ""}`}>{label}</div>
            <div className={`mt-2 text-2xl font-medium ${highlight ? "text-white" : "text-slate-900"}`}>{value}</div>
        </div>
    );
}
