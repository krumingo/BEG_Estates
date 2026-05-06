import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Save, Send, Trash2, Plus, X, Lock } from "lucide-react";
import { api, currency, formatDate, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { useIsSuperAdmin } from "../../lib/auth";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE } from "./AdminQuotes";

function floorLabel(f) {
    if (f === undefined || f === null) return "";
    if (f > 0) return `Етаж ${f}`;
    if (f === 0) return "Партер";
    return "Сутерен";
}

export default function QuoteEditor() {
    const { id } = useParams();
    const isNew = !id || id === "new";
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const initialPropertyId = params.get("property_id") || null;

    if (isNew) return <NewQuoteWizard initialPropertyId={initialPropertyId} />;
    return <EditQuoteScreen id={id} />;
}

// =====================================================
// STEP 1 — Wizard for new quote
// =====================================================
function NewQuoteWizard({ initialPropertyId }) {
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);
    const [clientId, setClientId] = useState("");
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [properties, setProperties] = useState([]);
    const [selected, setSelected] = useState(new Set(initialPropertyId ? [initialPropertyId] : []));
    const [vatMode, setVatMode] = useState("with_vat");
    const [schemeType, setSchemeType] = useState("standard");
    const [stopDeposit, setStopDeposit] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        api.get("/clients", { params: { active: "true" } }).then((r) => setClients(r.data)).catch(() => {});
        api.get("/projects").then((r) => {
            setProjects(r.data);
            const primary = r.data.find((p) => p.is_primary) || r.data[0];
            if (primary) setProjectId(primary.id);
        });
    }, []);

    useEffect(() => {
        if (!projectId) return;
        api.get(`/projects/${projectId}/properties`).then((r) => setProperties(r.data));
    }, [projectId]);

    const available = useMemo(
        () => properties.filter((p) => p.status === "available" || p.status === "reserved_zero_deposit"),
        [properties]
    );

    const groupedByFloor = useMemo(() => {
        const groups = new Map();
        for (const p of available) {
            const key = p.floor ?? -99;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(p);
        }
        return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
    }, [available]);

    const toggle = (id) => {
        setSelected((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    };

    const submit = async () => {
        if (!clientId) {
            toast.error("Изберете клиент");
            return;
        }
        if (selected.size === 0) {
            toast.error("Изберете поне един имот");
            return;
        }
        setCreating(true);
        try {
            const { data } = await api.post("/quotes", {
                client_id: clientId,
                property_ids: Array.from(selected),
                vat_mode: vatMode,
                scheme_type: schemeType,
                stop_deposit_amount: parseFloat(stopDeposit || 0),
            });
            toast.success(`Оферта ${data.quote_number} създадена`);
            navigate(`/admin/quotes/${data.id}`);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <Link to="/admin/quotes" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> Назад към списъка
                </Link>
            </div>
            <div>
                <div className="overline mb-2">Нова оферта</div>
                <h1 className="font-serif text-4xl text-slate-900">Стъпка 1 — Клиент и имоти</h1>
            </div>

            <div className="space-y-4 p-6 rounded-xl border hairline bg-white">
                <div>
                    <Label>Клиент *</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                        <SelectTrigger data-testid="quote-wizard-client"><SelectValue placeholder="Изберете клиент…" /></SelectTrigger>
                        <SelectContent>
                            {clients.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label>Проект</Label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger data-testid="quote-wizard-project"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>ДДС режим</Label>
                        <Select value={vatMode} onValueChange={setVatMode}>
                            <SelectTrigger data-testid="quote-wizard-vat"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="with_vat">С ДДС</SelectItem>
                                <SelectItem value="without_vat">Без ДДС</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label>Схема за плащане</Label>
                        <Select value={schemeType} onValueChange={setSchemeType}>
                            <SelectTrigger data-testid="quote-wizard-scheme"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">Стандартна (без банка) — 8 етапа</SelectItem>
                                <SelectItem value="with_bank">С банков кредит — 4 етапа</SelectItem>
                                <SelectItem value="custom">Custom (ръчно)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Стоп-капаро (вече внесено), €</Label>
                        <Input
                            type="number"
                            step="100"
                            min="0"
                            value={stopDeposit}
                            onChange={(e) => setStopDeposit(e.target.value)}
                            placeholder="0"
                            data-testid="quote-wizard-stop-deposit"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="font-serif text-xl text-slate-900">Изберете имоти</h2>
                    <span className="text-sm text-slate-500">Избрани: <span className="font-medium text-slate-900">{selected.size}</span></span>
                </div>
                <div className="rounded-xl border hairline bg-white">
                    {groupedByFloor.map(([floor, props]) => (
                        <div key={floor} className="border-b hairline last:border-b-0">
                            <div className="px-4 py-2 bg-stone-50 text-xs font-medium text-slate-700">
                                {floorLabel(floor)} ({props.length})
                            </div>
                            <div className="divide-y hairline">
                                {props.map((p) => (
                                    <label
                                        key={p.id}
                                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                                        data-testid={`quote-wizard-prop-${p.id}`}
                                    >
                                        <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                                        <div className="flex-1 grid grid-cols-4 gap-2 items-center text-sm">
                                            <div className="font-medium text-slate-900">{p.code}</div>
                                            <div className="text-slate-500">{p.area_total ? `${p.area_total} м²` : "—"}</div>
                                            <div className="text-slate-700">{currency(p.list_price || 0)}</div>
                                            <div className="text-xs text-emerald-700">Свободен</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    {groupedByFloor.length === 0 && (
                        <div className="p-8 text-center text-sm text-slate-500">Няма свободни имоти.</div>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-2 sticky bottom-4">
                <Link to="/admin/quotes">
                    <Button variant="outline">Отказ</Button>
                </Link>
                <Button
                    onClick={submit}
                    disabled={creating || selected.size === 0 || !clientId}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    data-testid="quote-wizard-submit"
                >
                    {creating ? "Създаване…" : "Продължи →"}
                </Button>
            </div>
        </div>
    );
}

// =====================================================
// STEP 2 — Edit existing quote
// =====================================================
function EditQuoteScreen({ id }) {
    const navigate = useNavigate();
    const isSuperAdmin = useIsSuperAdmin();
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [convertingToSale, setConvertingToSale] = useState(false);

    const load = () => {
        setLoading(true);
        api.get(`/quotes/${id}`).then((r) => setQuote(r.data)).finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

    const previewTotals = useMemo(() => {
        if (!quote) return { subtotal: 0, vat: 0, total: 0 };
        const subtotal = (quote.items || []).reduce((s, it) => {
            const p = parseFloat(it.custom_price || 0);
            const d = parseFloat(it.discount_percent || 0);
            return s + p * (1 - d / 100);
        }, 0);
        const discount = parseFloat(quote.discount_amount || 0);
        const base = Math.max(subtotal - discount, 0);
        const vat = quote.vat_mode === "with_vat" ? base * (parseFloat(quote.vat_rate || 20) / 100) : 0;
        const total = base + vat;
        return { subtotal, vat, total };
    }, [quote]);

    if (loading) return <div className="text-sm text-slate-500">Зареждане…</div>;
    if (!quote) return <div className="text-sm text-slate-500">Офертата не е намерена.</div>;

    const isDraft = quote.status === "draft";
    const editable = isDraft;

    const updateItem = (idx, patch) => {
        setQuote((q) => {
            const items = [...q.items];
            items[idx] = { ...items[idx], ...patch };
            return { ...q, items };
        });
    };
    const removeItem = (idx) => {
        setQuote((q) => ({ ...q, items: q.items.filter((_, i) => i !== idx) }));
    };

    const save = async () => {
        if (!editable) return;
        setSaving(true);
        try {
            const sched = quote.payment_schedule || {};
            const payload = {
                items: (quote.items || []).map((it) => ({
                    property_id: it.property_id,
                    custom_price: parseFloat(it.custom_price || 0),
                    discount_percent: parseFloat(it.discount_percent || 0),
                    notes: it.notes || null,
                })),
                vat_mode: quote.vat_mode,
                vat_rate: parseFloat(quote.vat_rate || 20),
                discount_amount: parseFloat(quote.discount_amount || 0),
                valid_until: quote.valid_until,
                payment_terms: quote.payment_terms,
                delivery_terms: quote.delivery_terms,
                additional_notes: quote.additional_notes,
                payment_schedule: {
                    scheme_type: sched.scheme_type || "standard",
                    stop_deposit_amount: parseFloat(sched.stop_deposit_amount || 0),
                    expected_act_2_date: sched.expected_act_2_date || null,
                    notes: sched.notes || null,
                    stages: (sched.stages || []).map((s, idx) => ({
                        order: s.order ?? idx + 1,
                        label: s.label || "",
                        percent: parseFloat(s.percent || 0),
                        amount: s.amount != null ? parseFloat(s.amount) : null,
                        expected_date: s.expected_date || null,
                        milestone_type: s.milestone_type || null,
                        description: s.description || null,
                        is_deposit: !!s.is_deposit,
                    })),
                },
            };
            const { data } = await api.put(`/quotes/${id}`, payload);
            setQuote(data);
            toast.success("Офертата е запазена");
            return data;
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const downloadPdf = async () => {
        try {
            const r = await api.get(`/quotes/${id}/pdf`, { responseType: "blob" });
            const blob = new Blob([r.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `oferta-${quote.quote_number}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("PDF свален");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };
    const saveAndPdf = async () => {
        try { await save(); } catch { return; }
        await downloadPdf();
    };

    const setStatus = async (newStatus) => {
        try {
            const { data } = await api.patch(`/quotes/${id}/status`, { status: newStatus });
            setQuote(data);
            toast.success(`Статусът е променен на „${QUOTE_STATUS_LABELS[newStatus]}"`);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const doDelete = async () => {
        try {
            await api.delete(`/quotes/${id}`);
            toast.success("Офертата е изтрита");
            navigate("/admin/quotes");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const convertToSale = async () => {
        if (!quote || quote.status !== "accepted") return;
        setConvertingToSale(true);
        let success = 0;
        let failed = 0;
        try {
            for (const it of quote.items || []) {
                try {
                    // Mark property sold (auto-creates Sale via backend hook)
                    await api.patch(`/properties/${it.property_id}/status`, { status: "sold" });
                    // Find created sale and update with custom_price + source_quote_id
                    const r = await api.get(`/sales/by-property/${it.property_id}`);
                    const sale = r.data;
                    if (sale && it.custom_price) {
                        await api.put(`/sales/${sale.id}`, {
                            invoice_amount: parseFloat(it.custom_price),
                            proforma_amount: 0,
                            vat_rate: 20,
                            notes: `Преобразувано от оферта ${quote.quote_number}`,
                        });
                    }
                    success += 1;
                } catch {
                    failed += 1;
                }
            }
            if (success > 0) toast.success(`${success} имот${success === 1 ? "" : "а"} преобразуван${success === 1 ? "" : "и"} в продажба`);
            if (failed > 0) toast.error(`${failed} имот${failed === 1 ? "" : "а"} не успяха да се преобразуват`);
        } finally {
            setConvertingToSale(false);
            setConfirmAction(null);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-24">
            <Link to="/admin/quotes" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" /> Назад към списъка
            </Link>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="overline mb-2">Оферта</div>
                    <h1 className="font-serif text-4xl text-slate-900">{quote.quote_number}</h1>
                    <div className="flex items-center gap-3 mt-2">
                        <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${QUOTE_STATUS_BADGE[quote.status]}`} data-testid="quote-status-badge">
                            {QUOTE_STATUS_LABELS[quote.status]}
                        </span>
                        <span className="text-sm text-slate-500">Клиент: <span className="font-medium text-slate-900">{quote.client_name}</span></span>
                        <span className="text-sm text-slate-500">Създадена: {formatDate(quote.created_at)}</span>
                    </div>
                </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
                <h2 className="font-serif text-xl text-slate-900">Обекти</h2>
                {(quote.items || []).map((it, idx) => (
                    <div key={it.property_id} className="rounded-lg border hairline bg-white p-4" data-testid={`quote-item-${idx}`}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="font-medium text-slate-900">{it.property_code} · {it.property_label}</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    F1: {it.f1_area || "—"} м² · F1+F2: {it.total_area || it.f2_area || "—"} м² · Листова: {currency(it.list_price)}
                                </div>
                            </div>
                            {editable && (
                                <Button size="sm" variant="outline" onClick={() => removeItem(idx)} title="Премахни от офертата" data-testid={`quote-item-remove-${idx}`}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                            <div>
                                <Label>Цена (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={it.custom_price ?? ""}
                                    disabled={!editable}
                                    onChange={(e) => updateItem(idx, { custom_price: e.target.value })}
                                    data-testid={`quote-item-price-${idx}`}
                                />
                            </div>
                            <div>
                                <Label>Отстъпка (%)</Label>
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    value={it.discount_percent ?? 0}
                                    disabled={!editable}
                                    onChange={(e) => updateItem(idx, { discount_percent: e.target.value })}
                                    data-testid={`quote-item-discount-${idx}`}
                                />
                            </div>
                            <div>
                                <Label>Бележки</Label>
                                <Input
                                    value={it.notes || ""}
                                    disabled={!editable}
                                    onChange={(e) => updateItem(idx, { notes: e.target.value })}
                                    placeholder="—"
                                    data-testid={`quote-item-notes-${idx}`}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {(quote.items || []).length === 0 && (
                    <div className="rounded-lg border hairline bg-white p-6 text-sm text-slate-500 text-center">
                        Няма обекти. Тази оферта не може да се изпрати.
                    </div>
                )}
            </div>

            {/* Financial */}
            <div className="space-y-3">
                <h2 className="font-serif text-xl text-slate-900">Финансово</h2>
                <div className="rounded-lg border hairline bg-white p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <Label>ДДС режим</Label>
                            <Select
                                value={quote.vat_mode}
                                onValueChange={(v) => setQuote((q) => ({ ...q, vat_mode: v }))}
                                disabled={!editable}
                            >
                                <SelectTrigger data-testid="quote-vat-mode"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="with_vat">С ДДС</SelectItem>
                                    <SelectItem value="without_vat">Без ДДС</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>ДДС ставка (%)</Label>
                            <Input
                                type="number"
                                step="1"
                                value={quote.vat_rate ?? 20}
                                disabled={!editable}
                                onChange={(e) => setQuote((q) => ({ ...q, vat_rate: e.target.value }))}
                                data-testid="quote-vat-rate"
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Допълнителна обща отстъпка (€)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={quote.discount_amount ?? 0}
                            disabled={!editable}
                            onChange={(e) => setQuote((q) => ({ ...q, discount_amount: e.target.value }))}
                            data-testid="quote-discount"
                        />
                    </div>

                    <div className="border-t hairline pt-3 space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Subtotal:</span>
                            <span className="font-medium" data-testid="quote-subtotal">{currency(previewTotals.subtotal)}</span>
                        </div>
                        {quote.vat_mode === "with_vat" && (
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">ДДС ({quote.vat_rate || 20}%):</span>
                                <span>{currency(previewTotals.vat)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-base pt-1 border-t hairline">
                            <span className="font-serif text-slate-900">Общо за плащане:</span>
                            <span className="font-medium text-slate-900" data-testid="quote-total">{currency(previewTotals.total)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment schedule */}
            <PaymentScheduleSection quote={quote} setQuote={setQuote} editable={editable} onResetTo={async (type) => {
                try {
                    const { data } = await api.put(`/quotes/${id}`, { reset_schedule_to: type });
                    setQuote(data);
                    toast.success("Схемата е презаредена");
                } catch (e) {
                    toast.error(formatApiError(e.response?.data?.detail));
                }
            }} />

            {/* Validity */}
            <div className="space-y-3">
                <h2 className="font-serif text-xl text-slate-900">Валидност</h2>
                <div className="rounded-lg border hairline bg-white p-4">
                    <Label>Валидна до</Label>
                    <Input
                        type="date"
                        value={(quote.valid_until || "").substring(0, 10)}
                        disabled={!editable}
                        onChange={(e) => setQuote((q) => ({ ...q, valid_until: e.target.value }))}
                        data-testid="quote-valid-until"
                    />
                </div>
            </div>

            {/* Terms */}
            <div className="space-y-3">
                <h2 className="font-serif text-xl text-slate-900">Условия</h2>
                <div className="rounded-lg border hairline bg-white p-4 space-y-3">
                    <div>
                        <Label>Условия на плащане</Label>
                        <Textarea
                            rows={5}
                            value={quote.payment_terms || ""}
                            disabled={!editable}
                            onChange={(e) => setQuote((q) => ({ ...q, payment_terms: e.target.value }))}
                            data-testid="quote-payment-terms"
                        />
                    </div>
                    <div>
                        <Label>Срок и предаване</Label>
                        <Textarea
                            rows={4}
                            value={quote.delivery_terms || ""}
                            disabled={!editable}
                            onChange={(e) => setQuote((q) => ({ ...q, delivery_terms: e.target.value }))}
                            data-testid="quote-delivery-terms"
                        />
                    </div>
                    <div>
                        <Label>Допълнителни бележки</Label>
                        <Textarea
                            rows={3}
                            value={quote.additional_notes || ""}
                            disabled={!editable}
                            onChange={(e) => setQuote((q) => ({ ...q, additional_notes: e.target.value }))}
                            data-testid="quote-additional-notes"
                        />
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap gap-2 justify-end sticky bottom-4 bg-white/90 backdrop-blur p-3 rounded-lg border hairline">
                {editable && (
                    <Button
                        variant="outline"
                        onClick={() => setConfirmAction({ type: "delete" })}
                        data-testid="quote-delete-btn"
                    >
                        <Trash2 className="h-4 w-4 mr-1.5" /> Изтрий
                    </Button>
                )}
                <Button variant="outline" onClick={downloadPdf} data-testid="quote-pdf-btn">
                    <Download className="h-4 w-4 mr-1.5" /> PDF
                </Button>
                {editable && (
                    <>
                        <Button onClick={save} disabled={saving} data-testid="quote-save-btn" className="bg-slate-900 text-white hover:bg-slate-800">
                            <Save className="h-4 w-4 mr-1.5" /> {saving ? "Запис…" : "Запази"}
                        </Button>
                        <Button onClick={saveAndPdf} disabled={saving} data-testid="quote-save-pdf-btn" className="bg-emerald-700 text-white hover:bg-emerald-800">
                            <Download className="h-4 w-4 mr-1.5" /> Запази + PDF
                        </Button>
                        <Button
                            onClick={() => setConfirmAction({ type: "send" })}
                            data-testid="quote-send-btn"
                            className="bg-sky-700 text-white hover:bg-sky-800"
                        >
                            <Send className="h-4 w-4 mr-1.5" /> Маркирай като изпратена
                        </Button>
                    </>
                )}
                {quote.status === "sent" && (
                    <>
                        <Button
                            onClick={() => setConfirmAction({ type: "accept" })}
                            className="bg-emerald-700 text-white hover:bg-emerald-800"
                            data-testid="quote-accept-btn"
                        >
                            Маркирай като приета
                        </Button>
                        <Button
                            onClick={() => setConfirmAction({ type: "reject" })}
                            variant="outline"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                            data-testid="quote-reject-btn"
                        >
                            Маркирай като отказана
                        </Button>
                        <Button
                            onClick={() => setConfirmAction({ type: "expire" })}
                            variant="outline"
                            data-testid="quote-expire-btn"
                        >
                            Маркирай като изтекла
                        </Button>
                    </>
                )}
                {quote.status === "accepted" && isSuperAdmin && (
                    <Button
                        onClick={() => setConfirmAction({ type: "convert_to_sale" })}
                        disabled={convertingToSale}
                        className="bg-amber-700 hover:bg-amber-800 text-white"
                        data-testid="quote-convert-to-sale-btn"
                    >
                        <Lock className="h-4 w-4 mr-1.5" />
                        {convertingToSale ? "Преобразуване…" : "Преобразувай в Sale"}
                    </Button>
                )}
            </div>

            {/* Confirm dialog */}
            <Dialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            {confirmAction?.type === "delete" && "Изтриване"}
                            {confirmAction?.type === "send" && "Маркирай като изпратена"}
                            {confirmAction?.type === "accept" && "Маркирай като приета"}
                            {confirmAction?.type === "reject" && "Маркирай като отказана"}
                            {confirmAction?.type === "expire" && "Маркирай като изтекла"}
                            {confirmAction?.type === "convert_to_sale" && "Преобразуване в продажба"}
                        </DialogTitle>
                        <DialogDescription>
                            {confirmAction?.type === "delete" && `Сигурни ли сте, че искате да изтриете оферта ${quote.quote_number}? Това действие е необратимо.`}
                            {confirmAction?.type === "send" && "След маркиране като изпратена, офертата ще стане непроменяема. Продължавате ли?"}
                            {confirmAction?.type === "accept" && "Офертата ще стане финална. Продължавате ли?"}
                            {confirmAction?.type === "reject" && "Офертата ще се запази с маркер „отказана\". Продължавате ли?"}
                            {confirmAction?.type === "expire" && "Офертата ще се маркира като изтекла."}
                            {confirmAction?.type === "convert_to_sale" && "Това действие ще: маркира всички имоти като продадени и ще създаде Sale запис(и) с цените от офертата (100% по фактура default). Можете после да промените разпределението фактура/проформа в /admin/properties."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmAction(null)}>Отказ</Button>
                        <Button
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            onClick={async () => {
                                const t = confirmAction.type;
                                setConfirmAction(null);
                                if (t === "delete") await doDelete();
                                if (t === "send") await setStatus("sent");
                                if (t === "accept") await setStatus("accepted");
                                if (t === "reject") await setStatus("rejected");
                                if (t === "expire") await setStatus("expired");
                                if (t === "convert_to_sale") await convertToSale();
                            }}
                            data-testid="quote-confirm-action-ok"
                        >
                            Потвърди
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


// =====================================================
// Payment Schedule Editor (inline section)
// =====================================================
const SCHEME_LABELS = {
    standard: "Стандартна (без банка) — 8 етапа",
    with_bank: "С банков кредит — 4 етапа",
    custom: "Custom (ръчно)",
};

function PaymentScheduleSection({ quote, setQuote, editable, onResetTo }) {
    const sched = quote.payment_schedule || { scheme_type: "custom", stages: [], stop_deposit_amount: 0 };
    const [resetDialog, setResetDialog] = React.useState(null);

    const setSched = (patch) => {
        setQuote((q) => ({ ...q, payment_schedule: { ...(q.payment_schedule || {}), ...patch } }));
    };
    const updateStage = (idx, patch) => {
        setQuote((q) => {
            const stages = [...(q.payment_schedule?.stages || [])];
            stages[idx] = { ...stages[idx], ...patch };
            return { ...q, payment_schedule: { ...(q.payment_schedule || {}), stages } };
        });
    };
    const removeStage = (idx) => {
        setQuote((q) => {
            const stages = (q.payment_schedule?.stages || []).filter((_, i) => i !== idx);
            return { ...q, payment_schedule: { ...(q.payment_schedule || {}), stages } };
        });
    };
    const addStage = () => {
        setQuote((q) => {
            const cur = q.payment_schedule?.stages || [];
            return {
                ...q,
                payment_schedule: {
                    ...(q.payment_schedule || {}),
                    stages: [
                        ...cur,
                        { order: cur.length + 1, label: "Нов етап", percent: 0, amount: 0, expected_date: null, description: "", is_deposit: false },
                    ],
                },
            };
        });
    };

    const total = parseFloat(quote.total || 0);
    const stages = sched.stages || [];
    const sumPercent = stages.reduce((s, st) => s + parseFloat(st.percent || 0), 0);
    const sumAmount = stages.reduce((s, st) => s + parseFloat(st.amount || 0), 0);
    const stop = parseFloat(sched.stop_deposit_amount || 0);

    return (
        <div className="space-y-3">
            <h2 className="font-serif text-xl text-slate-900">Схема за плащане</h2>
            <div className="rounded-lg border hairline bg-white p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <Label>Тип схема</Label>
                        <Select
                            value={sched.scheme_type || "standard"}
                            disabled={!editable}
                            onValueChange={(v) => {
                                if (!editable) return;
                                setResetDialog(v);
                            }}
                        >
                            <SelectTrigger data-testid="quote-scheme-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(SCHEME_LABELS).map(([k, l]) => (
                                    <SelectItem key={k} value={k}>{l}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Стоп-капаро (€)</Label>
                        <Input
                            type="number"
                            step="100"
                            min="0"
                            value={sched.stop_deposit_amount ?? 0}
                            disabled={!editable}
                            onChange={(e) => setSched({ stop_deposit_amount: e.target.value })}
                            data-testid="quote-stop-deposit"
                        />
                    </div>
                    <div>
                        <Label>Дата на Акт 2</Label>
                        <Input
                            type="date"
                            value={(sched.expected_act_2_date || "").substring(0, 10)}
                            disabled={!editable}
                            onChange={(e) => setSched({ expected_act_2_date: e.target.value })}
                            data-testid="quote-act2-date"
                        />
                    </div>
                </div>

                <div className="rounded-md border hairline overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="text-left p-2 font-medium w-10">#</th>
                                <th className="text-left p-2 font-medium">Етап</th>
                                <th className="text-right p-2 font-medium w-20">%</th>
                                <th className="text-right p-2 font-medium w-32">Сума</th>
                                <th className="text-left p-2 font-medium w-44">Очаквана дата</th>
                                {editable && <th className="w-10"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {stages.map((st, idx) => (
                                <tr key={idx} className="border-t hairline" data-testid={`quote-stage-${idx}`}>
                                    <td className="p-2 text-slate-500">{st.order || idx + 1}</td>
                                    <td className="p-2">
                                        <Input
                                            value={st.label || ""}
                                            disabled={!editable}
                                            onChange={(e) => updateStage(idx, { label: e.target.value })}
                                            className="h-8 text-sm"
                                            data-testid={`quote-stage-label-${idx}`}
                                        />
                                        <Input
                                            value={st.description || ""}
                                            disabled={!editable}
                                            onChange={(e) => updateStage(idx, { description: e.target.value })}
                                            placeholder="описание (по желание)"
                                            className="h-7 text-xs mt-1 text-slate-500"
                                        />
                                    </td>
                                    <td className="p-2 text-right">
                                        <Input
                                            type="number"
                                            step="0.5"
                                            value={st.percent ?? 0}
                                            disabled={!editable}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value || 0);
                                                updateStage(idx, { percent: v, amount: Math.round(total * v / 100 * 100) / 100 });
                                            }}
                                            className="h-8 text-sm text-right"
                                            data-testid={`quote-stage-percent-${idx}`}
                                        />
                                    </td>
                                    <td className="p-2 text-right">
                                        <span className="text-slate-700 font-medium" data-testid={`quote-stage-amount-${idx}`}>
                                            {currency(st.amount || 0)}
                                        </span>
                                    </td>
                                    <td className="p-2">
                                        <Input
                                            type="date"
                                            value={(st.expected_date || "").substring(0, 10)}
                                            disabled={!editable}
                                            onChange={(e) => updateStage(idx, { expected_date: e.target.value })}
                                            className="h-8 text-sm"
                                            data-testid={`quote-stage-date-${idx}`}
                                        />
                                    </td>
                                    {editable && (
                                        <td className="p-2 text-right">
                                            <Button size="sm" variant="outline" onClick={() => removeStage(idx)} title="Премахни" data-testid={`quote-stage-remove-${idx}`}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {stages.length === 0 && (
                                <tr><td colSpan={editable ? 6 : 5} className="p-4 text-center text-sm text-slate-500">Няма етапи. Добавете нов или сменете типа на схемата.</td></tr>
                            )}
                        </tbody>
                        <tfoot className="bg-stone-50">
                            <tr className="border-t hairline">
                                <td colSpan={2} className="p-2 font-medium text-slate-700">ОБЩО</td>
                                <td className={`p-2 text-right font-medium ${Math.abs(sumPercent - 100) > 0.01 ? "text-amber-700" : "text-slate-900"}`} data-testid="quote-stages-percent-total">
                                    {sumPercent.toFixed(0)}%
                                </td>
                                <td className="p-2 text-right font-medium" data-testid="quote-stages-amount-total">{currency(sumAmount)}</td>
                                <td colSpan={editable ? 2 : 1} className="p-2 text-xs text-slate-500">
                                    {stop > 0 && <>− {currency(stop)} стоп-капаро</>}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {Math.abs(sumPercent - 100) > 0.01 && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        ⚠ Сумата на процентите е {sumPercent.toFixed(0)}%, не 100%. Намести вноските преди да изпратиш офертата.
                    </div>
                )}

                {editable && (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={addStage} data-testid="quote-stage-add">
                            <Plus className="h-3.5 w-3.5 mr-1" /> Добави етап
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setResetDialog(sched.scheme_type || "standard")}
                            data-testid="quote-stage-reset"
                        >
                            ↻ Reset към default
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={!!resetDialog} onOpenChange={(o) => !o && setResetDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Презареждане на схемата</DialogTitle>
                        <DialogDescription>
                            Това ще премахне всички ръчни промени и ще генерира нова схема от тип „{SCHEME_LABELS[resetDialog]}". Продължавате ли?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetDialog(null)}>Отказ</Button>
                        <Button
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            onClick={async () => {
                                const t = resetDialog;
                                setResetDialog(null);
                                await onResetTo(t);
                            }}
                            data-testid="quote-reset-confirm"
                        >
                            Презареди
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
