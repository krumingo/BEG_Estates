import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../../components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { History, RotateCcw, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const DOMAIN_LABELS = {
    properties: "Имоти",
    buyers: "Купувачи",
    floor_plans: "Етажни схеми",
    payment_plans: "Схеми на плащане",
    payment_installments: "Вноски",
    payments: "Плащания",
    reservations: "Резервации",
    imports: "AI Import",
    messages: "Съобщения",
    client_profiles: "Клиентски профили",
};
const ACTION_LABELS = {
    property_create: "Създаване имот",
    property_update: "Редакция имот",
    floor_plan_save: "Запис етажна схема",
    finance_plan_update: "Запис финансова схема",
    property_payment_record: "Запис плащане",
    reservation_create: "Създаване резервация",
    reservation_extend: "Удължаване резервация",
    reservation_convert_to_deposit: "Конвертиране към Капаро",
    reservation_release: "Отмяна резервация",
    import_apply: "Apply на AI Import",
    snapshot_restore_prestate: "Pre-restore автоматичен",
};

function formatBgDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "medium" });
}

export default function AdminVersions() {
    const [items, setItems] = useState([]);
    const [filters, setFilters] = useState({ domain: "__all__", trigger_action: "__all__" });
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [restoring, setRestoring] = useState(false);
    const [confirmRestore, setConfirmRestore] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.domain !== "__all__") params.domain = filters.domain;
            if (filters.trigger_action !== "__all__") params.trigger_action = filters.trigger_action;
            const { data } = await api.get("/snapshots", { params });
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.domain, filters.trigger_action]);

    const openDetail = async (s) => {
        try {
            const { data } = await api.get(`/snapshots/${s.id}`);
            setDetail(data);
            setOpen(true);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const restore = async (snapshotId) => {
        setRestoring(true);
        try {
            const { data } = await api.post(`/snapshots/${snapshotId}/restore-as-new-version`);
            toast.success(
                `Restore приложен · pre-restore версия v${data.pre_restore_version}`
            );
            setConfirmRestore(null);
            setOpen(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setRestoring(false);
        }
    };

    const uniqueActions = Array.from(new Set(items.map((i) => i.trigger_action))).sort();

    return (
        <div className="space-y-8" data-testid="admin-versions">
            <div>
                <div className="overline mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Pre-change snapshots
                </div>
                <h1 className="font-serif text-4xl text-slate-900">Версии и възстановяване</h1>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                    Всяка критична промяна автоматично прави snapshot преди write-а, експортира се в отделно
                    хранилище и остава в тази хронология. Възстановяването създава <strong>нова версия</strong> — не
                    изтрива историята.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <Label>Домейн</Label>
                    <Select value={filters.domain} onValueChange={(v) => setFilters((f) => ({ ...f, domain: v }))}>
                        <SelectTrigger data-testid="versions-filter-domain"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">Всички</SelectItem>
                            {Object.entries(DOMAIN_LABELS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label>Действие</Label>
                    <Select value={filters.trigger_action} onValueChange={(v) => setFilters((f) => ({ ...f, trigger_action: v }))}>
                        <SelectTrigger data-testid="versions-filter-action"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">Всички</SelectItem>
                            {uniqueActions.map((a) => (
                                <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-x-auto" data-testid="versions-table">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="p-2 text-left font-medium">Кога</th>
                            <th className="p-2 text-left font-medium">Домейн</th>
                            <th className="p-2 text-left font-medium">Действие</th>
                            <th className="p-2 text-left font-medium">Обхват</th>
                            <th className="p-2 text-right font-medium">Версия</th>
                            <th className="p-2 text-left font-medium">Export</th>
                            <th className="p-2 text-right font-medium"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td className="p-4 text-slate-500" colSpan={7}>Зареждане…</td></tr>}
                        {!loading && items.length === 0 && (
                            <tr><td className="p-4 text-slate-500" colSpan={7}>Няма записани версии.</td></tr>
                        )}
                        {items.map((s) => (
                            <tr key={s.id} className="border-t hairline" data-testid={`versions-row-${s.id}`}>
                                <td className="p-2 text-slate-600">{formatBgDateTime(s.created_at)}</td>
                                <td className="p-2">{DOMAIN_LABELS[s.domain] || s.domain}</td>
                                <td className="p-2">{ACTION_LABELS[s.trigger_action] || s.trigger_action}</td>
                                <td className="p-2 text-slate-500 font-mono text-xs">{s.entity_scope || "—"}</td>
                                <td className="p-2 text-right font-mono">v{s.snapshot_version_number}</td>
                                <td className="p-2">
                                    {s.export_status === "exported" ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700" data-testid={`export-ok-${s.id}`}>
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Exported
                                        </span>
                                    ) : s.export_status === "failed" ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-rose-700" data-testid={`export-failed-${s.id}`}>
                                            <AlertTriangle className="h-3.5 w-3.5" /> Failed
                                        </span>
                                    ) : (
                                        <span className="text-xs text-amber-700">pending</span>
                                    )}
                                </td>
                                <td className="p-2 text-right">
                                    <Button size="sm" variant="outline" onClick={() => openDetail(s)} data-testid={`versions-detail-${s.id}`}>
                                        <History className="h-3.5 w-3.5 mr-1.5" /> Детайли
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl" data-testid="versions-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            Snapshot v{detail?.snapshot_version_number}
                        </DialogTitle>
                        <DialogDescription>
                            {detail && `${DOMAIN_LABELS[detail.domain] || detail.domain} · ${ACTION_LABELS[detail.trigger_action] || detail.trigger_action}`}
                        </DialogDescription>
                    </DialogHeader>
                    {detail && (
                        <div className="space-y-3 text-sm">
                            <div className="rounded-md border hairline bg-stone-50 p-3 space-y-1">
                                <div><strong>Кога:</strong> {formatBgDateTime(detail.created_at)}</div>
                                <div><strong>Обхват:</strong> <span className="font-mono text-xs">{detail.entity_scope || "—"}</span></div>
                                <div><strong>Проект:</strong> <span className="font-mono text-xs">{detail.project_id || "—"}</span></div>
                                <div><strong>Actor:</strong> <span className="font-mono text-xs">{detail.actor_id || "—"}</span></div>
                                <div><strong>Checksum:</strong> <span className="font-mono text-[10px]">{detail.before_state_checksum}</span></div>
                                <div><strong>Export:</strong> {detail.export_status === "exported" ? "✓ успешен" : detail.export_status}</div>
                                {detail.export_ref && (
                                    <div className="text-xs text-slate-500">
                                        <strong>Storage:</strong> <span className="font-mono">{detail.export_ref}</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Засегнати записи:</div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(detail.before_state_counts || {}).map(([coll, n]) => (
                                        <span key={coll} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono">
                                            {coll}: {n}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            {detail.notes && (
                                <div className="text-xs text-slate-600 italic">„{detail.notes}"</div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Затвори</Button>
                        <Button
                            onClick={() => setConfirmRestore(detail)}
                            disabled={!detail}
                            data-testid="versions-restore"
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            <RotateCcw className="h-4 w-4 mr-2" /> Възстанови като нова версия
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!confirmRestore} onOpenChange={(v) => !v && setConfirmRestore(null)}>
                <DialogContent className="max-w-md" data-testid="versions-restore-confirm">
                    <DialogHeader>
                        <DialogTitle>Потвърждение на възстановяване</DialogTitle>
                        <DialogDescription>
                            Това е <strong>safe restore</strong> — ще се създаде нова версия с данните от snapshot
                            <span className="font-mono"> v{confirmRestore?.snapshot_version_number}</span>.
                            Историята ще остане непроменена. Ще се направи и автоматичен pre-restore snapshot.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRestore(null)} disabled={restoring}>Отказ</Button>
                        <Button
                            onClick={() => restore(confirmRestore.id)}
                            disabled={restoring}
                            data-testid="versions-restore-do"
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {restoring ? "Възстановяване…" : "Потвърди"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
