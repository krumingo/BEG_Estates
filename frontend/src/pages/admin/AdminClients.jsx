import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, formatDate, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../../components/ui/select";
import { MessageSquare, Send, Plus, Pencil, Power, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import ClientFormDialog, { CLIENT_TYPE_OPTIONS } from "../../components/admin/ClientFormDialog";

const TYPE_LABEL = Object.fromEntries(CLIENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const TYPE_BADGE = {
    buyer: "bg-sky-50 text-sky-800 border-sky-200",
    investor: "bg-amber-50 text-amber-800 border-amber-200",
    company: "bg-rose-50 text-rose-800 border-rose-200",
    compensation: "bg-violet-50 text-violet-800 border-violet-200",
};

function formatBgDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminClients() {
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [activeFilter, setActiveFilter] = useState("true"); // true | false | all
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState("create");
    const [formInitial, setFormInitial] = useState(null);
    const [confirm, setConfirm] = useState(null); // { type, client }
    const [canDeleteCache, setCanDeleteCache] = useState({}); // id -> {can_delete, reason}

    // Messaging
    const [msgTarget, setMsgTarget] = useState(null);
    const [msgOpen, setMsgOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef(null);

    const load = () => {
        const params = { active: activeFilter };
        if (typeFilter !== "all") params.type = typeFilter;
        if (search.trim()) params.search = search.trim();
        api.get("/clients", { params }).then((r) => setItems(r.data)).catch(() => {});
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeFilter, typeFilter]);

    // Debounce search
    useEffect(() => {
        const h = setTimeout(load, 300);
        return () => clearTimeout(h);
        /* eslint-disable-next-line */
    }, [search]);

    const onSaved = () => { load(); };

    const openCreate = () => {
        setFormMode("create");
        setFormInitial(null);
        setFormOpen(true);
    };
    const openEdit = (c) => {
        setFormMode("edit");
        setFormInitial(c);
        setFormOpen(true);
    };

    const doDeactivate = async (c) => {
        try {
            await api.post(`/clients/${c.id}/deactivate`);
            toast.success(`${c.name} е деактивиран`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };
    const doActivate = async (c) => {
        try {
            await api.post(`/clients/${c.id}/activate`);
            toast.success(`${c.name} е активиран`);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };
    const doDelete = async (c) => {
        try {
            await api.delete(`/clients/${c.id}`);
            toast.success("Клиентът е изтрит");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    // Lazily fetch can-delete info on hover/render
    const ensureCanDelete = async (id) => {
        if (canDeleteCache[id] !== undefined) return;
        try {
            const r = await api.get(`/clients/${id}/can-delete`);
            setCanDeleteCache((m) => ({ ...m, [id]: r.data }));
        } catch {
            // ignore
        }
    };

    const openThread = async (c) => {
        setMsgTarget(c);
        setMsgOpen(true);
        setMessages([]);
        setLoadingMsgs(true);
        try {
            const { data } = await api.get("/messages", { params: { client_id: c.id } });
            setMessages(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoadingMsgs(false);
        }
    };
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);
    const sendMsg = async () => {
        const trimmed = body.trim();
        if (!trimmed) return;
        setSending(true);
        try {
            const { data } = await api.post("/messages", { client_id: msgTarget.id, body: trimmed });
            setMessages((m) => [...m, data]);
            setBody("");
            toast.success("Изпратено");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSending(false);
        }
    };

    const totalProps = useMemo(
        () => items.reduce((s, c) => s + (c.property_count || 0), 0),
        [items]
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="overline mb-2">Клиенти</div>
                    <h1 className="font-serif text-4xl text-slate-900">Всички клиенти</h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Унифициран списък — купувачи, инвеститори, фирми и обезщетения. Общо{" "}
                        <span className="font-medium text-slate-900">{items.length}</span> записа,{" "}
                        <span className="font-medium text-slate-900">{totalProps}</span> свързани имота.
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    data-testid="admin-clients-add"
                >
                    <Plus className="h-4 w-4 mr-1.5" /> Нов клиент
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border hairline bg-white">
                <div className="relative flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                    <Input
                        className="pl-9"
                        placeholder="Търсене по име, имейл, телефон, ЕГН…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        data-testid="admin-clients-search"
                    />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-44" data-testid="admin-clients-type-filter">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички типове</SelectItem>
                        {CLIENT_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={activeFilter} onValueChange={setActiveFilter}>
                    <SelectTrigger className="w-44" data-testid="admin-clients-active-filter">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="true">Само активни</SelectItem>
                        <SelectItem value="false">Само деактивирани</SelectItem>
                        <SelectItem value="all">Всички</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Име</th>
                            <th className="text-left p-3 font-medium">Email</th>
                            <th className="text-left p-3 font-medium">Телефон</th>
                            <th className="text-left p-3 font-medium">Тип</th>
                            <th className="text-right p-3 font-medium">Имоти</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Регистрация</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c) => {
                            const isActive = c.is_active !== false;
                            const cdInfo = canDeleteCache[c.id];
                            const canDelete = cdInfo ? cdInfo.can_delete : (c.property_count === 0 && c.reservation_count === 0);
                            const cdReason = cdInfo?.reason || (
                                (c.property_count > 0 || c.reservation_count > 0)
                                    ? "Този клиент има свързани имоти/резервации. Деактивирайте го вместо това."
                                    : ""
                            );
                            return (
                                <tr
                                    key={c.id}
                                    className={`border-t hairline ${isActive ? "" : "bg-stone-50/60"}`}
                                    data-testid={`admin-client-${c.id}`}
                                    onMouseEnter={() => ensureCanDelete(c.id)}
                                >
                                    <td className="p-3">
                                        <div className={`font-medium ${isActive ? "text-slate-900" : "text-slate-500"}`}>
                                            {c.name || <span className="text-slate-400">—</span>}
                                        </div>
                                    </td>
                                    <td className="p-3 text-slate-600">{c.email || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3 text-slate-600">{c.phone || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3">
                                        <span
                                            className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${TYPE_BADGE[c.client_type] || TYPE_BADGE.buyer}`}
                                            data-testid={`client-type-${c.id}`}
                                        >
                                            {TYPE_LABEL[c.client_type] || "Купувач"}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-medium">
                                        {c.property_count > 0
                                            ? `${c.property_count} имот${c.property_count === 1 ? "" : "а"}`
                                            : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="p-3">
                                        {isActive ? (
                                            <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200" data-testid={`client-status-active-${c.id}`}>
                                                Активен
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200" data-testid={`client-status-inactive-${c.id}`}>
                                                Деактивиран
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-slate-600">{formatDate(c.created_at)}</td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-1.5 justify-end">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => openEdit(c)}
                                                data-testid={`client-edit-${c.id}`}
                                                title="Редакция"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            {isActive ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setConfirm({ type: "deactivate", client: c })}
                                                    data-testid={`client-deactivate-${c.id}`}
                                                    title="Деактивирай"
                                                >
                                                    <Power className="h-3.5 w-3.5" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => doActivate(c)}
                                                    data-testid={`client-activate-${c.id}`}
                                                    title="Активирай"
                                                >
                                                    <Power className="h-3.5 w-3.5 text-emerald-600" />
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={!canDelete}
                                                onClick={() => setConfirm({ type: "delete", client: c })}
                                                data-testid={`client-delete-${c.id}`}
                                                title={canDelete ? "Изтрий" : cdReason}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                            </Button>
                                            {c.email && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openThread(c)}
                                                    data-testid={`admin-message-client-${c.id}`}
                                                    title="Съобщение"
                                                >
                                                    <MessageSquare className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={8}>Няма клиенти.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Form modal */}
            <ClientFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                mode={formMode}
                initial={formInitial}
                onSaved={onSaved}
            />

            {/* Confirm dialog */}
            <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
                <DialogContent data-testid="client-confirm-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            {confirm?.type === "delete" ? "Изтриване на клиент" : "Деактивиране на клиент"}
                        </DialogTitle>
                        <DialogDescription>
                            {confirm?.type === "delete"
                                ? `Сигурни ли сте, че искате да изтриете "${confirm?.client?.name}"? Това действие е необратимо.`
                                : `Сигурни ли сте, че искате да деактивирате "${confirm?.client?.name}"? Историческите връзки ще останат видими.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirm(null)} data-testid="client-confirm-cancel">
                            Отказ
                        </Button>
                        <Button
                            className={confirm?.type === "delete" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-900 text-white hover:bg-slate-800"}
                            onClick={async () => {
                                if (!confirm) return;
                                if (confirm.type === "delete") await doDelete(confirm.client);
                                else await doDeactivate(confirm.client);
                                setConfirm(null);
                            }}
                            data-testid="client-confirm-ok"
                        >
                            {confirm?.type === "delete" ? "Изтрий" : "Деактивирай"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Messaging dialog */}
            <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
                <DialogContent className="max-w-xl" data-testid="admin-message-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            Съобщения · {msgTarget?.name || msgTarget?.email}
                        </DialogTitle>
                        <DialogDescription>
                            {msgTarget?.email}{msgTarget?.phone ? ` · ${msgTarget.phone}` : ""}
                        </DialogDescription>
                    </DialogHeader>
                    <div
                        ref={listRef}
                        className="rounded-md border hairline bg-stone-50 p-3 space-y-3 h-[340px] overflow-y-auto"
                        data-testid="admin-msg-list"
                    >
                        {loadingMsgs && <div className="text-xs text-slate-500">Зареждане…</div>}
                        {!loadingMsgs && messages.length === 0 && (
                            <div className="text-xs text-slate-500 text-center py-10">Няма разговор все още.</div>
                        )}
                        {messages.map((m) => {
                            const fromStaff = m.sender_role === "staff";
                            return (
                                <div key={m.id} className={`flex ${fromStaff ? "justify-end" : "justify-start"}`} data-testid={`admin-msg-${m.id}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs whitespace-pre-wrap ${fromStaff ? "bg-slate-900 text-white rounded-br-sm" : "bg-white border hairline text-slate-900 rounded-bl-sm"}`}>
                                        <div className="text-[10px] mb-1 opacity-70">
                                            {fromStaff ? m.sender_name || "Екип" : m.sender_name || "Клиент"} · {formatBgDateTime(m.created_at)}
                                        </div>
                                        <div>{m.body}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-end gap-2 pt-2">
                        <Textarea
                            rows={2}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Отговор към клиента…"
                            className="flex-1 resize-none"
                            data-testid="admin-msg-input"
                        />
                        <Button onClick={sendMsg} disabled={sending} data-testid="admin-msg-send" className="bg-slate-900 hover:bg-slate-800 text-white h-10">
                            <Send className="h-4 w-4 mr-1.5" /> {sending ? "…" : "Изпрати"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
