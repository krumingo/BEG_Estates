import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft, AlertTriangle, Save, RefreshCw, CheckCircle2,
    XCircle, Plus, X, Lock, FileText, Trash2,
} from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import {
    DEAL_STATUS_LABELS, DEAL_STATUS_BADGE, PAYMENT_MODE_LABELS,
    calculateVatSplit, sumStagesAmount, sumStagesPercent, sumPaidAmount,
    validatePaymentMode, validateScheduleSum, bucketBasis, isBucketVisible,
    round2,
} from "../../lib/deal-helpers";
import { floorLabel, floorKote, PROPERTY_TYPE_LABELS } from "../../lib/constants";

export default function DealEditor() {
    const { id } = useParams();
    if (!id || id === "new") return <NewDealWizard />;
    return <DealEditorMain id={id} />;
}

// =====================================================
// NEW DEAL WIZARD
// =====================================================
function NewDealWizard() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [clients, setClients] = useState([]);
    const [clientId, setClientId] = useState("");
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [properties, setProperties] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [agreedPrices, setAgreedPrices] = useState({});
    const [paymentMode, setPaymentMode] = useState("without_bank");
    const [autoSchedule, setAutoSchedule] = useState(true);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        api.get("/clients", { params: { active: "true" } }).then((r) => setClients(r.data || []));
        api.get("/projects").then((r) => {
            setProjects(r.data || []);
            const primary = (r.data || []).find((p) => p.is_primary) || (r.data || [])[0];
            if (primary) setProjectId(primary.id);
        });
    }, []);

    useEffect(() => {
        if (!projectId) return;
        api.get(`/projects/${projectId}/properties`, { params: { status: "available" } })
            .then((r) => setProperties((r.data || []).filter((p) => p.status === "available")));
    }, [projectId]);

    const groupedByFloor = useMemo(() => {
        const groups = {};
        properties.forEach((p) => {
            const k = String(p.floor);
            if (!groups[k]) groups[k] = [];
            groups[k].push(p);
        });
        return Object.keys(groups)
            .sort((a, b) => Number(b) - Number(a))
            .map((k) => ({ floor: Number(k), units: groups[k].sort((a, b) => String(a.code).localeCompare(String(b.code), "bg")) }));
    }, [properties]);

    const selectedProps = useMemo(
        () => properties.filter((p) => selected.has(p.id)),
        [properties, selected],
    );

    const toggleSelect = (id) => {
        setSelected((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const goStep2 = () => {
        if (!clientId) return toast.error("Изберете клиент");
        if (selected.size === 0) return toast.error("Изберете поне един имот");
        // Initialize agreed prices to listprice
        const init = {};
        selectedProps.forEach((p) => { init[p.id] = Number(p.list_price || 0); });
        setAgreedPrices(init);
        setStep(2);
    };

    const totalWithVat = useMemo(
        () => round2(Object.values(agreedPrices).reduce((acc, v) => acc + (Number(v) || 0), 0)),
        [agreedPrices],
    );

    const create = async () => {
        setCreating(true);
        try {
            const payload = {
                client_id: clientId,
                property_ids: Array.from(selected),
                agreed_prices: agreedPrices,
                payment_mode: paymentMode,
            };
            const { data: deal } = await api.post("/deals", payload);
            // Auto-generate schedule if requested
            if (autoSchedule) {
                const preset = paymentMode === "with_bank" ? "with_bank" : "standard";
                const bucket = paymentMode === "combined" ? "both" : (paymentMode === "with_bank" ? "bank" : "non_bank");
                try {
                    await api.post(`/deals/${deal.id}/regenerate-schedule`, { bucket, preset });
                } catch (e) {
                    toast.error("Сделката е създадена, но schedule авто-генерирането не успя");
                }
            }
            toast.success(`Сделка ${deal.deal_number} създадена`);
            navigate(`/admin/deals/${deal.id}`);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при създаване");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-24" data-testid="deal-wizard">
            <Link to="/admin/deals" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" /> Назад към списъка
            </Link>
            <div>
                <div className="overline mb-2">Нова сделка · Стъпка {step} от 2</div>
                <h1 className="font-serif text-4xl text-slate-900">
                    {step === 1 ? "Клиент и имоти" : "Цени и плащане"}
                </h1>
            </div>

            {step === 1 && (
                <div className="space-y-6" data-testid="wizard-step-1">
                    <div className="rounded-lg border hairline bg-white p-5 space-y-3">
                        <Label>Клиент <span className="text-red-600">*</span></Label>
                        <Select value={clientId} onValueChange={setClientId}>
                            <SelectTrigger data-testid="wizard-client"><SelectValue placeholder="Изберете клиент" /></SelectTrigger>
                            <SelectContent>
                                {clients.filter((c) => c && c.id).map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}{c.email ? ` · ${c.email}` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-lg border hairline bg-white p-5 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Label>Изберете имоти <span className="text-red-600">*</span></Label>
                            <Select value={projectId} onValueChange={setProjectId}>
                                <SelectTrigger className="w-64" data-testid="wizard-project"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {projects.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="text-xs text-slate-500">Само свободни имоти. Избрани: <strong>{selected.size}</strong></div>
                        <div className="border hairline rounded-md max-h-[400px] overflow-y-auto" data-testid="wizard-properties">
                            {groupedByFloor.length === 0 && (
                                <div className="p-4 text-sm text-slate-500">Няма свободни имоти в този проект.</div>
                            )}
                            {groupedByFloor.map((g) => (
                                <div key={g.floor}>
                                    <div className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium flex justify-between">
                                        <span>{floorLabel(g.floor)} ({floorKote(g.floor)})</span>
                                        <span className="opacity-70">{g.units.length} имот{g.units.length === 1 ? "" : "а"}</span>
                                    </div>
                                    {g.units.map((p) => (
                                        <label
                                            key={p.id}
                                            className={`flex items-center gap-3 px-3 py-2 border-b hairline cursor-pointer hover:bg-stone-50 text-sm ${
                                                selected.has(p.id) ? "bg-emerald-50/60" : ""
                                            }`}
                                            data-testid={`wizard-prop-${p.code}`}
                                        >
                                            <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                                            <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                                <span className="col-span-2 font-mono">{p.code}</span>
                                                <span className="col-span-3 text-slate-600 truncate">{PROPERTY_TYPE_LABELS[p.property_type]}</span>
                                                <span className="col-span-2 text-right text-slate-600">{p.raw_area ? `${p.raw_area} м²` : "—"}</span>
                                                <span className="col-span-2 text-slate-500">{p.exposure || "—"}</span>
                                                <span className="col-span-3 text-right font-medium">{currency(p.list_price)}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={goStep2} className="bg-slate-900 text-white hover:bg-slate-800" data-testid="wizard-next">
                            Продължи →
                        </Button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6" data-testid="wizard-step-2">
                    <div className="rounded-lg border hairline bg-white p-5 space-y-4">
                        <div className="text-sm font-semibold">Договорени цени</div>
                        <table className="w-full text-sm">
                            <thead className="text-slate-500 border-b hairline">
                                <tr>
                                    <th className="text-left py-2 font-medium">Код</th>
                                    <th className="text-right py-2 font-medium">Площ</th>
                                    <th className="text-right py-2 font-medium">Листова</th>
                                    <th className="text-right py-2 font-medium">Договорена (с ДДС)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedProps.map((p) => (
                                    <tr key={p.id} className="border-b hairline">
                                        <td className="py-2 font-mono">{p.code}</td>
                                        <td className="py-2 text-right text-slate-600">{p.raw_area || "—"} м²</td>
                                        <td className="py-2 text-right text-slate-600">{currency(p.list_price)}</td>
                                        <td className="py-2 text-right">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="w-32 text-right ml-auto"
                                                value={agreedPrices[p.id] ?? ""}
                                                onChange={(e) => setAgreedPrices((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                                                data-testid={`wizard-price-${p.code}`}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                <tr className="font-semibold">
                                    <td colSpan={3} className="py-3 text-right">ОБЩО (с ДДС):</td>
                                    <td className="py-3 text-right" data-testid="wizard-total">{currency(totalWithVat)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="rounded-lg border hairline bg-white p-5 space-y-3">
                        <div className="text-sm font-semibold">Тип плащане</div>
                        <div className="flex gap-6 text-sm">
                            {Object.entries(PAYMENT_MODE_LABELS).map(([v, label]) => (
                                <label key={v} className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="payment_mode"
                                        value={v}
                                        checked={paymentMode === v}
                                        onChange={() => setPaymentMode(v)}
                                        data-testid={`wizard-pm-${v}`}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm pt-3">
                            <Checkbox checked={autoSchedule} onCheckedChange={(v) => setAutoSchedule(!!v)} data-testid="wizard-auto-schedule" />
                            <span>Auto-генерирай schedule (8 етапа за без банка / 4 за с банка)</span>
                        </label>
                    </div>

                    <div className="flex justify-between">
                        <Button variant="outline" onClick={() => setStep(1)} data-testid="wizard-back">← Назад</Button>
                        <Button
                            onClick={create}
                            disabled={creating}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            data-testid="wizard-create"
                        >
                            {creating ? "Създаване…" : "Създай сделка"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// =====================================================
// MAIN DEAL EDITOR
// =====================================================
function DealEditorMain({ id }) {
    const navigate = useNavigate();
    const [deal, setDeal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [paymentDialog, setPaymentDialog] = useState(null);

    const reload = async () => {
        try {
            const { data } = await api.get(`/deals/${id}`);
            setDeal(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Сделката не е намерена");
            navigate("/admin/deals");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

    const updateField = (path, value) => {
        setDeal((prev) => {
            const next = { ...prev };
            const parts = path.split(".");
            let cur = next;
            for (let i = 0; i < parts.length - 1; i++) {
                cur[parts[i]] = { ...(cur[parts[i]] || {}) };
                cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = value;
            return next;
        });
    };

    const updateItemPrice = (propertyId, value) => {
        setDeal((prev) => {
            const next = { ...prev };
            next.items = (prev.items || []).map((it) =>
                it.property_id === propertyId ? { ...it, agreed_price: Number(value) || 0 } : it,
            );
            // Recompute totals client-side for instant feedback
            const total = round2(next.items.reduce((acc, i) => acc + (Number(i.agreed_price) || 0), 0));
            const split = calculateVatSplit(total, next.vat_rate || 20);
            next.total_with_vat = total;
            next.total_without_vat = split.net;
            next.vat_amount = split.vat;
            return next;
        });
    };

    const updateStage = (bucket, idx, field, value) => {
        const key = bucket === "bank" ? "bank_stages" : "non_bank_stages";
        setDeal((prev) => {
            const stages = [...(prev[key] || [])];
            stages[idx] = { ...stages[idx], [field]: field === "percent" || field === "amount" ? Number(value) || 0 : value };
            // If percent changed, recompute amount
            if (field === "percent") {
                const basis = bucketBasis(prev, bucket);
                stages[idx].amount = round2(basis * stages[idx].percent / 100);
            }
            return { ...prev, [key]: stages };
        });
    };

    const addStage = (bucket) => {
        const key = bucket === "bank" ? "bank_stages" : "non_bank_stages";
        setDeal((prev) => {
            const stages = [...(prev[key] || [])];
            const nextOrder = stages.length === 0 ? 1 : Math.max(...stages.map((s) => s.order || 0)) + 1;
            stages.push({
                order: nextOrder,
                label: "",
                percent: 0,
                amount: 0,
                expected_date: null,
                milestone_type: null,
                bucket,
                is_paid: false,
                paid_date: null,
                paid_amount: null,
                payment_notes: null,
            });
            return { ...prev, [key]: stages };
        });
    };

    const removeStage = (bucket, idx) => {
        const key = bucket === "bank" ? "bank_stages" : "non_bank_stages";
        setDeal((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter((_, i) => i !== idx),
        }));
    };

    const save = async () => {
        if (!deal) return;
        // Validate payment mode
        const v = validatePaymentMode(deal.payment_mode?.mode, deal.total_with_vat, deal.payment_mode || {});
        if (!v.valid) {
            v.errors.forEach((e) => toast.error(e));
            return;
        }
        setSaving(true);
        try {
            const payload = {
                items: (deal.items || []).map((it) => ({
                    property_id: it.property_id,
                    agreed_price: it.agreed_price,
                    notes: it.notes,
                })),
                payment_mode: deal.payment_mode,
                bank_stages: (deal.bank_stages || []).map((s) => sanitizeStage(s, "bank")),
                non_bank_stages: (deal.non_bank_stages || []).map((s) => sanitizeStage(s, "non_bank")),
                vat_rate: deal.vat_rate,
                notes: deal.notes,
            };
            const { data } = await api.put(`/deals/${id}`, payload);
            setDeal(data);
            toast.success("Сделката е запазена");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при запис");
        } finally {
            setSaving(false);
        }
    };

    const regenerateSchedule = async (bucket, preset) => {
        try {
            const { data } = await api.post(`/deals/${id}/regenerate-schedule`, { bucket, preset });
            setDeal(data);
            toast.success("Schedule re-генериран");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при регенериране");
        }
    };

    const togglePayment = async (bucket, stage) => {
        if (stage.is_paid) {
            // Unmark — confirm
            if (!window.confirm(`Размаркирай етап #${stage.order} (${stage.label}) като платен? Ще се загуби датата и сумата.`)) return;
            try {
                const { data } = await api.patch(`/deals/${id}/stages/${stage.order}/payment`, {
                    bucket,
                    is_paid: false,
                    paid_date: null,
                    paid_amount: null,
                    payment_notes: null,
                });
                setDeal(data);
                toast.success("Размаркирано");
            } catch (e) {
                toast.error(formatApiError(e.response?.data?.detail));
            }
        } else {
            setPaymentDialog({ bucket, stage });
        }
    };

    const confirmPayment = async (paid_date, paid_amount, payment_notes) => {
        if (!paymentDialog) return;
        const { bucket, stage } = paymentDialog;
        try {
            const { data } = await api.patch(`/deals/${id}/stages/${stage.order}/payment`, {
                bucket,
                is_paid: true,
                paid_date,
                paid_amount: Number(paid_amount) || stage.amount,
                payment_notes: payment_notes || null,
            });
            setDeal(data);
            setPaymentDialog(null);
            toast.success(`Етап #${stage.order} маркиран като платен`);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const doCancel = async () => {
        if (!cancelReason.trim()) {
            toast.error("Моля въведете причина");
            return;
        }
        try {
            const { data } = await api.post(`/deals/${id}/cancel`, { reason: cancelReason });
            setDeal(data);
            setConfirmAction(null);
            setCancelReason("");
            toast.success("Сделката е отказана. Имотите са освободени.");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    if (loading) return <div className="text-sm text-slate-500" data-testid="deal-editor-loading">Зареждане…</div>;
    if (!deal) return null;

    const isCancelled = deal.status === "cancelled";
    const allStages = [...(deal.bank_stages || []), ...(deal.non_bank_stages || [])];
    const paidTotal = sumPaidAmount(allStages);
    const expectedTotal = round2(Number(deal.total_with_vat) - paidTotal);
    const paidPct = deal.total_with_vat > 0 ? (paidTotal / deal.total_with_vat) * 100 : 0;

    const listpriceTotal = round2((deal.items || []).reduce((acc, i) => acc + (Number(i.list_price) || 0), 0));
    const discount = round2(listpriceTotal - deal.total_with_vat);

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-24" data-testid="deal-editor-view">
            <Link to="/admin/deals" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" /> Назад към списъка
            </Link>

            {/* HEADER */}
            <div className="rounded-xl border hairline bg-white p-6 space-y-3" data-testid="deal-header">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="overline mb-2 flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5" /> Сделка · super_admin only
                        </div>
                        <h1 className="font-serif text-4xl text-slate-900">{deal.deal_number}</h1>
                        <div className="mt-2 text-sm text-slate-600 flex items-center gap-3 flex-wrap">
                            <span>Клиент: <strong className="text-slate-900">{deal.client_name}</strong></span>
                            <span>·</span>
                            <span>Създадена: {new Date(deal.created_at).toLocaleDateString("bg-BG")}</span>
                            <span>·</span>
                            <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${DEAL_STATUS_BADGE[deal.status]}`} data-testid="deal-status-badge">
                                {DEAL_STATUS_LABELS[deal.status]}
                            </span>
                            {deal.source_quote_id && (
                                <span className="text-emerald-700 inline-flex items-center gap-1">
                                    <FileText className="h-3.5 w-3.5" /> От оферта
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {!isCancelled && (
                            <>
                                <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="deal-save-btn">
                                    <Save className="h-4 w-4 mr-1.5" /> {saving ? "Запазване…" : "Запази"}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                                    onClick={() => setConfirmAction({ type: "cancel" })}
                                    data-testid="deal-cancel-btn"
                                >
                                    <XCircle className="h-4 w-4 mr-1.5" /> Откажи сделка
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                {isCancelled && (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
                        <strong>Сделката е отказана.</strong> Причина: {deal.cancelled_reason || "—"}.
                        Имотите са освободени и редакцията е заключена.
                    </div>
                )}
            </div>

            {/* ITEMS */}
            <div className="rounded-xl border hairline bg-white p-6 space-y-3" data-testid="deal-items-section">
                <div className="text-sm font-semibold text-slate-900">Имоти в сделката ({(deal.items || []).length})</div>
                <table className="w-full text-sm">
                    <thead className="text-slate-500 border-b hairline">
                        <tr>
                            <th className="text-left py-2 font-medium">Код</th>
                            <th className="text-left py-2 font-medium">Тип</th>
                            <th className="text-right py-2 font-medium">Площ</th>
                            <th className="text-right py-2 font-medium">Листова</th>
                            <th className="text-right py-2 font-medium">Договорена</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(deal.items || []).map((it) => (
                            <tr key={it.property_id} className="border-b hairline">
                                <td className="py-2 font-mono">{it.property_code}</td>
                                <td className="py-2 text-slate-600">{it.property_label}</td>
                                <td className="py-2 text-right text-slate-600">{it.total_area || "—"} м²</td>
                                <td className="py-2 text-right text-slate-600">{currency(it.list_price)}</td>
                                <td className="py-2 text-right">
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        disabled={isCancelled}
                                        className={`w-32 text-right ml-auto ${
                                            (Number(it.agreed_price) || 0) > (Number(it.list_price) || 0)
                                                ? "border-amber-400 bg-amber-50"
                                                : ""
                                        }`}
                                        value={it.agreed_price ?? ""}
                                        onChange={(e) => updateItemPrice(it.property_id, e.target.value)}
                                        data-testid={`item-price-${it.property_code}`}
                                    />
                                </td>
                            </tr>
                        ))}
                        <tr className="font-semibold border-t-2 border-slate-900">
                            <td colSpan={3} className="py-3 text-right">ОБЩО (с ДДС):</td>
                            <td className="py-3 text-right text-slate-500">{currency(listpriceTotal)}</td>
                            <td className="py-3 text-right text-slate-900" data-testid="deal-total-with-vat">{currency(deal.total_with_vat)}</td>
                        </tr>
                        <tr className="text-sm text-slate-600">
                            <td colSpan={4} className="py-1 text-right">Без ДДС:</td>
                            <td className="py-1 text-right" data-testid="deal-total-without-vat">{currency(deal.total_without_vat)}</td>
                        </tr>
                        <tr className="text-sm text-slate-600">
                            <td colSpan={4} className="py-1 text-right">ДДС {deal.vat_rate || 20}%:</td>
                            <td className="py-1 text-right" data-testid="deal-vat-amount">{currency(deal.vat_amount)}</td>
                        </tr>
                    </tbody>
                </table>
                {discount > 0.5 && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 inline-flex items-center gap-2" data-testid="deal-discount-warning">
                        <AlertTriangle className="h-3.5 w-3.5" /> Отстъпка от <strong>{currency(discount)}</strong> спрямо листовите цени
                    </div>
                )}
            </div>

            {/* PAYMENT MODE */}
            <PaymentModeSection deal={deal} updateField={updateField} disabled={isCancelled} />

            {/* SCHEDULES */}
            {isBucketVisible(deal, "non_bank") && (
                <ScheduleSection
                    deal={deal}
                    bucket="non_bank"
                    title="Без банка"
                    disabled={isCancelled}
                    onUpdate={(idx, field, value) => updateStage("non_bank", idx, field, value)}
                    onAdd={() => addStage("non_bank")}
                    onRemove={(idx) => removeStage("non_bank", idx)}
                    onRegen={(preset) => regenerateSchedule("non_bank", preset)}
                    onTogglePayment={(stage) => togglePayment("non_bank", stage)}
                />
            )}
            {isBucketVisible(deal, "bank") && (
                <ScheduleSection
                    deal={deal}
                    bucket="bank"
                    title="С банка"
                    disabled={isCancelled}
                    onUpdate={(idx, field, value) => updateStage("bank", idx, field, value)}
                    onAdd={() => addStage("bank")}
                    onRemove={(idx) => removeStage("bank", idx)}
                    onRegen={(preset) => regenerateSchedule("bank", preset)}
                    onTogglePayment={(stage) => togglePayment("bank", stage)}
                />
            )}

            {/* SUMMARY */}
            <div className="rounded-xl border hairline bg-white p-6 space-y-4" data-testid="deal-summary-section">
                <div className="text-sm font-semibold text-slate-900">Обобщение</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <SumCard label="Реална сума" value={currency(deal.total_with_vat)} />
                    <SumCard label="Получени" value={`${currency(paidTotal)} (${paidPct.toFixed(1)}%)`} accent />
                    <SumCard label="Очаквани" value={`${currency(expectedTotal)} (${(100 - paidPct).toFixed(1)}%)`} />
                </div>
                <div>
                    <Label>Бележки</Label>
                    <Textarea
                        rows={3}
                        value={deal.notes || ""}
                        onChange={(e) => setDeal((p) => ({ ...p, notes: e.target.value }))}
                        disabled={isCancelled}
                        data-testid="deal-notes"
                    />
                </div>
            </div>

            {/* Cancel dialog */}
            <Dialog open={confirmAction?.type === "cancel"} onOpenChange={(o) => !o && setConfirmAction(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Откажи сделка</DialogTitle>
                        <DialogDescription>
                            Сделката ще се маркира като отказана. Имотите ще се освободят
                            (status=available, buyer_id=null). Продължавате ли?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Label>Причина <span className="text-red-600">*</span></Label>
                        <Textarea
                            rows={2}
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            data-testid="deal-cancel-reason"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmAction(null)}>Отказ</Button>
                        <Button onClick={doCancel} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="deal-cancel-confirm">
                            Откажи сделката
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Payment dialog */}
            {paymentDialog && (
                <PaymentMarkDialog
                    payload={paymentDialog}
                    onClose={() => setPaymentDialog(null)}
                    onConfirm={confirmPayment}
                />
            )}
        </div>
    );
}

function sanitizeStage(s, bucket) {
    return {
        order: Number(s.order) || 0,
        label: s.label || "",
        percent: Number(s.percent) || 0,
        amount: Number(s.amount) || 0,
        expected_date: s.expected_date || null,
        milestone_type: s.milestone_type || null,
        bucket,
        is_paid: !!s.is_paid,
        paid_date: s.paid_date || null,
        paid_amount: s.paid_amount != null ? Number(s.paid_amount) : null,
        payment_notes: s.payment_notes || null,
    };
}

// =====================================================
// PAYMENT MODE SECTION
// =====================================================
function PaymentModeSection({ deal, updateField, disabled }) {
    const pm = deal.payment_mode || {};
    const total = Number(deal.total_with_vat) || 0;

    const setMode = (mode) => {
        // Reset breakdown defaults based on mode
        const next = { mode };
        if (mode === "with_bank") {
            next.bank_amount = total;
            next.non_bank_amount = 0;
            next.invoice_amount = 0;
            next.proforma_amount = 0;
        } else if (mode === "without_bank") {
            next.bank_amount = 0;
            next.non_bank_amount = total;
            next.invoice_amount = total;
            next.proforma_amount = 0;
        } else {
            // combined — keep current or split 50/50
            next.bank_amount = pm.bank_amount || round2(total / 2);
            next.non_bank_amount = pm.non_bank_amount || round2(total / 2);
            next.invoice_amount = pm.invoice_amount || next.non_bank_amount;
            next.proforma_amount = pm.proforma_amount || 0;
        }
        Object.entries(next).forEach(([k, v]) => updateField(`payment_mode.${k}`, v));
    };

    const v = validatePaymentMode(pm.mode, total, pm);

    return (
        <div className="rounded-xl border hairline bg-white p-6 space-y-4" data-testid="deal-payment-mode-section">
            <div className="text-sm font-semibold text-slate-900">Тип плащане</div>
            <div className="flex gap-6 text-sm">
                {Object.entries(PAYMENT_MODE_LABELS).map(([val, label]) => (
                    <label key={val} className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="deal_payment_mode"
                            checked={pm.mode === val}
                            onChange={() => setMode(val)}
                            disabled={disabled}
                            data-testid={`pm-radio-${val}`}
                        />
                        {label}
                    </label>
                ))}
            </div>

            {pm.mode === "combined" && (
                <div className="border-t hairline pt-4 space-y-3" data-testid="pm-combined-breakdown">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Разпределение по/без банка</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <NumLabelInput
                            label="По банка (€)"
                            value={pm.bank_amount}
                            onChange={(v) => updateField("payment_mode.bank_amount", Number(v) || 0)}
                            pct={total > 0 ? (Number(pm.bank_amount || 0) / total) * 100 : 0}
                            disabled={disabled}
                            testId="pm-bank-amount"
                        />
                        <NumLabelInput
                            label="Без банка (€)"
                            value={pm.non_bank_amount}
                            onChange={(v) => updateField("payment_mode.non_bank_amount", Number(v) || 0)}
                            pct={total > 0 ? (Number(pm.non_bank_amount || 0) / total) * 100 : 0}
                            disabled={disabled}
                            testId="pm-non-bank-amount"
                        />
                    </div>
                </div>
            )}

            {(pm.mode === "without_bank" || pm.mode === "combined") && (
                <div className="border-t hairline pt-4 space-y-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">
                        Без банка ({currency(pm.mode === "combined" ? pm.non_bank_amount : total)}) — фактура / проформа
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <NumLabelInput
                            label="Фактура (€)"
                            value={pm.invoice_amount}
                            onChange={(v) => updateField("payment_mode.invoice_amount", Number(v) || 0)}
                            disabled={disabled}
                            testId="pm-invoice-amount"
                        />
                        <NumLabelInput
                            label="Проформа (€)"
                            value={pm.proforma_amount}
                            onChange={(v) => updateField("payment_mode.proforma_amount", Number(v) || 0)}
                            disabled={disabled}
                            testId="pm-proforma-amount"
                        />
                    </div>
                </div>
            )}

            {pm.mode === "with_bank" && (
                <div className="text-xs text-slate-500 italic">Цялата сума ({currency(total)}) се плаща по банков превод (винаги по фактура).</div>
            )}

            {!v.valid && (
                <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-xs text-rose-900" data-testid="pm-error">
                    {v.errors.join(" · ")}
                </div>
            )}
        </div>
    );
}

function NumLabelInput({ label, value, onChange, pct, disabled, testId }) {
    return (
        <div>
            <Label className="text-xs">{label}</Label>
            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    data-testid={testId}
                />
                {pct !== undefined && (
                    <span className="text-xs text-slate-500 whitespace-nowrap w-12 text-right">{pct.toFixed(1)}%</span>
                )}
            </div>
        </div>
    );
}

// =====================================================
// SCHEDULE SECTION
// =====================================================
function ScheduleSection({ deal, bucket, title, disabled, onUpdate, onAdd, onRemove, onRegen, onTogglePayment }) {
    const stages = (bucket === "bank" ? deal.bank_stages : deal.non_bank_stages) || [];
    const basis = bucketBasis(deal, bucket);
    const sumPct = sumStagesPercent(stages);
    const sumAmt = sumStagesAmount(stages);
    const paid = sumPaidAmount(stages);
    const due = round2(sumAmt - paid);
    const validation = validateScheduleSum(stages);

    return (
        <div className="rounded-xl border hairline bg-white p-6 space-y-4" data-testid={`schedule-section-${bucket}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-semibold text-slate-900">Вноски — {title}</div>
                    <div className="text-xs text-slate-500">База: {currency(basis)}</div>
                </div>
                <div className="flex gap-2">
                    {!disabled && (
                        <>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRegen(bucket === "bank" ? "with_bank" : "standard")}
                                data-testid={`schedule-regen-default-${bucket}`}
                            >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Auto-генерирай ({bucket === "bank" ? "4 етапа" : "8 етапа"})
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onRegen("custom")}
                                data-testid={`schedule-regen-custom-${bucket}`}
                            >
                                Custom (празно)
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {validation.warning && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900" data-testid={`schedule-warning-${bucket}`}>
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> {validation.warning}
                </div>
            )}

            <table className="w-full text-sm">
                <thead className="text-slate-500 border-b hairline">
                    <tr>
                        <th className="text-left py-2 font-medium w-12">#</th>
                        <th className="text-left py-2 font-medium">Етап</th>
                        <th className="text-right py-2 font-medium w-20">%</th>
                        <th className="text-right py-2 font-medium w-32">Сума</th>
                        <th className="text-left py-2 font-medium w-40">Дата</th>
                        <th className="text-center py-2 font-medium w-32">Платено</th>
                        {!disabled && <th className="w-10"></th>}
                    </tr>
                </thead>
                <tbody>
                    {stages.length === 0 && (
                        <tr><td colSpan={disabled ? 6 : 7} className="py-4 text-sm text-slate-500 italic text-center">Няма етапи. Натиснете „Auto-генерирай" за стандартен schedule.</td></tr>
                    )}
                    {stages.map((s, idx) => (
                        <tr key={idx} className={`border-b hairline ${s.is_paid ? "bg-emerald-50/40" : ""}`} data-testid={`stage-row-${bucket}-${s.order}`}>
                            <td className="py-2 font-mono text-slate-500">{s.order}</td>
                            <td className="py-2">
                                <Input
                                    value={s.label || ""}
                                    onChange={(e) => onUpdate(idx, "label", e.target.value)}
                                    disabled={disabled || s.is_paid}
                                    className="h-8"
                                    data-testid={`stage-label-${bucket}-${s.order}`}
                                />
                            </td>
                            <td className="py-2 text-right">
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={s.percent ?? ""}
                                    onChange={(e) => onUpdate(idx, "percent", e.target.value)}
                                    disabled={disabled || s.is_paid}
                                    className="h-8 w-20 text-right ml-auto"
                                    data-testid={`stage-percent-${bucket}-${s.order}`}
                                />
                            </td>
                            <td className="py-2 text-right text-slate-700">{currency(s.amount)}</td>
                            <td className="py-2">
                                <Input
                                    type="date"
                                    value={(s.expected_date || "").slice(0, 10)}
                                    onChange={(e) => onUpdate(idx, "expected_date", e.target.value)}
                                    disabled={disabled || s.is_paid}
                                    className="h-8 w-36"
                                    data-testid={`stage-date-${bucket}-${s.order}`}
                                />
                            </td>
                            <td className="py-2 text-center">
                                {s.is_paid ? (
                                    <button
                                        type="button"
                                        onClick={() => !disabled && onTogglePayment(s)}
                                        disabled={disabled}
                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 transition disabled:opacity-50"
                                        data-testid={`stage-paid-${bucket}-${s.order}`}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        {s.paid_date ? new Date(s.paid_date).toLocaleDateString("bg-BG") : "Платено"}
                                    </button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => !disabled && onTogglePayment(s)}
                                        disabled={disabled}
                                        className="h-7"
                                        data-testid={`stage-mark-${bucket}-${s.order}`}
                                    >
                                        Маркирай
                                    </Button>
                                )}
                            </td>
                            {!disabled && (
                                <td className="py-2 text-right">
                                    {!s.is_paid && (
                                        <button
                                            type="button"
                                            onClick={() => onRemove(idx)}
                                            className="text-slate-400 hover:text-rose-600"
                                            data-testid={`stage-remove-${bucket}-${s.order}`}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                    <tr className="font-medium">
                        <td colSpan={2} className="py-3 text-right text-slate-600">ОБЩО:</td>
                        <td className="py-3 text-right" data-testid={`schedule-sum-pct-${bucket}`}>{sumPct.toFixed(1)}%</td>
                        <td className="py-3 text-right">{currency(sumAmt)}</td>
                        <td colSpan={disabled ? 2 : 3} className="py-3 text-xs text-slate-500">
                            Получени: <strong className="text-emerald-700">{currency(paid)}</strong> · Дължими: <strong className="text-slate-900">{currency(due)}</strong>
                        </td>
                    </tr>
                </tbody>
            </table>

            {!disabled && (
                <Button size="sm" variant="outline" onClick={onAdd} data-testid={`schedule-add-${bucket}`}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Добави етап
                </Button>
            )}
        </div>
    );
}

// =====================================================
// PAYMENT MARK DIALOG
// =====================================================
function PaymentMarkDialog({ payload, onClose, onConfirm }) {
    const { stage } = payload;
    const today = new Date().toISOString().slice(0, 10);
    const [paidDate, setPaidDate] = useState(today);
    const [paidAmount, setPaidAmount] = useState(stage.amount || 0);
    const [paymentNotes, setPaymentNotes] = useState("");

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent data-testid="payment-mark-dialog">
                <DialogHeader>
                    <DialogTitle className="font-serif text-2xl">
                        Плащане за етап #{stage.order}: {stage.label}
                    </DialogTitle>
                    <DialogDescription>
                        Плановата сума е <strong>{currency(stage.amount)}</strong>.
                        Може да въведете различна реално платена сума.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Дата на плащане <span className="text-red-600">*</span></Label>
                            <Input
                                type="date"
                                value={paidDate}
                                onChange={(e) => setPaidDate(e.target.value)}
                                data-testid="payment-mark-date"
                            />
                        </div>
                        <div>
                            <Label>Сума (€)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={paidAmount}
                                onChange={(e) => setPaidAmount(e.target.value)}
                                data-testid="payment-mark-amount"
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Бележки</Label>
                        <Textarea
                            rows={2}
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            data-testid="payment-mark-notes"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Отказ</Button>
                    <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => onConfirm(paidDate, paidAmount, paymentNotes)}
                        data-testid="payment-mark-confirm"
                    >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Маркирай платено
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SumCard({ label, value, accent }) {
    return (
        <div className={`rounded-lg border hairline p-3 ${accent ? "bg-emerald-50 border-emerald-200" : "bg-stone-50"}`}>
            <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
            <div className={`mt-1 font-medium ${accent ? "text-emerald-900" : "text-slate-900"}`}>{value}</div>
        </div>
    );
}
