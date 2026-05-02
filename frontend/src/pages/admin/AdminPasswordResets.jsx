import React, { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../components/ui/dialog";
import { Copy, CheckCircle2, X, KeyRound, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, formatDate } from "../../lib/api";

const ROLE_BADGE = {
    client: { label: "Клиент", cls: "bg-slate-100 text-slate-700" },
    admin: { label: "Админ", cls: "bg-amber-100 text-amber-800" },
    super_admin: { label: "Super admin", cls: "bg-amber-100 text-amber-800" },
    sales: { label: "Sales", cls: "bg-blue-100 text-blue-800" },
    accounting: { label: "Accounting", cls: "bg-purple-100 text-purple-800" },
    project_manager: { label: "PM", cls: "bg-emerald-100 text-emerald-800" },
    broker: { label: "Брокер", cls: "bg-pink-100 text-pink-800" },
};

function timeUntilExpiry(iso) {
    if (!iso) return "";
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "изтекъл";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} мин остават`;
    return `${Math.floor(minutes / 60)} ч остават`;
}

export default function AdminPasswordResets() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [clients, setClients] = useState([]);
    const [setOpen, setSetOpen] = useState(false);
    const [target, setTarget] = useState(null);
    const [pw, setPw] = useState("");
    const [forceChange, setForceChange] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/auth/admin/password-resets");
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    const loadClients = async () => {
        try {
            const { data } = await api.get("/clients-enriched");
            setClients(data);
        } catch (e) {
            // не пречи на основния списък
        }
    };

    useEffect(() => { load(); loadClients(); }, []);

    const copy = async (url, id) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success("Линкът е копиран");
            // тихо маркираме като delivered за по-удобен tracking
            await api.post(`/auth/admin/password-resets/${id}/mark-delivered`).catch(() => {});
            load();
        } catch {
            toast.error("Неуспешно копиране");
        }
    };

    const cancel = async (id) => {
        try {
            await api.post(`/auth/admin/password-resets/${id}/cancel`);
            toast.success("Заявката е отменена");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const openSetPassword = (client) => {
        setTarget(client);
        setPw("");
        setForceChange(true);
        setSetOpen(true);
    };

    const submitSetPassword = async (e) => {
        e.preventDefault();
        if (!target || pw.length < 8) {
            toast.error("Минимум 8 символа");
            return;
        }
        setSaving(true);
        try {
            await api.post(`/auth/admin/clients/${target.id}/set-password`, {
                new_password: pw,
                force_change: forceChange,
            });
            toast.success(`Паролата е зададена за ${target.email}`);
            setSetOpen(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Сигурност</div>
                <h1 className="font-serif text-4xl text-slate-900">Заявки за смяна на парола</h1>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                    Тук виждате клиентски и служебни заявки за смяна на парола. Копирайте линка
                    и го изпратете на потребителя по WhatsApp, Viber или SMS. Линкът е валиден 1 час.
                </p>
            </div>

            <div className="rounded-2xl border hairline bg-white overflow-hidden" data-testid="password-resets-table">
                <div className="px-5 py-4 border-b hairline flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-900">
                        Активни заявки ({items.length})
                    </div>
                    <Button variant="outline" size="sm" onClick={load} data-testid="password-resets-refresh">
                        Обнови
                    </Button>
                </div>
                {loading ? (
                    <div className="p-6 text-sm text-slate-500">Зареждане…</div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                        Няма активни заявки за смяна на парола.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="text-left p-3 font-medium">Потребител</th>
                                <th className="text-left p-3 font-medium">Роля</th>
                                <th className="text-left p-3 font-medium">Заявено</th>
                                <th className="text-left p-3 font-medium">Изтича</th>
                                <th className="text-left p-3 font-medium">Линк</th>
                                <th className="text-right p-3 font-medium">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((r) => {
                                const role = ROLE_BADGE[r.user_role] || { label: r.user_role, cls: "bg-stone-100 text-slate-700" };
                                return (
                                    <tr key={r.id} className="border-t hairline" data-testid={`password-reset-row-${r.id}`}>
                                        <td className="p-3">
                                            <div className="font-medium text-slate-900">{r.user_name || "—"}</div>
                                            <div className="text-xs text-slate-500">{r.user_email}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${role.cls}`}>{role.label}</span>
                                        </td>
                                        <td className="p-3 text-slate-600">{formatDate(r.created_at)}</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1 text-xs ${r.expired ? "text-red-600" : "text-slate-600"}`}>
                                                <Clock className="h-3 w-3" />
                                                {timeUntilExpiry(r.expires_at)}
                                            </span>
                                            {r.delivered_at && (
                                                <div className="text-[10px] text-emerald-700 mt-1">
                                                    <CheckCircle2 className="h-3 w-3 inline mr-0.5" /> копиран
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 max-w-[260px]">
                                            <code className="text-[10px] bg-stone-50 border hairline rounded px-1.5 py-1 break-all block" data-testid={`reset-url-${r.id}`}>
                                                {r.reset_url}
                                            </code>
                                        </td>
                                        <td className="p-3 text-right whitespace-nowrap">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => copy(r.reset_url, r.id)}
                                                disabled={r.expired}
                                                data-testid={`copy-reset-url-${r.id}`}
                                                className="mr-2"
                                            >
                                                <Copy className="h-3 w-3 mr-1" /> Копирай
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => cancel(r.id)}
                                                data-testid={`cancel-reset-${r.id}`}
                                                className="text-red-700 hover:text-red-800"
                                            >
                                                <X className="h-3 w-3 mr-1" /> Отмени
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Manual set-password panel */}
            <div className="rounded-2xl border hairline bg-white p-5" data-testid="manual-set-password-panel">
                <div className="flex items-start gap-3 mb-4">
                    <KeyRound className="h-5 w-5 text-slate-700 mt-0.5" />
                    <div>
                        <h2 className="font-serif text-2xl text-slate-900">Ръчно задаване на парола (клиент)</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Например ако клиентът звъни по телефона. Паролата ще бъде зададена директно,
                            а клиентът ще бъде помолен да я смени при първи вход (по подразбиране).
                        </p>
                    </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {clients.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => openSetPassword(c)}
                            className="text-left rounded-md border hairline px-3 py-2 hover:bg-stone-50 transition flex items-center gap-3"
                            data-testid={`set-password-client-${c.id}`}
                        >
                            <Mail className="h-4 w-4 text-slate-400" />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">{c.name || c.email}</div>
                                <div className="text-xs text-slate-500 truncate">{c.email}</div>
                            </div>
                        </button>
                    ))}
                    {clients.length === 0 && (
                        <div className="text-sm text-slate-500 col-span-full">Няма клиенти.</div>
                    )}
                </div>
            </div>

            <Dialog open={setOpen} onOpenChange={setSetOpen}>
                <DialogContent className="max-w-md" data-testid="set-password-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Задай парола</DialogTitle>
                        <DialogDescription>
                            {target?.name || target?.email}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitSetPassword} className="space-y-4">
                        <div>
                            <Label htmlFor="set-pw">Нова парола</Label>
                            <Input
                                id="set-pw"
                                type="text"
                                value={pw}
                                onChange={(e) => setPw(e.target.value)}
                                required
                                minLength={8}
                                placeholder="Поне 8 символа, 1 буква и 1 цифра"
                                data-testid="set-password-input"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={forceChange}
                                onChange={(e) => setForceChange(e.target.checked)}
                                data-testid="set-password-force-checkbox"
                            />
                            Изискай клиентът да смени паролата при следващ вход
                        </label>
                        <Button
                            type="submit"
                            disabled={saving}
                            data-testid="set-password-submit"
                            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {saving ? "Запазване…" : "Запази паролата"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
