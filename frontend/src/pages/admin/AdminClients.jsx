import React, { useEffect, useRef, useState } from "react";
import { api, formatDate, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../../components/ui/dialog";
import {
    MessageSquare,
    Send,
    AlertCircle,
    CheckCircle2,
    UserPlus,
    Pencil,
    KeyRound,
    Trash2,
    Copy,
    Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";

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

const EMPTY_FORM = {
    email: "",
    name: "",
    phone: "",
    preferred_contact: "any",
    notes: "",
    send_password: true,
};

function formatBgDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminClients() {
    const { user: actor } = useAuth();
    const isSuperOrAdmin = actor?.role === "super_admin" || actor?.role === "admin";

    const [items, setItems] = useState([]);
    const [target, setTarget] = useState(null);
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef(null);

    // create / edit state
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState("create"); // create | edit
    const [form, setForm] = useState(EMPTY_FORM);
    const [editId, setEditId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    // temp password reveal
    const [pwReveal, setPwReveal] = useState(null); // {email, password}

    // set-password modal (for existing client)
    const [setPwOpen, setSetPwOpen] = useState(false);
    const [setPwTarget, setSetPwTarget] = useState(null);
    const [setPwValue, setSetPwValue] = useState("");
    const [setPwForce, setSetPwForce] = useState(true);
    const [setPwSaving, setSetPwSaving] = useState(false);

    // delete confirm
    const [deleteTarget, setDeleteTarget] = useState(null);

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
            const { data } = await api.post("/messages", { client_id: target.id, body: trimmed });
            setMessages((m) => [...m, data]);
            setBody("");
            toast.success("Съобщението е изпратено");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSending(false);
        }
    };

    // --- Create / edit ---
    const openCreate = () => {
        setFormMode("create");
        setEditId(null);
        setForm(EMPTY_FORM);
        setFormError("");
        setFormOpen(true);
    };
    const openEdit = (c) => {
        setFormMode("edit");
        setEditId(c.id);
        setForm({
            email: c.email || "",
            name: c.name || "",
            phone: c.phone || "",
            preferred_contact: c.preferred_contact || "any",
            notes: c.client_note || "",
            send_password: false,
        });
        setFormError("");
        setFormOpen(true);
    };

    const validateForm = () => {
        if (formMode === "create") {
            if (!EMAIL_RE.test(form.email.trim())) return "Невалиден имейл";
        }
        if (form.name.trim().length < 2) return "Името трябва да е поне 2 символа";
        if (form.phone && form.phone.trim().length > 0 && form.phone.trim().length < 5) {
            return "Телефонът трябва да е поне 5 символа";
        }
        return null;
    };

    const submitForm = async (e) => {
        e.preventDefault();
        const err = validateForm();
        if (err) { setFormError(err); return; }
        setFormError("");
        setSubmitting(true);
        try {
            if (formMode === "create") {
                const { data } = await api.post("/admin/clients", {
                    email: form.email.trim().toLowerCase(),
                    name: form.name.trim(),
                    phone: form.phone.trim() || null,
                    preferred_contact: form.preferred_contact,
                    notes: form.notes.trim() || null,
                    send_password: form.send_password,
                });
                toast.success("Клиентът е създаден");
                setFormOpen(false);
                if (data.temp_password) {
                    setPwReveal({ email: data.client.email, name: data.client.name, password: data.temp_password });
                }
                load();
            } else {
                await api.patch(`/admin/clients/${editId}`, {
                    name: form.name.trim(),
                    phone: form.phone.trim() || null,
                    preferred_contact: form.preferred_contact,
                    notes: form.notes.trim() || null,
                });
                toast.success("Клиентът е обновен");
                setFormOpen(false);
                load();
            }
        } catch (e) {
            setFormError(formatApiError(e.response?.data?.detail));
        } finally {
            setSubmitting(false);
        }
    };

    // --- Set password ---
    const openSetPassword = (c) => {
        setSetPwTarget(c);
        setSetPwValue("");
        setSetPwForce(true);
        setSetPwOpen(true);
    };
    const submitSetPassword = async (e) => {
        e.preventDefault();
        if (setPwValue.length < 8) {
            toast.error("Минимум 8 символа");
            return;
        }
        setSetPwSaving(true);
        try {
            await api.post(`/auth/admin/clients/${setPwTarget.id}/set-password`, {
                new_password: setPwValue,
                force_change: setPwForce,
            });
            toast.success(`Паролата е зададена за ${setPwTarget.email}`);
            setSetPwOpen(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSetPwSaving(false);
        }
    };

    // --- Delete ---
    const submitDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/admin/clients/${deleteTarget.id}`);
            toast.success(`${deleteTarget.email} е изтрит`);
            setDeleteTarget(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const copyPw = async () => {
        try {
            await navigator.clipboard.writeText(pwReveal.password);
            toast.success("Паролата е копирана");
        } catch {
            toast.error("Неуспешно копиране");
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="overline mb-2">Клиенти</div>
                    <h1 className="font-serif text-4xl text-slate-900">Всички клиенти</h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Виждайте contact данни и изпращайте съобщения директно към клиента.
                    </p>
                </div>
                <Button onClick={openCreate} data-testid="admin-new-client-btn" className="bg-slate-900 hover:bg-slate-800 text-white">
                    <UserPlus className="h-4 w-4 mr-2" /> Нов клиент
                </Button>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Име</th>
                            <th className="text-left p-3 font-medium">Имейл</th>
                            <th className="text-left p-3 font-medium">Телефон</th>
                            <th className="text-left p-3 font-medium">Контакт</th>
                            <th className="text-left p-3 font-medium">Профил</th>
                            <th className="text-right p-3 font-medium">Резервации</th>
                            <th className="text-left p-3 font-medium">Регистрация</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c) => {
                            const complete = c.completeness?.is_complete;
                            const missing = c.completeness?.missing || [];
                            return (
                                <tr key={c.id} className="border-t hairline" data-testid={`admin-client-${c.id}`}>
                                    <td className="p-3 font-medium">{c.name || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3 text-slate-600">
                                        {c.email}
                                        {c.must_change_password && (
                                            <span className="ml-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                нужна смяна
                                            </span>
                                        )}
                                        {!c.has_password && (
                                            <span className="ml-2 text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                                без парола
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-slate-600">{c.phone || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3 text-slate-600">
                                        {c.preferred_contact ? PREFERRED_LABELS[c.preferred_contact] || c.preferred_contact : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="p-3">
                                        {complete ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Пълен
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                                                title={`Липсва: ${missing.map((m) => MISSING_LABELS[m] || m).join(", ")}`}
                                            >
                                                <AlertCircle className="h-3.5 w-3.5" /> Непълен
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right font-medium">{c.reservation_count}</td>
                                    <td className="p-3 text-slate-600">{formatDate(c.created_at)}</td>
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <div className="inline-flex gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => openEdit(c)} data-testid={`admin-edit-client-${c.id}`} className="h-8 px-2" title="Редактирай">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => openSetPassword(c)} data-testid={`admin-set-password-${c.id}`} className="h-8 px-2" title="Задай парола">
                                                <KeyRound className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => openThread(c)} data-testid={`admin-message-client-${c.id}`} className="h-8 px-2" title="Съобщение">
                                                <MessageSquare className="h-3.5 w-3.5" />
                                            </Button>
                                            {isSuperOrAdmin && (
                                                <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(c)} data-testid={`admin-delete-client-${c.id}`} className="h-8 px-2 text-red-600 hover:text-red-700" title="Изтрий">
                                                    <Trash2 className="h-3.5 w-3.5" />
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

            {/* Create/Edit dialog */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-lg" data-testid="admin-client-form-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            {formMode === "create" ? "Нов клиент" : "Редакция на клиент"}
                        </DialogTitle>
                        <DialogDescription>
                            {formMode === "create"
                                ? "Създайте профил на купувач. Ако генерирате временна парола, тя ще се покаже еднократно."
                                : `Промяна на: ${form.email}`}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitForm} className="space-y-4" data-testid="admin-client-form">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <Label htmlFor="cf-name">Име <span className="text-red-500">*</span></Label>
                                <Input
                                    id="cf-name"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                    minLength={2}
                                    data-testid="admin-client-form-name"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Label htmlFor="cf-email">Имейл {formMode === "create" && <span className="text-red-500">*</span>}</Label>
                                <Input
                                    id="cf-email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    required
                                    disabled={formMode === "edit"}
                                    data-testid="admin-client-form-email"
                                />
                                {formMode === "edit" && (
                                    <p className="text-xs text-slate-500 mt-1">Имейлът не може да се променя.</p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="cf-phone">Телефон</Label>
                                <Input
                                    id="cf-phone"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    data-testid="admin-client-form-phone"
                                />
                            </div>
                            <div>
                                <Label htmlFor="cf-pref">Предпочитан контакт</Label>
                                <select
                                    id="cf-pref"
                                    value={form.preferred_contact}
                                    onChange={(e) => setForm({ ...form, preferred_contact: e.target.value })}
                                    className="w-full h-10 rounded-md border hairline bg-white px-3 text-sm"
                                    data-testid="admin-client-form-preferred"
                                >
                                    <option value="any">Няма значение</option>
                                    <option value="email">Имейл</option>
                                    <option value="phone">Телефон</option>
                                    <option value="viber">Viber</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <Label htmlFor="cf-notes">Бележки</Label>
                                <Textarea
                                    id="cf-notes"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    rows={3}
                                    data-testid="admin-client-form-notes"
                                />
                            </div>
                            {formMode === "create" && (
                                <div className="sm:col-span-2">
                                    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.send_password}
                                            onChange={(e) => setForm({ ...form, send_password: e.target.checked })}
                                            className="mt-0.5"
                                            data-testid="admin-client-form-send-password"
                                        />
                                        <div>
                                            <div>Генерирай временна парола сега</div>
                                            <div className="text-xs text-slate-500">
                                                Препоръчително. Паролата ще се покаже еднократно — копирайте я и я предайте на клиента ръчно (WhatsApp/Viber/SMS).
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                        {formError && (
                            <div className="text-sm text-red-600" data-testid="admin-client-form-error">
                                {formError}
                            </div>
                        )}
                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setFormOpen(false)}
                                data-testid="admin-client-form-cancel"
                            >
                                Откажи
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting}
                                data-testid="admin-client-form-submit"
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {submitting ? "Запазване…" : formMode === "create" ? "Създай" : "Запази"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Reveal temp password dialog */}
            <Dialog open={!!pwReveal} onOpenChange={(o) => !o && setPwReveal(null)}>
                <DialogContent className="max-w-md" data-testid="admin-temp-password-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl flex items-center gap-2">
                            <Eye className="h-5 w-5 text-amber-700" />
                            Временна парола
                        </DialogTitle>
                        <DialogDescription>
                            За {pwReveal?.name} · {pwReveal?.email}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono text-2xl text-slate-900 break-all text-center" data-testid="admin-temp-password-value">
                        {pwReveal?.password}
                    </div>
                    <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-800 leading-relaxed">
                        ⚠️ Запишете паролата СЕГА — няма да се покаже отново.
                        <br />
                        Изпратете я на клиента ръчно (WhatsApp/Viber/SMS). Клиентът ще трябва да я смени при първи login.
                    </div>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={copyPw}
                            data-testid="admin-temp-password-copy"
                        >
                            <Copy className="h-4 w-4 mr-1.5" /> Копирай
                        </Button>
                        <Button
                            onClick={() => setPwReveal(null)}
                            data-testid="admin-temp-password-ack"
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            ОК — записах я
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Set-password modal */}
            <Dialog open={setPwOpen} onOpenChange={setSetPwOpen}>
                <DialogContent className="max-w-md" data-testid="admin-set-password-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Задай парола</DialogTitle>
                        <DialogDescription>
                            {setPwTarget?.name || setPwTarget?.email}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitSetPassword} className="space-y-4">
                        <div>
                            <Label htmlFor="set-pw-2">Нова парола</Label>
                            <Input
                                id="set-pw-2"
                                type="text"
                                value={setPwValue}
                                onChange={(e) => setSetPwValue(e.target.value)}
                                required
                                minLength={8}
                                placeholder="Поне 8 символа, 1 буква и 1 цифра"
                                data-testid="admin-set-password-input"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={setPwForce}
                                onChange={(e) => setSetPwForce(e.target.checked)}
                                data-testid="admin-set-password-force"
                            />
                            Изискай клиентът да смени паролата при следващ вход
                        </label>
                        <Button
                            type="submit"
                            disabled={setPwSaving}
                            data-testid="admin-set-password-submit"
                            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {setPwSaving ? "Запазване…" : "Запази паролата"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <DialogContent className="max-w-md" data-testid="admin-delete-client-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl text-red-700">Изтриване на клиент</DialogTitle>
                        <DialogDescription>
                            Сигурни ли сте, че искате да изтриете <b>{deleteTarget?.name || deleteTarget?.email}</b>?
                            История на резервациите остава в системата (soft delete).
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="admin-delete-client-cancel">
                            Откажи
                        </Button>
                        <Button
                            onClick={submitDelete}
                            data-testid="admin-delete-client-confirm"
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Trash2 className="h-4 w-4 mr-1.5" /> Изтрий
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Messaging dialog (existing) */}
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
