import React, { useEffect, useState } from "react";
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
    UserPlus,
    Pencil,
    KeyRound,
    ShieldAlert,
    PowerOff,
    Power,
    Trash2,
    Copy,
    Eye,
    CheckCircle2,
    XCircle,
    BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";
import { ROLE_LABELS } from "../../lib/constants";

const STAFF_ROLE_OPTIONS = [
    { value: "admin", label: "Администратор" },
    { value: "sales", label: "Продажби" },
    { value: "project_manager", label: "Проект мениджър" },
    { value: "accounting", label: "Счетоводство" },
    { value: "broker", label: "Брокер" },
];

const ROLE_FILTERS = [
    { value: "all", label: "Всички" },
    { value: "super_admin", label: "Супер админ" },
    ...STAFF_ROLE_OPTIONS,
];

const EMPTY_FORM = {
    email: "",
    name: "",
    phone: "",
    role: "sales",
    notes: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RoleBadge({ role }) {
    const label = ROLE_LABELS[role] || role;
    const styles =
        role === "super_admin"
            ? "bg-violet-50 text-violet-700 border-violet-200"
            : role === "admin"
                ? "bg-slate-900 text-white border-slate-900"
                : role === "sales"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : role === "accounting"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : role === "project_manager"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : "bg-stone-100 text-stone-700 border-stone-200";
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${styles}`}>
            {role === "super_admin" && <ShieldAlert className="h-3 w-3" />}
            {label}
        </span>
    );
}

export default function AdminStaffUsers() {
    const { user: actor } = useAuth();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState("all");
    const [search, setSearch] = useState("");

    // create / edit form
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState("create");
    const [form, setForm] = useState(EMPTY_FORM);
    const [editTarget, setEditTarget] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    // temp password reveal
    const [pwReveal, setPwReveal] = useState(null); // {email, name, password}

    // destructive confirm
    const [confirmAction, setConfirmAction] = useState(null);
    // shape: { type: 'deactivate'|'activate'|'delete'|'reset-password', target, warnSuperAdmin }
    const [confirmBusy, setConfirmBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/admin/staff-users");
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Неуспешно зареждане");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    // --- Filters ---
    const filtered = items.filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            if (
                !(u.email || "").toLowerCase().includes(q) &&
                !(u.name || "").toLowerCase().includes(q)
            ) return false;
        }
        return true;
    });

    // --- Create / edit ---
    const openCreate = () => {
        setFormMode("create");
        setEditTarget(null);
        setForm(EMPTY_FORM);
        setFormError("");
        setFormOpen(true);
    };
    const openEdit = (u) => {
        setFormMode("edit");
        setEditTarget(u);
        setForm({
            email: u.email,
            name: u.name || "",
            phone: u.phone || "",
            role: u.role === "super_admin" ? "super_admin" : u.role,
            notes: u.notes || "",
        });
        setFormError("");
        setFormOpen(true);
    };

    const validateForm = () => {
        if (formMode === "create" && !EMAIL_RE.test(form.email.trim())) {
            return "Невалиден имейл";
        }
        if (form.name.trim().length < 2) return "Името трябва да е поне 2 символа";
        if (form.phone && form.phone.trim().length > 0 && form.phone.trim().length < 5) {
            return "Телефонът трябва да е поне 5 символа";
        }
        if (formMode === "create" && form.role === "super_admin") {
            return "super_admin не може да се създава през UI";
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
                const { data } = await api.post("/admin/staff-users", {
                    email: form.email.trim().toLowerCase(),
                    name: form.name.trim(),
                    phone: form.phone.trim() || null,
                    role: form.role,
                    notes: form.notes.trim() || null,
                });
                toast.success("Служителят е създаден");
                setFormOpen(false);
                if (data.temp_password) {
                    setPwReveal({
                        email: data.staff.email,
                        name: data.staff.name,
                        password: data.temp_password,
                    });
                }
                load();
            } else {
                const body = {
                    name: form.name.trim(),
                    phone: form.phone.trim() || null,
                    notes: form.notes.trim() || null,
                };
                // Allow role change само ако target НЕ е super_admin
                if (editTarget.role !== "super_admin") {
                    body.role = form.role;
                }
                await api.patch(`/admin/staff-users/${editTarget.id}`, body);
                toast.success("Служителят е обновен");
                setFormOpen(false);
                load();
            }
        } catch (e) {
            setFormError(formatApiError(e.response?.data?.detail));
        } finally {
            setSubmitting(false);
        }
    };

    // --- Actions ---
    const askConfirm = (type, target) => {
        const warnSuperAdmin = target.role === "super_admin" && target.id !== actor?.id;
        setConfirmAction({ type, target, warnSuperAdmin });
    };

    const runConfirm = async () => {
        if (!confirmAction) return;
        const { type, target } = confirmAction;
        setConfirmBusy(true);
        try {
            if (type === "reset-password") {
                const { data } = await api.post(`/admin/staff-users/${target.id}/reset-password`);
                toast.success("Паролата е нулирана");
                setConfirmAction(null);
                if (data.temp_password) {
                    setPwReveal({
                        email: target.email,
                        name: target.name,
                        password: data.temp_password,
                    });
                }
                load();
            } else if (type === "deactivate") {
                await api.post(`/admin/staff-users/${target.id}/deactivate`);
                toast.success(`${target.email} е деактивиран`);
                setConfirmAction(null);
                load();
            } else if (type === "activate") {
                await api.post(`/admin/staff-users/${target.id}/activate`);
                toast.success(`${target.email} е активиран`);
                setConfirmAction(null);
                load();
            } else if (type === "delete") {
                await api.delete(`/admin/staff-users/${target.id}`);
                toast.success(`${target.email} е изтрит`);
                setConfirmAction(null);
                load();
            }
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setConfirmBusy(false);
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

    const confirmCopy = (() => {
        if (!confirmAction) return { title: "", body: "", cta: "Потвърди", danger: false };
        const { type, target, warnSuperAdmin } = confirmAction;
        const name = target.name || target.email;
        const base = {
            "reset-password": {
                title: "Нулиране на парола",
                body: `Ще се генерира нова временна парола за ${name}. Предишната ще спре да работи.`,
                cta: "Генерирай парола",
                danger: false,
            },
            deactivate: {
                title: "Деактивиране",
                body: `${name} няма да може да влиза в системата. Всички активни сесии ще бъдат прекратени.`,
                cta: "Деактивирай",
                danger: true,
            },
            activate: {
                title: "Активиране",
                body: `${name} ще може отново да влиза в системата.`,
                cta: "Активирай",
                danger: false,
            },
            delete: {
                title: "Изтриване",
                body: `${name} ще бъде soft-изтрит. Имейлът ще се освободи за повторно използване. История в audit log-а се запазва.`,
                cta: "Изтрий",
                danger: true,
            },
        }[type] || { title: "Потвърждение", body: "", cta: "OK", danger: false };

        if (warnSuperAdmin) {
            base.warning =
                "Внимание: ще променяте друг super_admin. Ако системата остане без активен super admin, никой няма да може да достъпи това меню.";
        }
        return base;
    })();

    return (
        <div className="space-y-8" data-testid="admin-staff-users-page">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="overline mb-2">Служители</div>
                    <h1 className="font-serif text-4xl text-slate-900">Управление на екипа</h1>
                    <p className="text-sm text-slate-500 mt-2 max-w-xl">
                        Създавайте нови акаунти, нулирайте пароли,
                        активирайте/деактивирайте достъп. Достъпно само за супер администратор.
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    data-testid="admin-new-staff-btn"
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                    <UserPlus className="h-4 w-4 mr-2" /> Нов служител
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[240px]">
                    <Label htmlFor="staff-search" className="text-xs">Търсене</Label>
                    <Input
                        id="staff-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="По име или имейл…"
                        data-testid="admin-staff-search"
                    />
                </div>
                <div>
                    <Label htmlFor="staff-role-filter" className="text-xs">Роля</Label>
                    <select
                        id="staff-role-filter"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="h-10 rounded-md border hairline bg-white px-3 text-sm"
                        data-testid="admin-staff-role-filter"
                    >
                        {ROLE_FILTERS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Име</th>
                            <th className="text-left p-3 font-medium">Имейл</th>
                            <th className="text-left p-3 font-medium">Роля</th>
                            <th className="text-left p-3 font-medium">Телефон</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Създаден</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={7}>Зареждане…</td></tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={7}>Няма намерени служители.</td></tr>
                        )}
                        {filtered.map((u) => {
                            const isSelf = u.id === actor?.id;
                            return (
                                <tr
                                    key={u.id}
                                    className={`border-t hairline ${!u.is_active ? "bg-stone-50/60" : ""}`}
                                    data-testid={`admin-staff-row-${u.id}`}
                                >
                                    <td className="p-3 font-medium">
                                        <div className="flex items-center gap-2">
                                            {u.name || <span className="text-slate-400">—</span>}
                                            {isSelf && (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[10px] bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full"
                                                    data-testid="admin-staff-self-marker"
                                                    title="Това сте Вие"
                                                >
                                                    <BadgeCheck className="h-3 w-3" /> Вие
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 text-slate-600">
                                        {u.email}
                                        {u.must_change_password && (
                                            <span className="ml-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                нужна смяна
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3"><RoleBadge role={u.role} /></td>
                                    <td className="p-3 text-slate-600">{u.phone || <span className="text-slate-400">—</span>}</td>
                                    <td className="p-3">
                                        {u.is_active ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Активен
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs text-rose-700">
                                                <XCircle className="h-3.5 w-3.5" /> Деактивиран
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-slate-600">{formatDate(u.created_at)}</td>
                                    <td className="p-3 text-right whitespace-nowrap">
                                        <div className="inline-flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => openEdit(u)}
                                                data-testid={`admin-edit-staff-${u.id}`}
                                                className="h-8 px-2"
                                                title="Редактирай"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            {!isSelf && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => askConfirm("reset-password", u)}
                                                        data-testid={`admin-reset-password-${u.id}`}
                                                        className="h-8 px-2"
                                                        title="Нулирай парола"
                                                    >
                                                        <KeyRound className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {u.is_active ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => askConfirm("deactivate", u)}
                                                            data-testid={`admin-deactivate-staff-${u.id}`}
                                                            className="h-8 px-2 text-amber-700 hover:text-amber-800"
                                                            title="Деактивирай"
                                                        >
                                                            <PowerOff className="h-3.5 w-3.5" />
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => askConfirm("activate", u)}
                                                            data-testid={`admin-activate-staff-${u.id}`}
                                                            className="h-8 px-2 text-emerald-700 hover:text-emerald-800"
                                                            title="Активирай"
                                                        >
                                                            <Power className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => askConfirm("delete", u)}
                                                        data-testid={`admin-delete-staff-${u.id}`}
                                                        className="h-8 px-2 text-red-600 hover:text-red-700"
                                                        title="Изтрий"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Create / edit dialog */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-lg" data-testid="admin-staff-form-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            {formMode === "create" ? "Нов служител" : "Редакция на служител"}
                        </DialogTitle>
                        <DialogDescription>
                            {formMode === "create"
                                ? "Генерира се временна парола, която ще се покаже еднократно. При първи login служителят сменя паролата."
                                : `Промяна на: ${form.email}`}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitForm} className="space-y-4" data-testid="admin-staff-form">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <Label htmlFor="sf-name">Име <span className="text-red-500">*</span></Label>
                                <Input
                                    id="sf-name"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                    minLength={2}
                                    data-testid="admin-staff-form-name"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Label htmlFor="sf-email">
                                    Имейл {formMode === "create" && <span className="text-red-500">*</span>}
                                </Label>
                                <Input
                                    id="sf-email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    required
                                    disabled={formMode === "edit"}
                                    data-testid="admin-staff-form-email"
                                />
                                {formMode === "edit" && (
                                    <p className="text-xs text-slate-500 mt-1">Имейлът не може да се променя.</p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="sf-phone">Телефон</Label>
                                <Input
                                    id="sf-phone"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    data-testid="admin-staff-form-phone"
                                />
                            </div>
                            <div>
                                <Label htmlFor="sf-role">
                                    Роля <span className="text-red-500">*</span>
                                </Label>
                                <select
                                    id="sf-role"
                                    value={form.role}
                                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    className="w-full h-10 rounded-md border hairline bg-white px-3 text-sm disabled:opacity-60"
                                    disabled={formMode === "edit" && editTarget?.role === "super_admin"}
                                    data-testid="admin-staff-form-role"
                                >
                                    {formMode === "edit" && editTarget?.role === "super_admin" && (
                                        <option value="super_admin">Супер администратор</option>
                                    )}
                                    {STAFF_ROLE_OPTIONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                                {formMode === "edit" && editTarget?.role === "super_admin" && (
                                    <p className="text-xs text-slate-500 mt-1">Ролята super_admin не може да се променя от UI.</p>
                                )}
                            </div>
                            <div className="sm:col-span-2">
                                <Label htmlFor="sf-notes">Бележки</Label>
                                <Textarea
                                    id="sf-notes"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    rows={3}
                                    data-testid="admin-staff-form-notes"
                                />
                            </div>
                        </div>
                        {formError && (
                            <div className="text-sm text-red-600" data-testid="admin-staff-form-error">
                                {formError}
                            </div>
                        )}
                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setFormOpen(false)}
                                data-testid="admin-staff-form-cancel"
                            >
                                Откажи
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting}
                                data-testid="admin-staff-form-submit"
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {submitting ? "Запазване…" : formMode === "create" ? "Създай" : "Запази"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Temp password reveal */}
            <Dialog open={!!pwReveal} onOpenChange={(o) => !o && setPwReveal(null)}>
                <DialogContent className="max-w-md" data-testid="admin-staff-temp-password-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl flex items-center gap-2">
                            <Eye className="h-5 w-5 text-amber-700" />
                            Временна парола
                        </DialogTitle>
                        <DialogDescription>
                            За {pwReveal?.name} · {pwReveal?.email}
                        </DialogDescription>
                    </DialogHeader>
                    <div
                        className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono text-2xl text-slate-900 break-all text-center"
                        data-testid="admin-staff-temp-password-value"
                    >
                        {pwReveal?.password}
                    </div>
                    <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-800 leading-relaxed">
                        ⚠️ Запишете паролата СЕГА — няма да се покаже отново.
                        <br />
                        Изпратете я на служителя ръчно. При първи login той ще смени паролата.
                    </div>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={copyPw}
                            data-testid="admin-staff-temp-password-copy"
                        >
                            <Copy className="h-4 w-4 mr-1.5" /> Копирай
                        </Button>
                        <Button
                            onClick={() => setPwReveal(null)}
                            data-testid="admin-staff-temp-password-ack"
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            ОК — записах я
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Destructive confirm */}
            <Dialog open={!!confirmAction} onOpenChange={(o) => !o && !confirmBusy && setConfirmAction(null)}>
                <DialogContent className="max-w-md" data-testid="admin-staff-confirm-dialog">
                    <DialogHeader>
                        <DialogTitle className={`font-serif text-2xl ${confirmCopy.danger ? "text-red-700" : ""}`}>
                            {confirmCopy.title}
                        </DialogTitle>
                        <DialogDescription>{confirmCopy.body}</DialogDescription>
                    </DialogHeader>
                    {confirmCopy.warning && (
                        <div
                            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed"
                            data-testid="admin-staff-confirm-super-warning"
                        >
                            {confirmCopy.warning}
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setConfirmAction(null)}
                            disabled={confirmBusy}
                            data-testid="admin-staff-confirm-cancel"
                        >
                            Откажи
                        </Button>
                        <Button
                            onClick={runConfirm}
                            disabled={confirmBusy}
                            data-testid="admin-staff-confirm-ok"
                            className={confirmCopy.danger ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-900 hover:bg-slate-800 text-white"}
                        >
                            {confirmBusy ? "Изпълнение…" : confirmCopy.cta}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
