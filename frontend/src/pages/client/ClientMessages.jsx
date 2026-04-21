import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";

function formatBgDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" });
}

export default function ClientMessages() {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef(null);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/messages");
            setMessages(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);

    const send = async () => {
        const trimmed = body.trim();
        if (!trimmed) {
            toast.error("Въведете съобщение");
            return;
        }
        setSending(true);
        try {
            const { data } = await api.post("/messages", { body: trimmed });
            setMessages((m) => [...m, data]);
            setBody("");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl" data-testid="client-messages">
            <div>
                <div className="overline mb-2">Кореспонденция</div>
                <h1 className="font-serif text-4xl text-slate-900">Съобщения с екипа</h1>
                <p className="text-sm text-slate-500 mt-2">
                    Задайте въпрос или опишете желанията си. Екипът ще отговори тук.
                </p>
            </div>

            <div
                ref={listRef}
                className="rounded-xl border hairline bg-white p-4 space-y-3 h-[420px] overflow-y-auto"
                data-testid="messages-list"
            >
                {loading && <div className="text-sm text-slate-500">Зареждане…</div>}
                {!loading && messages.length === 0 && (
                    <div className="text-sm text-slate-500 text-center py-10">
                        Все още няма съобщения. Започнете разговор ↓
                    </div>
                )}
                {messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    return (
                        <div
                            key={m.id}
                            className={`flex ${mine ? "justify-end" : "justify-start"}`}
                            data-testid={`msg-${m.id}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                                    mine
                                        ? "bg-slate-900 text-white rounded-br-sm"
                                        : "bg-stone-100 text-slate-900 rounded-bl-sm"
                                }`}
                            >
                                <div className="text-[11px] mb-1 opacity-70">
                                    {mine ? "Вие" : (m.sender_name || "Екип")} · {formatBgDateTime(m.created_at)}
                                </div>
                                <div>{m.body}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="rounded-xl border hairline bg-white p-3 flex items-end gap-2">
                <Textarea
                    rows={2}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Напишете съобщение…"
                    className="flex-1 resize-none"
                    data-testid="message-input"
                />
                <Button
                    onClick={send}
                    disabled={sending}
                    data-testid="message-send"
                    className="bg-slate-900 hover:bg-slate-800 text-white h-10"
                >
                    <Send className="h-4 w-4 mr-1.5" /> {sending ? "…" : "Изпрати"}
                </Button>
            </div>
        </div>
    );
}
