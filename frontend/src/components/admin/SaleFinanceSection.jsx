import React, { useEffect, useMemo, useState } from "react";
import { Lock, Trash2, Pencil, X, AlertTriangle } from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { toast } from "sonner";

/**
 * SaleFinanceSection — super_admin-only inline financial panel for a property.
 *
 * Reads/edits the active Sale linked to a property. Shows VAT breakdown,
 * percent-mode toggle, live recalc, listprice diff, soft-delete with reason.
 *
 * Props:
 * - propertyId
 * - listPrice
 * - onSaleChange?: () => void
 */
export default function SaleFinanceSection({ propertyId, listPrice, onSaleChange }) {
    const [sale, setSale] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [warnings, setWarnings] = useState([]);
    const [error, setError] = useState(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteReason, setDeleteReason] = useState("");

    const [form, setForm] = useState({
        invoice_amount: 0,
        proforma_amount: 0,
        vat_rate: 20,
        sale_date: "",
        notes: "",
    });
    const [inputMode, setInputMode] = useState("amount"); // amount | percent

    const lp = parseFloat(listPrice || 0);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api.get(`/sales/by-property/${propertyId}`);
            const s = r.data || null;
            setSale(s);
            if (s) {
                setForm({
                    invoice_amount: s.invoice_amount ?? 0,
                    proforma_amount: s.proforma_amount ?? 0,
                    vat_rate: s.vat_rate ?? 20,
                    sale_date: s.sale_date || "",
                    notes: s.notes || "",
                });
            }
            setEditing(false);
            setError(null);
            setWarnings([]);
        } catch (e) {
            setSale(null);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [propertyId]);

    // Live computed values
    const computed = useMemo(() => {
        const inv = parseFloat(form.invoice_amount || 0);
        const pro = parseFloat(form.proforma_amount || 0);
        const vatRate = parseFloat(form.vat_rate || 20);
        const vat = inv > 0 ? Math.round((inv * vatRate / (100 + vatRate)) * 100) / 100 : 0;
        const net = Math.round((inv - vat) * 100) / 100;
        const realTotal = Math.round((inv + pro) * 100) / 100;
        const diff = lp > 0 ? Math.round((realTotal - lp) * 100) / 100 : 0;
        return { inv, pro, vat, net, realTotal, diff, vatRate };
    }, [form.invoice_amount, form.proforma_amount, form.vat_rate, lp]);

    const setField = (k) => (e) => {
        const v = e?.target ? e.target.value : e;
        setForm((s) => ({ ...s, [k]: v }));
    };

    const handlePercentChange = (key) => (e) => {
        const pct = parseFloat(e.target.value || 0);
        const amount = lp > 0 ? Math.round(lp * pct) / 100 : 0;
        setForm((s) => ({ ...s, [key]: amount }));
    };

    const startCreate = () => {
        setForm({
            invoice_amount: lp || 0,
            proforma_amount: 0,
            vat_rate: 20,
            sale_date: new Date().toISOString().slice(0, 10),
            notes: "",
        });
        setEditing(true);
    };

    const submit = async () => {
        setSaving(true);
        setError(null);
        try {
            const payload = {
                invoice_amount: parseFloat(form.invoice_amount || 0),
                proforma_amount: parseFloat(form.proforma_amount || 0),
                vat_rate: parseFloat(form.vat_rate || 20),
                sale_date: form.sale_date || null,
                notes: form.notes || null,
            };
            let resp;
            if (sale) {
                resp = await api.put(`/sales/${sale.id}`, payload);
            } else {
                resp = await api.post("/sales", { ...payload, property_id: propertyId });
            }
            const data = resp.data;
            setSale(data.sale || data);
            setWarnings(data.warnings || []);
            setEditing(false);
            toast.success("Финансовите данни са запазени");
            onSaleChange?.();
        } catch (e) {
            const detail = e.response?.data?.detail;
            if (detail && typeof detail === "object" && detail.errors) {
                setError(detail.errors.join("; "));
            } else {
                setError(formatApiError(detail));
            }
            toast.error("Грешка при запис");
        } finally {
            setSaving(false);
        }
    };

    const doDelete = async () => {
        if (!sale || !deleteReason.trim()) {
            toast.error("Причина за изтриване е задължителна");
            return;
        }
        try {
            await api.delete(`/sales/${sale.id}`, { data: { reason: deleteReason.trim() } });
            toast.success("Sale записът е архивиран");
            setDeleteOpen(false);
            setDeleteReason("");
            setSale(null);
            onSaleChange?.();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    if (loading) {
        return <div className="text-xs text-slate-400">Зареждане на финансов профил…</div>;
    }

    return (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/30 p-4 space-y-3" data-testid="sale-finance-section">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-700" />
                    <h3 className="font-serif text-lg text-slate-900">Финансов профил</h3>
                    <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">super admin</span>
                </div>
                {!editing && (
                    sale ? (
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="sale-edit-btn">
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Редакция
                        </Button>
                    ) : (
                        <Button size="sm" onClick={startCreate} data-testid="sale-create-btn" className="bg-amber-700 hover:bg-amber-800 text-white">
                            + Създай sale
                        </Button>
                    )
                )}
                {editing && (
                    <Button size="sm" variant="outline" onClick={() => { setEditing(false); load(); }} data-testid="sale-cancel-btn">
                        <X className="h-3.5 w-3.5 mr-1.5" /> Затвори
                    </Button>
                )}
            </div>

            {!sale && !editing && (
                <div className="text-sm text-slate-600 italic">Няма sale запис за този имот.</div>
            )}

            {sale && !editing && (
                <SaleViewMode sale={sale} listPrice={lp} />
            )}

            {editing && (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <Label>Дата на продажба</Label>
                            <Input
                                type="date"
                                value={form.sale_date || ""}
                                onChange={setField("sale_date")}
                                data-testid="sale-date"
                            />
                        </div>
                        <div>
                            <Label>Тип въвеждане</Label>
                            <div className="flex items-center gap-3 mt-2 text-sm">
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={inputMode === "amount"} onChange={() => setInputMode("amount")} data-testid="sale-mode-amount" />
                                    Сума €
                                </label>
                                <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={inputMode === "percent"} onChange={() => setInputMode("percent")} data-testid="sale-mode-percent" />
                                    Процент %
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-md bg-white border hairline p-3 space-y-2">
                        <Label>Сума по фактура (с ДДС)</Label>
                        {inputMode === "amount" ? (
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.invoice_amount}
                                onChange={setField("invoice_amount")}
                                data-testid="sale-invoice-amount"
                            />
                        ) : (
                            <div>
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    onChange={handlePercentChange("invoice_amount")}
                                    placeholder="% от листовата"
                                    data-testid="sale-invoice-percent"
                                />
                                <div className="text-xs text-slate-500 mt-1">= {currency(computed.inv)} (от {currency(lp)})</div>
                            </div>
                        )}
                        <div className="text-xs text-slate-500">
                            ⤷ Без ДДС: <span className="font-medium text-slate-700">{currency(computed.net)}</span> · ДДС {computed.vatRate.toFixed(0)}%: <span className="font-medium text-slate-700">{currency(computed.vat)}</span>
                        </div>
                    </div>

                    <div className="rounded-md bg-white border hairline p-3 space-y-2">
                        <Label>Сума по проформа</Label>
                        {inputMode === "amount" ? (
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.proforma_amount}
                                onChange={setField("proforma_amount")}
                                data-testid="sale-proforma-amount"
                            />
                        ) : (
                            <div>
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    onChange={handlePercentChange("proforma_amount")}
                                    placeholder="% от листовата"
                                    data-testid="sale-proforma-percent"
                                />
                                <div className="text-xs text-slate-500 mt-1">= {currency(computed.pro)}</div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-md bg-slate-900 text-white p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                            <span>Реална сума:</span>
                            <span className="font-medium" data-testid="sale-real-total">{currency(computed.realTotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-300">
                            <span>Листова цена:</span>
                            <span>{currency(lp)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span>Разлика:</span>
                            <span className={computed.diff > 0 ? "text-rose-300" : computed.diff < 0 ? "text-amber-300" : "text-emerald-300"}>
                                {computed.diff > 0 ? "+" : ""}{currency(computed.diff)}
                                {computed.diff === 0 ? " (точно ✓)" : computed.diff > 0 ? " (надвишава!)" : " (отстъпка)"}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <Label>ДДС ставка (%)</Label>
                            <Input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                value={form.vat_rate}
                                onChange={setField("vat_rate")}
                                data-testid="sale-vat-rate"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Бележки</Label>
                            <Textarea
                                rows={2}
                                value={form.notes || ""}
                                onChange={setField("notes")}
                                data-testid="sale-notes"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-2" data-testid="sale-error">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>{error}</div>
                        </div>
                    )}
                    {warnings && warnings.length > 0 && (
                        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-0.5" data-testid="sale-warnings">
                            {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-2">
                        <div>
                            {sale && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                                    onClick={() => setDeleteOpen(true)}
                                    data-testid="sale-delete-btn"
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Изтрий sale
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditing(false); load(); }}>Отказ</Button>
                            <Button
                                size="sm"
                                onClick={submit}
                                disabled={saving}
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                                data-testid="sale-save-btn"
                            >
                                {saving ? "Запис…" : "Запази"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent data-testid="sale-delete-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Архивиране на sale</DialogTitle>
                        <DialogDescription>
                            Това ще soft-архивира sale записа. Историята остава за audit. Причината е задължителна.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        rows={3}
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        placeholder="Например: 'Купувачът се отказа след нотариален акт'"
                        data-testid="sale-delete-reason"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteReason(""); }}>Отказ</Button>
                        <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={doDelete} data-testid="sale-delete-confirm">
                            Архивирай
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SaleViewMode({ sale, listPrice }) {
    const inv = parseFloat(sale.invoice_amount || 0);
    const pro = parseFloat(sale.proforma_amount || 0);
    const real = inv + pro;
    const invPct = real > 0 ? (inv / real) * 100 : 0;
    const proPct = real > 0 ? (pro / real) * 100 : 0;
    return (
        <div className="space-y-2 text-sm" data-testid="sale-view-mode">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>Дата: <span className="text-slate-900">{sale.sale_date || "—"}</span></div>
                <div>Sale ID: <span className="font-mono text-[10px] text-slate-400">{(sale.id || "").slice(0, 8)}…</span></div>
            </div>
            <div className="rounded-md bg-white border hairline p-3 space-y-1.5">
                <div className="flex justify-between">
                    <span className="text-slate-600">Сума по фактура:</span>
                    <span className="font-medium text-slate-900">
                        {currency(inv)}
                        <span className="text-xs text-slate-500 ml-1.5">({invPct.toFixed(1)}%)</span>
                    </span>
                </div>
                <div className="text-xs text-slate-500 pl-3">
                    ⤷ Без ДДС: {currency(sale.invoice_net || 0)} · ДДС {(sale.vat_rate || 20).toFixed(0)}%: {currency(sale.invoice_vat || 0)}
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-600">Сума по проформа:</span>
                    <span className="font-medium text-slate-900">
                        {currency(pro)}
                        <span className="text-xs text-slate-500 ml-1.5">({proPct.toFixed(1)}%)</span>
                    </span>
                </div>
                <div className="border-t hairline pt-1.5 mt-1 flex justify-between">
                    <span className="font-serif text-slate-900">РЕАЛНА СУМА:</span>
                    <span className="font-medium text-slate-900" data-testid="sale-view-real-total">{currency(real)}</span>
                </div>
                {listPrice > 0 && Math.abs(real - listPrice) > 0.01 && (
                    <div className="text-xs text-amber-700">
                        Разлика спрямо листова: {currency(real - listPrice)}
                    </div>
                )}
            </div>
            {sale.notes && (
                <div className="text-xs text-slate-500">Бележки: {sale.notes}</div>
            )}
            {sale.source_quote_id && (
                <div className="text-xs text-slate-500">Source quote: <span className="font-mono">{sale.source_quote_id.slice(0, 8)}…</span></div>
            )}
        </div>
    );
}
