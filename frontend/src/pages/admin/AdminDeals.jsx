import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Wallet, Search, Trash2, Eye } from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import {
    DEAL_STATUS_LABELS, DEAL_STATUS_BADGE, PAYMENT_MODE_LABELS,
    sumPaidAmount,
} from "../../lib/deal-helpers";

function formatDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("bg-BG");
    } catch {
        return iso;
    }
}

export default function AdminDeals() {
    const navigate = useNavigate();
    const [deals, setDeals] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("all");
    const [clientFilter, setClientFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleteReason, setDeleteReason] = useState("");

    const reload = () => {
        setLoading(true);
        api.get("/deals", { params: { status: "all" } })
            .then((r) => setDeals(Array.isArray(r.data) ? r.data : []))
            .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || "Грешка при зареждане"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        reload();
        api.get("/clients", { params: { active: "all" } })
            .then((r) => setClients(Array.isArray(r.data) ? r.data : []))
            .catch(() => {});
    }, []);

    const filtered = useMemo(() => {
        return deals.filter((d) => {
            if (statusFilter !== "all" && d.status !== statusFilter) return false;
            if (clientFilter !== "all" && d.client_id !== clientFilter) return false;
            if (search.trim()) {
                const q = search.trim().toLowerCase();
                const haystack = `${d.deal_number || ""} ${d.client_name || ""}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [deals, statusFilter, clientFilter, search]);

    const counts = useMemo(() => {
        const acc = { active: 0, completed: 0, cancelled: 0 };
        deals.forEach((d) => { if (acc[d.status] !== undefined) acc[d.status] += 1; });
        return acc;
    }, [deals]);

    const doDelete = async () => {
        if (!confirmDelete) return;
        if (!deleteReason.trim()) {
            toast.error("Моля въведете причина");
            return;
        }
        try {
            await api.delete(`/deals/${confirmDelete.id}`, { data: { reason: deleteReason } });
            toast.success(`Сделка ${confirmDelete.deal_number} изтрита`);
            setConfirmDelete(null);
            setDeleteReason("");
            reload();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при изтриване");
        }
    };

    return (
        <div className="space-y-8" data-testid="admin-deals-page">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="overline mb-2 flex items-center gap-2">
                        <Wallet className="h-3.5 w-3.5" /> Финансов модул
                    </div>
                    <h1 className="font-serif text-4xl text-slate-900">Сделки / Плащания</h1>
                    <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                        Per-клиент финансови записи с N имота. Договорена цена, фактура vs проформа,
                        schedule по банка/без банка, tracking на плащанията. Видимо само за super_admin.
                    </p>
                </div>
                <Button
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    data-testid="admin-new-deal-btn"
                    onClick={() => navigate("/admin/deals/new")}
                >
                    <Plus className="h-4 w-4 mr-2" /> Нова сделка
                </Button>
            </div>

            <div className="flex items-center gap-6 text-sm">
                <span className="text-slate-500">Общо: <strong className="text-slate-900">{deals.length}</strong></span>
                <span className="text-emerald-700" data-testid="deals-count-active">Активни: <strong>{counts.active}</strong></span>
                <span className="text-slate-700" data-testid="deals-count-completed">Завършени: <strong>{counts.completed}</strong></span>
                <span className="text-rose-700" data-testid="deals-count-cancelled">Отказани: <strong>{counts.cancelled}</strong></span>
                <span className="ml-auto text-slate-500">Показани: {filtered.length}</span>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[260px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Търси по номер или клиент…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                        data-testid="deals-search"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-44" data-testid="deals-filter-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички статуси</SelectItem>
                        <SelectItem value="active">Активни</SelectItem>
                        <SelectItem value="completed">Завършени</SelectItem>
                        <SelectItem value="cancelled">Отказани</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="w-64" data-testid="deals-filter-client"><SelectValue placeholder="Клиент" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички клиенти</SelectItem>
                        {clients.filter((c) => c && c.id).map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name || c.email}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-x-auto">
                <table className="w-full text-sm" data-testid="admin-deals-table">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Номер</th>
                            <th className="text-left p-3 font-medium">Клиент</th>
                            <th className="text-left p-3 font-medium">Имоти</th>
                            <th className="text-left p-3 font-medium">Тип плащане</th>
                            <th className="text-right p-3 font-medium">Обща сума</th>
                            <th className="text-right p-3 font-medium">Получени</th>
                            <th className="text-left p-3 font-medium">Прогрес</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={9} className="p-6 text-sm text-slate-500" data-testid="deals-loading">Зареждане…</td></tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={9} className="p-10 text-sm text-slate-500 text-center" data-testid="deals-empty">
                                    Няма сделки с избраните филтри. Създайте нова от бутона горе или преобразувайте приета оферта.
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.map((d) => {
                            const items = d.items || [];
                            const stagesAll = [...(d.bank_stages || []), ...(d.non_bank_stages || [])];
                            const paid = sumPaidAmount(stagesAll);
                            const total = Number(d.total_with_vat) || 0;
                            const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
                            const codes = items.map((i) => i.property_code).filter(Boolean);
                            const codeSummary = codes.length <= 3
                                ? codes.join(", ")
                                : `${codes.slice(0, 2).join(", ")}, +${codes.length - 2}`;
                            return (
                                <tr key={d.id} className="border-t hairline" data-testid={`admin-deal-row-${d.deal_number}`}>
                                    <td className="p-3 font-mono font-medium whitespace-nowrap">{d.deal_number}</td>
                                    <td className="p-3 text-slate-700 whitespace-nowrap">{d.client_name || "—"}</td>
                                    <td className="p-3 text-slate-700">
                                        <div>{items.length} имот{items.length === 1 ? "" : "а"}</div>
                                        <div className="text-xs text-slate-500">({codeSummary || "—"})</div>
                                    </td>
                                    <td className="p-3 text-xs text-slate-600 whitespace-nowrap">
                                        {PAYMENT_MODE_LABELS[d.payment_mode?.mode] || "—"}
                                    </td>
                                    <td className="p-3 text-right font-medium whitespace-nowrap">{currency(total)}</td>
                                    <td className="p-3 text-right text-slate-700 whitespace-nowrap">{currency(paid)}</td>
                                    <td className="p-3 min-w-[140px]">
                                        <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 transition-all"
                                                style={{ width: `${pct}%` }}
                                                data-testid={`deal-progress-${d.deal_number}`}
                                            />
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">{pct.toFixed(0)}%</div>
                                    </td>
                                    <td className="p-3">
                                        <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${DEAL_STATUS_BADGE[d.status] || ""}`}>
                                            {DEAL_STATUS_LABELS[d.status] || d.status}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button asChild size="sm" variant="outline" data-testid={`admin-deal-open-${d.deal_number}`}>
                                                <Link to={`/admin/deals/${d.id}`}><Eye className="h-3.5 w-3.5 mr-1.5" /> Виж</Link>
                                            </Button>
                                            {d.status === "cancelled" && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                                                    onClick={() => { setConfirmDelete(d); setDeleteReason(""); }}
                                                    data-testid={`admin-deal-delete-${d.deal_number}`}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Изтриване на сделка</DialogTitle>
                        <DialogDescription>
                            Сигурни ли сте, че искате да изтриете <strong>{confirmDelete?.deal_number}</strong>?
                            Това действие е необратимо.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Label>Причина <span className="text-red-600">*</span></Label>
                        <Textarea
                            rows={2}
                            value={deleteReason}
                            onChange={(e) => setDeleteReason(e.target.value)}
                            data-testid="deal-delete-reason"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(null)}>Отказ</Button>
                        <Button
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                            onClick={doDelete}
                            data-testid="deal-delete-confirm"
                        >
                            Изтрий
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
