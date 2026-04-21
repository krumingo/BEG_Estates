import React, { useEffect, useRef, useState } from "react";
import { api, formatDate, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../components/ui/dialog";
import { MessageSquare, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PREFERRED_LABELS = {
    email: "Имейл",
    phone: "Телефон",
    viber: "Viber",
    any: "Няма значение",
};
const MISSING_LABELS = {
    name: "име",
    phone: "телефон",
    preferred_contact: "предпочитан контакт",
};

function formatBgDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminClients() {
    const [items, setItems] = useState([]);
    const [target, setTarget] = useState(null);
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef(null);

    const load = () => {
        api.get("/clients-enriched").then((r) => setItems(r.data)).catch(() => {});
    };
    useEffect(() => { load(); }, []);

    const openThread = async (client) => {
        setTarget(client);
        setOpen(true);
        setMessages([]);
        setLoadingMsgs(true);
        try {
            const { data } = await api.get("/messages", { params: { client_id: client.id } });
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

    const send = async () => {
        const trimmed = body.trim();
        if (!trimmed) return;
        setSending(true);
        try {
            const { data } = await api.post("/messages", {
                client_id: target.id,
                body: trimmed,
            });
            setMessages((m) => [...m, data]);
            setBody("");
            toast.success("Съобщението е изпратено");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Клиенти</div>
                <h1 className="font-serif text-4xl text-slate-900">Всички клиенти</h1>
                <p className="text-sm text-slate-500 mt-2">
                    Виждайте contact данни и изпращайте съобщения директно към клиента.
                </p>
            </div>
            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Име</th>
                            <th className="text-left p-3 font-medium">Имейл</th>
                            <th className="text-left p-3 font-medium">Телефон</th>
                            <th className="text-left p-3 font-medium">Предпочитан контакт</th>
                            <th className="text-left p-3 font-medium">Профил</th>
                            <th className="text-right p-3 font-medium">Резервации</th>
                            <th className="text-left p-3 font-medium">Регистрация</th>
                            <th className="text-right p-3 font-medium">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c) => {
                            const complete = c.completeness?.is_complete;
                            const missing = c.completeness?.missing || [];
                            return (
                                <tr key={c.id} className="border-t hairline" data-testid={`admin-client-${c.id}`}>
                                    <td className="p-3 font-medium">{c.name || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3 text-slate-600">{c.email}</td>
                                    <td className="p-3 text-slate-600">{c.phone || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3 text-slate-600">
                                        {c.preferred_contact
                                            ? PREFERRED_LABELS[c.preferred_contact] || c.preferred_contact
                                            : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="p-3">
                                        {complete ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700" data-testid={`client-complete-${c.id}`}>
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Пълен
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                                                title={`Липсва: ${missing.map((m) => MISSING_LABELS[m] || m).join(", ")}`}
                                                data-testid={`client-incomplete-${c.id}`}
                                            >
                                                <AlertCircle className="h-3.5 w-3.5" /> Непълен
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right font-medium">{c.reservation_count}</td>
                                    <td className="p-3 text-slate-600">{formatDate(c.created_at)}</td>
                                    <td className="p-3 text-right">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openThread(c)}
                                            data-testid={`admin-message-client-${c.id}`}
                                        >
                                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Съобщение
                                        </Button>
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

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-xl" data-testid="admin-message-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            Съобщения · {target?.name || target?.email}
                        </DialogTitle>
                        <DialogDescription>
                            {target?.email}
                            {target?.phone ? ` · ${target.phone}` : ""}
                            {target?.preferred_contact
                                ? ` · предпочита ${PREFERRED_LABELS[target.preferred_contact] || target.preferred_contact}`
                                : ""}
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
                                <div
                                    key={m.id}
                                    className={`flex ${fromStaff ? "justify-end" : "justify-start"}`}
                                    data-testid={`admin-msg-${m.id}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs whitespace-pre-wrap ${
                                            fromStaff
                                                ? "bg-slate-900 text-white rounded-br-sm"
                                                : "bg-white border hairline text-slate-900 rounded-bl-sm"
                                        }`}
                                    >
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
                        <Button
                            onClick={send}
                            disabled={sending}
                            data-testid="admin-msg-send"
                            className="bg-slate-900 hover:bg-slate-800 text-white h-10"
                        >
                            <Send className="h-4 w-4 mr-1.5" /> {sending ? "…" : "Изпрати"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
