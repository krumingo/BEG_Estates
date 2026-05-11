import React, { useEffect, useState } from "react";
import { currency, formatApiError, api } from "../../lib/api";
import { useIsSuperAdmin } from "../../lib/auth";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import {
    BarChart, Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { AlertTriangle, Info, Wallet, TrendingUp, Building2, Calculator, Save, Lock } from "lucide-react";
import { StatCard, SectionCard } from "./DashboardTabs";

const FIELD_LABELS = {
    total_rzp_area: "РЗП (м²)",
    rough_cost_per_sqm: "Разход груб строеж (€/м²)",
    full_cost_per_sqm: "Разход цял блок (€/м²)",
    cash_opening_balance: "Налични пари сега (€)",
    minimum_cash_reserve: "Фиксиран минимален резерв (€)",
    reserve_percent: "Резерв % от 3 месеца разход",
    rough_start_date: "Начало на груб строеж",
    rough_frontload_months: "Първи месеци с frontload",
    rough_frontload_percent: "Процент в frontload (%)",
    rough_remaining_months_to_act14: "Месеци до Акт 14 (след frontload)",
    forecast_months: "Период на прогнозата (месеци)",
    notes: "Бележки",
};

const DEFAULTS = {
    total_rzp_area: "",
    rough_cost_per_sqm: "",
    full_cost_per_sqm: "",
    cash_opening_balance: "",
    minimum_cash_reserve: "",
    reserve_percent: "",
    rough_start_date: "",
    rough_frontload_months: 3,
    rough_frontload_percent: 50,
    rough_remaining_months_to_act14: 8,
    forecast_months: 24,
    notes: "",
};

function statusBadge(status) {
    const map = {
        ok: { bg: "bg-emerald-100", text: "text-emerald-700", label: "OK" },
        below_reserve: { bg: "bg-amber-100", text: "text-amber-700", label: "Под резерв" },
        deficit: { bg: "bg-red-100", text: "text-red-700", label: "Недостиг" },
    };
    const v = map[status] || map.ok;
    return <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium ${v.bg} ${v.text}`}>{v.label}</span>;
}

export default function ConstructionCashflowTab({ data, projectId, onSaved }) {
    const cc = data?.construction_cashflow;
    const isSuperAdmin = useIsSuperAdmin();
    const canEdit = !!isSuperAdmin;
    const [form, setForm] = useState(DEFAULTS);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (cc?.settings) {
            setForm({ ...DEFAULTS, ...cc.settings });
        }
    }, [cc?.settings, projectId]);

    if (!projectId) {
        return (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center shadow-sm" data-testid="construction-no-project">
                <Building2 className="h-12 w-12 mx-auto text-slate-400 mb-3" strokeWidth={1.3} />
                <div className="text-lg font-medium text-slate-700 mb-2">Избери проект</div>
                <div className="text-sm text-slate-500">Избери проект от филтъра горе, за да въведеш и видиш строителния cashflow.</div>
            </div>
        );
    }

    if (cc && cc.available === false) {
        return (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-sm text-slate-500 text-center" data-testid="construction-unavailable">
                {cc.reason || "Construction cashflow не е достъпен."}
            </div>
        );
    }

    const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!canEdit) return;
        try {
            setSaving(true);
            const payload = { construction_cashflow_settings: {} };
            for (const k of Object.keys(DEFAULTS)) {
                const v = form[k];
                if (v === "" || v == null) continue;
                if (k === "rough_start_date" || k === "notes") {
                    payload.construction_cashflow_settings[k] = String(v);
                } else {
                    payload.construction_cashflow_settings[k] = Number(v);
                }
            }
            await api.put(`/admin/projects/${projectId}`, payload);
            toast.success("Прогнозата е запазена");
            if (onSaved) onSaved();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при запис");
        } finally {
            setSaving(false);
        }
    };

    const totals = cc?.totals || {};
    const monthly = cc?.monthly || [];
    const alerts = cc?.alerts || [];

    const chartData = monthly.map((m) => ({
        label: m.month_label,
        Приходи: m.expected_revenue,
        Разходи: -m.total_planned_cost,
        Баланс: m.closing_balance,
        Резерв: m.reserve_required,
    }));

    return (
        <div className="space-y-8" data-testid="construction-cashflow-tab">
            {/* ALERTS at top — sorted by severity */}
            {alerts.length > 0 && (
                <SectionCard title="Сигнали по cashflow-а" testId="construction-alerts">
                    <AlertsRow alerts={alerts} />
                </SectionCard>
            )}

            {/* SETTINGS FORM */}
            <SectionCard title="Настройки на прогнозата" testId="construction-form" hint={canEdit ? "всички полета по избор" : "само за преглед"}>
                <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
                    {!canEdit && (
                        <div
                            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3"
                            data-testid="construction-readonly-notice"
                        >
                            <Lock className="h-4 w-4 text-amber-700 shrink-0" />
                            <span className="text-sm text-amber-900">
                                Само super_admin може да редактира строителната прогноза.
                            </span>
                        </div>
                    )}
                    <fieldset disabled={!canEdit} className={!canEdit ? "opacity-70" : ""}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <NumField k="total_rzp_area" form={form} update={update} />
                        <NumField k="rough_cost_per_sqm" form={form} update={update} />
                        <NumField k="full_cost_per_sqm" form={form} update={update} />
                        <NumField k="cash_opening_balance" form={form} update={update} />
                        <NumField k="minimum_cash_reserve" form={form} update={update} />
                        <NumField k="reserve_percent" form={form} update={update} step="1" />
                        <div>
                            <Label className="text-sm font-medium">{FIELD_LABELS.rough_start_date}</Label>
                            <Input
                                type="date"
                                value={form.rough_start_date || ""}
                                onChange={(e) => update("rough_start_date", e.target.value)}
                                data-testid="form-rough_start_date"
                                className="mt-1"
                            />
                        </div>
                        <NumField k="rough_frontload_months" form={form} update={update} step="1" />
                        <NumField k="rough_frontload_percent" form={form} update={update} step="1" />
                        <NumField k="rough_remaining_months_to_act14" form={form} update={update} step="1" />
                        <NumField k="forecast_months" form={form} update={update} step="1" />
                        <div className="md:col-span-2 lg:col-span-3">
                            <Label className="text-sm font-medium">{FIELD_LABELS.notes}</Label>
                            <Textarea
                                value={form.notes || ""}
                                onChange={(e) => update("notes", e.target.value)}
                                placeholder="Бележки за прогнозата…"
                                rows={2}
                                data-testid="form-notes"
                                className="mt-1"
                            />
                        </div>
                    </div>
                    </fieldset>
                    {canEdit && (
                        <div className="flex justify-end mt-5">
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                                data-testid="construction-save-btn"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? "Запис..." : "Запази прогнозата"}
                            </Button>
                        </div>
                    )}
                </div>
            </SectionCard>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="РЗП" value={`${(totals.total_rzp_area || 0).toLocaleString("bg-BG")} м²`} sub="разгъната застроена площ" accent="dark" testId="cc-card-rzp" />
                <StatCard label="Разход груб строеж" value={currency(totals.rough_total_cost || 0)} sub={`${totals.rough_cost_per_sqm || 0} €/м²`} accent="amber" testId="cc-card-rough" />
                <StatCard label="Разход цял блок" value={currency(totals.full_total_cost || 0)} sub={`${totals.full_cost_per_sqm || 0} €/м²`} accent="red" testId="cc-card-full" />
                <StatCard label="Остава след груб строеж" value={currency(totals.remaining_after_rough || 0)} sub="довършителни + общи части" testId="cc-card-remaining" />

                <StatCard label="Очаквани приходи до Акт 14" value={currency(totals.expected_revenue_until_act14 || 0)} sub="от бъдещи unpaid stages" accent="green" testId="cc-card-rev-act14" />
                <StatCard label="Налични пари" value={currency(totals.cash_opening_balance || 0)} sub="opening balance" accent="blue" testId="cc-card-cash" />
                <StatCard
                    label="Макс. недостиг"
                    value={currency(totals.max_cash_deficit || 0)}
                    sub={(totals.max_cash_deficit || 0) > 0 ? "критично" : "✓ няма"}
                    accent={(totals.max_cash_deficit || 0) > 0 ? "red" : "green"}
                    testId="cc-card-deficit"
                />
                <StatCard
                    label="Препоръчителен кредит"
                    value={currency(totals.recommended_credit_buffer || 0)}
                    sub="за покриване на риска"
                    accent="violet"
                    testId="cc-card-credit-buffer"
                />
            </div>

            {/* CHART */}
            <SectionCard title="Месечен cashflow" testId="construction-chart" hint="приходи vs разходи vs баланс">
                {chartData.length === 0 ? (
                    <div className="rounded-2xl border border-stone-200 bg-white p-8 text-sm text-slate-500 text-center">
                        Въведи настройки и натисни „Запази прогнозата" за да видиш графика.
                    </div>
                ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white p-5 h-96 shadow-sm">
                        <ResponsiveContainer>
                            <ComposedChart data={chartData}>
                                <CartesianGrid stroke="#f1f5f9" />
                                <XAxis dataKey="label" fontSize={11} />
                                <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                                <Tooltip formatter={(v) => currency(v)} />
                                <Legend wrapperStyle={{ fontSize: 13 }} />
                                <Bar dataKey="Приходи" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                <Bar dataKey="Разходи" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                <Line type="monotone" dataKey="Баланс" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="Резерв" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </SectionCard>

            {/* MONTHLY TABLE */}
            <SectionCard title="Месечна разбивка" testId="construction-table" hint={`${monthly.length} месеца`}>
                {monthly.length === 0 ? (
                    <div className="rounded-2xl border border-stone-200 bg-white p-8 text-sm text-slate-500 text-center">
                        Няма данни.
                    </div>
                ) : (
                    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
                        <table className="w-full text-base">
                            <thead className="bg-stone-50 text-slate-600 text-sm">
                                <tr>
                                    <th className="text-left p-3 font-medium">Месец</th>
                                    <th className="text-right p-3 font-medium">Начален баланс</th>
                                    <th className="text-right p-3 font-medium">Приходи</th>
                                    <th className="text-right p-3 font-medium">Груб строеж</th>
                                    <th className="text-right p-3 font-medium">Друг разход</th>
                                    <th className="text-right p-3 font-medium">Общо разход</th>
                                    <th className="text-right p-3 font-medium">Краен баланс</th>
                                    <th className="text-right p-3 font-medium">Резерв</th>
                                    <th className="text-left p-3 font-medium">Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthly.map((m) => (
                                    <tr key={m.month} className={`border-t border-stone-100 ${m.status === "deficit" ? "bg-red-50/40" : m.status === "below_reserve" ? "bg-amber-50/40" : ""}`} data-testid={`construction-row-${m.month}`}>
                                        <td className="p-3 font-medium">{m.month_label}</td>
                                        <td className="p-3 text-right tabular-nums">{currency(m.opening_balance)}</td>
                                        <td className="p-3 text-right tabular-nums text-emerald-700">{currency(m.expected_revenue)}</td>
                                        <td className="p-3 text-right tabular-nums text-orange-700">{currency(m.planned_rough_cost)}</td>
                                        <td className="p-3 text-right tabular-nums text-orange-600">{currency(m.planned_remaining_construction_cost)}</td>
                                        <td className="p-3 text-right tabular-nums font-medium">{currency(m.total_planned_cost)}</td>
                                        <td className={`p-3 text-right tabular-nums font-medium ${m.closing_balance < 0 ? "text-red-700" : "text-slate-900"}`}>{currency(m.closing_balance)}</td>
                                        <td className="p-3 text-right tabular-nums text-slate-500">{currency(m.reserve_required)}</td>
                                        <td className="p-3">{statusBadge(m.status)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}

function NumField({ k, form, update, step = "0.01" }) {
    return (
        <div>
            <Label className="text-sm font-medium">{FIELD_LABELS[k]}</Label>
            <Input
                type="number"
                step={step}
                min="0"
                value={form[k] ?? ""}
                onChange={(e) => update(k, e.target.value)}
                data-testid={`form-${k}`}
                className="mt-1"
            />
        </div>
    );
}

function AlertsRow({ alerts }) {
    const order = { critical: 0, warning: 1, info: 2 };
    const sorted = [...alerts].sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));
    const styles = {
        critical: { border: "border-red-200", bg: "bg-gradient-to-br from-red-50 to-white", title: "text-red-900", msg: "text-red-700", icon: "text-red-600", emoji: "🚨" },
        warning: { border: "border-amber-200", bg: "bg-gradient-to-br from-amber-50 to-white", title: "text-amber-900", msg: "text-amber-700", icon: "text-amber-600", emoji: "⚠️" },
        info: { border: "border-blue-200", bg: "bg-gradient-to-br from-blue-50 to-white", title: "text-blue-900", msg: "text-blue-700", icon: "text-blue-600", emoji: "💡" },
    };
    return (
        <div className="space-y-3">
            {sorted.map((a, idx) => {
                const s = styles[a.severity] || styles.info;
                const Icon = a.severity === "critical" ? AlertTriangle : (a.severity === "warning" ? Wallet : Info);
                return (
                    <div key={`${a.type}-${idx}`} className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex items-start gap-4 shadow-sm`} data-testid={`construction-alert-${a.type}`}>
                        <Icon className={`h-6 w-6 ${s.icon} shrink-0 mt-0.5`} />
                        <div className="flex-1">
                            <div className={`text-base font-medium ${s.title}`}>{s.emoji} {a.title}</div>
                            {a.message && <div className={`text-sm mt-1 ${s.msg}`}>{a.message}</div>}
                        </div>
                        {(a.amount || 0) > 0 && (
                            <div className={`text-lg font-medium tabular-nums ${s.title} shrink-0`}>{currency(a.amount)}</div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
