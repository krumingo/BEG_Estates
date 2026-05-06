import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet } from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

const STATUS_LABELS = {
    active: "Активна",
    completed: "Завършена",
    cancelled: "Отказана",
};
const STATUS_BADGE = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("bg-BG");
    } catch {
        return iso;
    }
}

export default function AdminDeals() {
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/deals", { params: { status: "all" } })
            .then((r) => setDeals(Array.isArray(r.data) ? r.data : []))
            .catch((e) => {
                toast.error(formatApiError(e.response?.data?.detail) || "Грешка при зареждане");
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-8" data-testid="admin-deals-page">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="overline mb-2 flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5" /> Финансов модул
                    </div>
                    <h1 className="font-serif text-4xl text-slate-900">Сделки / Плащания</h1>
                    <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                        Сделки са per-клиент финансови записи с N имота. Тук виждате цялата
                        картина: договорена цена, фактура vs проформа, schedule по банка/без банка,
                        статуси на плащания. Достъпно само за super_admin.
                    </p>
                </div>
                <Button
                    asChild
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    data-testid="admin-new-deal-btn"
                >
                    <Link to="/admin/deals/new">
                        <Plus className="h-4 w-4 mr-2" /> Нова сделка
                    </Link>
                </Button>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-x-auto">
                <table className="w-full text-sm" data-testid="admin-deals-table">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">№ Сделка</th>
                            <th className="text-left p-3 font-medium">Клиент</th>
                            <th className="text-left p-3 font-medium">Имоти</th>
                            <th className="text-right p-3 font-medium">Договорена сума (с ДДС)</th>
                            <th className="text-left p-3 font-medium">Тип плащане</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Създадена</th>
                            <th className="text-right p-3 font-medium">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={8} className="p-5 text-sm text-slate-500">Зареждане…</td></tr>
                        )}
                        {!loading && deals.length === 0 && (
                            <tr>
                                <td colSpan={8} className="p-8 text-sm text-slate-500 text-center">
                                    Няма създадени сделки. Можете да създадете нова от тук, или да преобразувате
                                    приета оферта чрез „Преобразувай в сделка".
                                </td>
                            </tr>
                        )}
                        {!loading && deals.map((d) => (
                            <tr key={d.id} className="border-t hairline" data-testid={`admin-deal-row-${d.deal_number}`}>
                                <td className="p-3 font-mono font-medium">{d.deal_number}</td>
                                <td className="p-3">{d.client_name || "—"}</td>
                                <td className="p-3">
                                    <div className="text-slate-700">
                                        {(d.items || []).length} имот{(d.items || []).length === 1 ? "" : "а"}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate max-w-xs">
                                        {(d.items || []).map((i) => i.property_code).join(", ")}
                                    </div>
                                </td>
                                <td className="p-3 text-right font-medium">{currency(d.total_with_vat)}</td>
                                <td className="p-3 text-xs text-slate-600">
                                    {{
                                        with_bank: "С банка",
                                        without_bank: "Без банка",
                                        combined: "Комбинирано",
                                    }[d.payment_mode?.mode] || "—"}
                                </td>
                                <td className="p-3">
                                    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${STATUS_BADGE[d.status] || ""}`}>
                                        {STATUS_LABELS[d.status] || d.status}
                                    </span>
                                </td>
                                <td className="p-3 text-slate-600 text-xs">{formatDate(d.created_at)}</td>
                                <td className="p-3 text-right">
                                    <Button asChild size="sm" variant="outline" data-testid={`admin-deal-open-${d.deal_number}`}>
                                        <Link to={`/admin/deals/${d.id}`}>Отвори</Link>
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="rounded-lg border hairline bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
                <strong>Foundation готов (G.1).</strong> Списъкът и backend endpoints са активни.
                Пълният интерактивен редактор с разпределение на плащанията, schedule builder, и
                tracking на вноските ще бъде имплементиран в G.2.
            </div>
        </div>
    );
}
