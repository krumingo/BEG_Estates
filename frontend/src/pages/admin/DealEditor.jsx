import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

const STATUS_LABELS = {
    active: "Активна",
    completed: "Завършена",
    cancelled: "Отказана",
};

export default function DealEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [deal, setDeal] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) {
            // /deals/new placeholder
            setLoading(false);
            return;
        }
        api.get(`/deals/${id}`)
            .then((r) => setDeal(r.data))
            .catch((e) => {
                toast.error(formatApiError(e.response?.data?.detail) || "Сделката не е намерена");
                navigate("/admin/deals");
            })
            .finally(() => setLoading(false));
    }, [id, navigate]);

    if (loading) {
        return <div className="text-sm text-slate-500" data-testid="deal-editor-loading">Зареждане…</div>;
    }

    if (!id) {
        return (
            <div className="space-y-6 max-w-3xl mx-auto" data-testid="deal-editor-new-placeholder">
                <Link to="/admin/deals" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> Назад към списъка
                </Link>
                <div>
                    <div className="overline mb-2">Нова сделка</div>
                    <h1 className="font-serif text-4xl text-slate-900">Създаване на сделка</h1>
                </div>
                <div className="rounded-lg border hairline bg-white p-6 space-y-3">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                            <div className="font-medium text-slate-900">Пълен редактор предстои в G.2</div>
                            <p className="text-sm text-slate-600 mt-1">
                                В момента сделки могат да бъдат създавани автоматично чрез „Преобразувай в сделка"
                                от приета оферта (Quote Editor). Ръчното създаване с избор на клиент,
                                имоти, и payment mode ще се добави в следващия пакет (G.2).
                            </p>
                            <p className="text-sm text-slate-600 mt-3">
                                Backend API <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">POST /api/deals</code> е готов и работи.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!deal) return null;

    const items = deal.items || [];
    const pm = deal.payment_mode || {};

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-24" data-testid="deal-editor-view">
            <Link to="/admin/deals" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" /> Назад към списъка
            </Link>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="overline mb-2">Сделка</div>
                    <h1 className="font-serif text-4xl text-slate-900">{deal.deal_number}</h1>
                    <div className="flex items-center gap-3 mt-2 text-sm text-slate-600">
                        <span>Клиент: <span className="font-medium text-slate-900">{deal.client_name}</span></span>
                        <span>•</span>
                        <span>Статус: {STATUS_LABELS[deal.status] || deal.status}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border hairline bg-white p-5 space-y-4" data-testid="deal-summary-card">
                <div className="text-sm font-semibold text-slate-900">Финансово обобщение</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryCard label="Общо с ДДС" value={currency(deal.total_with_vat)} accent />
                    <SummaryCard label="Без ДДС" value={currency(deal.total_without_vat)} />
                    <SummaryCard label="ДДС" value={currency(deal.vat_amount)} />
                    <SummaryCard
                        label="Тип плащане"
                        value={{
                            with_bank: "С банка",
                            without_bank: "Без банка",
                            combined: "Комбинирано",
                        }[pm.mode] || "—"}
                    />
                </div>
            </div>

            <div className="rounded-lg border hairline bg-white p-5 space-y-3" data-testid="deal-items-card">
                <div className="text-sm font-semibold text-slate-900">
                    Имоти в сделката ({items.length})
                </div>
                <table className="w-full text-sm">
                    <thead className="text-slate-500 border-b hairline">
                        <tr>
                            <th className="text-left py-2 font-medium">Код</th>
                            <th className="text-left py-2 font-medium">Описание</th>
                            <th className="text-right py-2 font-medium">Листова</th>
                            <th className="text-right py-2 font-medium">Договорена</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it) => (
                            <tr key={it.property_id} className="border-b hairline">
                                <td className="py-2 font-mono">{it.property_code}</td>
                                <td className="py-2 text-slate-700">{it.property_label}</td>
                                <td className="py-2 text-right text-slate-600">{currency(it.list_price)}</td>
                                <td className="py-2 text-right font-medium">{currency(it.agreed_price)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="rounded-lg border hairline bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
                <strong>Read-only режим (G.1).</strong> Редактирането на разпределение на плащане, schedule
                builder, и tracking на вноските ще бъде налично в G.2. Backend endpoints са активни и могат
                да бъдат тествани директно (PUT /api/deals/{`{id}`}, POST /regenerate-schedule, PATCH /stages/{`{order}`}/payment).
            </div>
        </div>
    );
}

function SummaryCard({ label, value, accent }) {
    return (
        <div className={`rounded-lg border hairline p-3 ${accent ? "bg-slate-900 text-white border-slate-900" : "bg-stone-50"}`}>
            <div className={`text-xs ${accent ? "text-slate-300" : "text-slate-500"} uppercase tracking-wide`}>
                {label}
            </div>
            <div className={`mt-1 font-medium ${accent ? "" : "text-slate-900"}`}>{value}</div>
        </div>
    );
}
