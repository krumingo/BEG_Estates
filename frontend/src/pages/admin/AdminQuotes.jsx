import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Download, Trash2, Eye } from "lucide-react";
import { api, formatDate, formatApiError, currency } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../../components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";

export const QUOTE_STATUS_LABELS = {
    draft: "Чернова",
    sent: "Изпратена",
    accepted: "Приета",
    rejected: "Отказана",
    expired: "Изтекла",
};
export const QUOTE_STATUS_BADGE = {
    draft: "bg-slate-100 text-slate-700 border-slate-300",
    sent: "bg-sky-50 text-sky-800 border-sky-200",
    accepted: "bg-emerald-50 text-emerald-800 border-emerald-200",
    rejected: "bg-rose-50 text-rose-800 border-rose-200",
    expired: "bg-amber-50 text-amber-800 border-amber-200",
};

export default function AdminQuotes() {
    const [quotes, setQuotes] = useState([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [clientFilter, setClientFilter] = useState("all");
    const [clients, setClients] = useState([]);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = () => {
        const params = {};
        if (statusFilter !== "all") params.status = statusFilter;
        if (clientFilter !== "all") params.client_id = clientFilter;
        if (search.trim()) params.search = search.trim();
        api.get("/quotes", { params }).then((r) => setQuotes(r.data)).catch(() => {});
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, clientFilter]);
    useEffect(() => {
        const h = setTimeout(load, 300);
        return () => clearTimeout(h);
        /* eslint-disable-next-line */
    }, [search]);
    useEffect(() => {
        api.get("/clients", { params: { active: "all" } }).then((r) => setClients(r.data)).catch(() => {});
    }, []);

    const counters = useMemo(() => {
        const c = { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 };
        quotes.forEach((q) => { c[q.status] = (c[q.status] || 0) + 1; });
        return c;
    }, [quotes]);

    const downloadPdf = async (q) => {
        try {
            const r = await api.get(`/quotes/${q.id}/pdf`, { responseType: "blob" });
            const blob = new Blob([r.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `oferta-${q.quote_number}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("PDF свален");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const doDelete = async (q) => {
        try {
            await api.delete(`/quotes/${q.id}`);
            toast.success("Офертата е изтрита");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="overline mb-2">Оферти</div>
                    <h1 className="font-serif text-4xl text-slate-900">Quote Builder</h1>
                    <p className="text-sm text-slate-500 mt-2">
                        <span className="font-medium text-slate-900">{quotes.length}</span> оферти ·{" "}
                        <span className="text-slate-700">{counters.draft || 0} чернови</span> ·{" "}
                        <span className="text-sky-700">{counters.sent || 0} изпратени</span> ·{" "}
                        <span className="text-emerald-700">{counters.accepted || 0} приети</span>
                    </p>
                </div>
                <Link to="/admin/quotes/new">
                    <Button
                        className="bg-slate-900 text-white hover:bg-slate-800"
                        data-testid="admin-quotes-add"
                    >
                        <Plus className="h-4 w-4 mr-1.5" /> Нова оферта
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border hairline bg-white">
                <div className="relative flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                    <Input
                        className="pl-9"
                        placeholder="Търсене по номер или клиент…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        data-testid="admin-quotes-search"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-44" data-testid="admin-quotes-status-filter">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички статуси</SelectItem>
                        {Object.entries(QUOTE_STATUS_LABELS).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="w-56" data-testid="admin-quotes-client-filter">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички клиенти</SelectItem>
                        {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Номер</th>
                            <th className="text-left p-3 font-medium">Клиент</th>
                            <th className="text-left p-3 font-medium">Имоти</th>
                            <th className="text-right p-3 font-medium">Сума</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Дата</th>
                            <th className="text-left p-3 font-medium">Валидна до</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.map((q) => (
                            <tr key={q.id} className="border-t hairline" data-testid={`quote-row-${q.id}`}>
                                <td className="p-3 font-mono text-xs">
                                    <Link to={`/admin/quotes/${q.id}`} className="text-slate-900 font-medium hover:underline">
                                        {q.quote_number}
                                    </Link>
                                </td>
                                <td className="p-3">{q.client_name || <span className="text-slate-400">—</span>}</td>
                                <td className="p-3 text-slate-600">
                                    {(q.items || []).map((i) => i.property_code).join(", ")}
                                </td>
                                <td className="p-3 text-right font-medium">{currency(q.total)}</td>
                                <td className="p-3">
                                    <span
                                        className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${QUOTE_STATUS_BADGE[q.status]}`}
                                        data-testid={`quote-status-${q.id}`}
                                    >
                                        {QUOTE_STATUS_LABELS[q.status]}
                                    </span>
                                </td>
                                <td className="p-3 text-slate-600">{formatDate(q.created_at)}</td>
                                <td className="p-3 text-slate-600">{q.valid_until || "—"}</td>
                                <td className="p-3">
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <Link to={`/admin/quotes/${q.id}`}>
                                            <Button size="sm" variant="outline" title="Виж" data-testid={`quote-view-${q.id}`}>
                                                <Eye className="h-3.5 w-3.5" />
                                            </Button>
                                        </Link>
                                        <Button size="sm" variant="outline" onClick={() => downloadPdf(q)} title="PDF" data-testid={`quote-pdf-${q.id}`}>
                                            <Download className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={q.status !== "draft"}
                                            onClick={() => setConfirmDelete(q)}
                                            title={q.status === "draft" ? "Изтрий" : "Само чернови могат да бъдат изтрити"}
                                            data-testid={`quote-delete-${q.id}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {quotes.length === 0 && (
                            <tr>
                                <td className="p-8 text-center text-sm text-slate-500" colSpan={8}>
                                    Все още няма оферти. Натиснете „+ Нова оферта" за да създадете първата.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
                <DialogContent data-testid="quote-confirm-delete">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Изтриване на оферта</DialogTitle>
                        <DialogDescription>
                            Сигурни ли сте, че искате да изтриете оферта {confirmDelete?.quote_number}? Това действие е необратимо.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(null)}>Отказ</Button>
                        <Button
                            className="bg-rose-600 text-white hover:bg-rose-700"
                            onClick={async () => {
                                if (confirmDelete) await doDelete(confirmDelete);
                                setConfirmDelete(null);
                            }}
                            data-testid="quote-confirm-delete-ok"
                        >
                            Изтрий
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
