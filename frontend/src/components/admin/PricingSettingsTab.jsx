import React, { useEffect, useState } from "react";
import { Plus, Trash2, RotateCcw, Calculator } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter,
} from "../ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import { api, formatApiError, currency } from "../../lib/api";


const PROPERTY_TYPES = [
    { value: "shop", label: "Магазин" },
    { value: "garage", label: "Гараж" },
    { value: "parking", label: "Паркомясто (подземно)" },
    { value: "yard_parking", label: "Дворно паркомясто" },
    { value: "storage", label: "Склад" },
];

const FLOOR_OPTIONS = [
    { value: -1, label: "Сутерен (-1)" },
    { value: 0, label: "Партер (0)" },
    { value: 1, label: "1 етаж" },
    { value: 2, label: "2 етаж" },
    { value: 3, label: "3 етаж" },
    { value: 4, label: "4 етаж" },
    { value: 5, label: "5 етаж" },
    { value: 6, label: "6 етаж" },
    { value: 7, label: "7 етаж" },
];

const HADZHI_DIMITAR_DEFAULTS = {
    base_price_per_sqm: 2200,
    vat_rate: 20,
    floor_corrections: [
        { floor: 1, price_per_sqm: 2200 },
        { floor: 2, price_per_sqm: 2280 },
        { floor: 3, price_per_sqm: 2360 },
        { floor: 4, price_per_sqm: 2440 },
        { floor: 5, price_per_sqm: 2520 },
        { floor: 6, price_per_sqm: 2600 },
    ],
    type_overrides: [
        { property_type: "shop", price_per_sqm: 2131 },
        { property_type: "garage", price_per_sqm: 1212 },
        { property_type: "parking", price_per_sqm: 760 },
        { property_type: "yard_parking", price_per_sqm: 600 },
        { property_type: "storage", price_per_sqm: 350 },
    ],
};


export default function PricingSettingsTab({ project, onSaved }) {
    const initial = () => ({
        base_price_per_sqm: project?.pricing_settings?.base_price_per_sqm ?? "",
        vat_rate: project?.pricing_settings?.vat_rate ?? 20,
        floor_corrections: project?.pricing_settings?.floor_corrections ?? [],
        type_overrides: project?.pricing_settings?.type_overrides ?? [],
    });
    const [settings, setSettings] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [recalcDialogOpen, setRecalcDialogOpen] = useState(false);
    const [recalcDryRun, setRecalcDryRun] = useState(null);
    const [recalcLoading, setRecalcLoading] = useState(false);

    useEffect(() => {
        setSettings(initial());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    const addFloorCorrection = () => {
        setSettings((s) => ({
            ...s,
            floor_corrections: [...s.floor_corrections, { floor: 1, price_per_sqm: 0 }],
        }));
    };

    const updateFloorCorrection = (idx, field, value) => {
        setSettings((s) => ({
            ...s,
            floor_corrections: s.floor_corrections.map((fc, i) =>
                i === idx ? { ...fc, [field]: Number(value) } : fc,
            ),
        }));
    };

    const removeFloorCorrection = (idx) => {
        setSettings((s) => ({
            ...s,
            floor_corrections: s.floor_corrections.filter((_, i) => i !== idx),
        }));
    };

    const addTypeOverride = () => {
        setSettings((s) => ({
            ...s,
            type_overrides: [...s.type_overrides, { property_type: "garage", price_per_sqm: 0 }],
        }));
    };

    const updateTypeOverride = (idx, field, value) => {
        setSettings((s) => ({
            ...s,
            type_overrides: s.type_overrides.map((to, i) =>
                i === idx ? { ...to, [field]: field === "price_per_sqm" ? Number(value) : value } : to,
            ),
        }));
    };

    const removeTypeOverride = (idx) => {
        setSettings((s) => ({
            ...s,
            type_overrides: s.type_overrides.filter((_, i) => i !== idx),
        }));
    };

    const loadDefaults = () => {
        if (!window.confirm("Това ще презапише текущите настройки с default-те за Хаджи Димитър. Продължи?")) return;
        setSettings(HADZHI_DIMITAR_DEFAULTS);
        toast.success("Заредени са default-те за Хаджи Димитър");
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                pricing_settings: {
                    base_price_per_sqm: settings.base_price_per_sqm
                        ? Number(settings.base_price_per_sqm) : null,
                    vat_rate: Number(settings.vat_rate) || 20,
                    floor_corrections: settings.floor_corrections.filter((fc) => fc.price_per_sqm > 0),
                    type_overrides: settings.type_overrides.filter((to) => to.property_type && to.price_per_sqm > 0),
                },
            };
            await api.put(`/admin/projects/${project.id}`, payload);
            toast.success("Pricing настройките са запазени");
            if (onSaved) onSaved();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        } finally {
            setSaving(false);
        }
    };

    const previewRecalc = async () => {
        setRecalcLoading(true);
        try {
            const { data } = await api.post(`/admin/projects/${project.id}/pricing/recalc`, {
                project_id: project.id,
                dry_run: true,
                overwrite_overrides: false,
            });
            setRecalcDryRun(data);
            setRecalcDialogOpen(true);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при preview");
        } finally {
            setRecalcLoading(false);
        }
    };

    const applyRecalc = async () => {
        setRecalcLoading(true);
        try {
            const { data } = await api.post(`/admin/projects/${project.id}/pricing/recalc`, {
                project_id: project.id,
                dry_run: false,
                overwrite_overrides: false,
            });
            toast.success(`Updated ${data.updated_count} имота`);
            setRecalcDialogOpen(false);
            if (onSaved) onSaved();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || e.message);
        } finally {
            setRecalcLoading(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="pricing-settings-tab">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Площообразуване</h3>
                    <p className="text-sm text-slate-500">
                        Цените са БЕЗ ДДС. ДДС се добавя автоматично за публичен display.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadDefaults} data-testid="pricing-load-defaults">
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Default Хаджи Димитър
                </Button>
            </div>

            <div className="border hairline rounded-lg p-4 space-y-4 bg-stone-50/60">
                <h4 className="font-medium">Базови настройки</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label>Базова цена/м² (€, без ДДС)</Label>
                        <Input
                            type="number"
                            step="1"
                            value={settings.base_price_per_sqm}
                            onChange={(e) => setSettings((s) => ({ ...s, base_price_per_sqm: e.target.value }))}
                            placeholder="2200"
                            data-testid="pricing-base-ppm"
                        />
                        <p className="text-xs text-slate-500 mt-1">Fallback ако имот няма етаж/тип в overrides</p>
                    </div>
                    <div>
                        <Label>ДДС % (default)</Label>
                        <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            value={settings.vat_rate}
                            onChange={(e) => setSettings((s) => ({ ...s, vat_rate: e.target.value }))}
                            placeholder="20"
                            data-testid="pricing-vat-rate"
                        />
                        <p className="text-xs text-slate-500 mt-1">Стандартно 20% за БГ</p>
                    </div>
                </div>
            </div>

            <div className="border hairline rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium">Корекции за етажи (за апартаменти)</h4>
                    <Button size="sm" variant="outline" onClick={addFloorCorrection} data-testid="add-floor-correction">
                        <Plus className="w-4 h-4 mr-1" /> Добави етаж
                    </Button>
                </div>
                {settings.floor_corrections.length === 0 && (
                    <p className="text-sm text-slate-500">Няма корекции. Всички имоти ще използват базовата цена.</p>
                )}
                {settings.floor_corrections.length > 0 && (
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-slate-500 border-b">
                                <th className="text-left py-2">Етаж</th>
                                <th className="text-left py-2">€/м² (без ДДС)</th>
                                <th className="text-right py-2 w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {settings.floor_corrections.map((fc, idx) => (
                                <tr key={idx} className="border-b hairline last:border-0">
                                    <td className="py-2 pr-2">
                                        <Select
                                            value={String(fc.floor)}
                                            onValueChange={(v) => updateFloorCorrection(idx, "floor", v)}
                                        >
                                            <SelectTrigger className="w-40" data-testid={`floor-correction-floor-${idx}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FLOOR_OPTIONS.map((f) => (
                                                    <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="py-2 pr-2">
                                        <Input
                                            type="number"
                                            step="10"
                                            value={fc.price_per_sqm}
                                            onChange={(e) => updateFloorCorrection(idx, "price_per_sqm", e.target.value)}
                                            className="w-32"
                                            data-testid={`floor-correction-ppm-${idx}`}
                                        />
                                    </td>
                                    <td className="py-2 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => removeFloorCorrection(idx)}
                                            data-testid={`floor-correction-remove-${idx}`}
                                        >
                                            <Trash2 className="w-4 h-4 text-rose-500" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="border hairline rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium">Override за типове (non-апартамент)</h4>
                    <Button size="sm" variant="outline" onClick={addTypeOverride} data-testid="add-type-override">
                        <Plus className="w-4 h-4 mr-1" /> Добави тип
                    </Button>
                </div>
                {settings.type_overrides.length === 0 && (
                    <p className="text-sm text-slate-500">Няма override-и. Гаражи, паркинги, складове ще използват базовата цена.</p>
                )}
                {settings.type_overrides.length > 0 && (
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs text-slate-500 border-b">
                                <th className="text-left py-2">Тип</th>
                                <th className="text-left py-2">€/м² (без ДДС)</th>
                                <th className="text-right py-2 w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {settings.type_overrides.map((to, idx) => (
                                <tr key={idx} className="border-b hairline last:border-0">
                                    <td className="py-2 pr-2">
                                        <Select
                                            value={to.property_type}
                                            onValueChange={(v) => updateTypeOverride(idx, "property_type", v)}
                                        >
                                            <SelectTrigger className="w-48" data-testid={`type-override-type-${idx}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PROPERTY_TYPES.map((t) => (
                                                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="py-2 pr-2">
                                        <Input
                                            type="number"
                                            step="10"
                                            value={to.price_per_sqm}
                                            onChange={(e) => updateTypeOverride(idx, "price_per_sqm", e.target.value)}
                                            className="w-32"
                                            data-testid={`type-override-ppm-${idx}`}
                                        />
                                    </td>
                                    <td className="py-2 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => removeTypeOverride(idx)}
                                            data-testid={`type-override-remove-${idx}`}
                                        >
                                            <Trash2 className="w-4 h-4 text-rose-500" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="flex items-center justify-between border-t hairline pt-4">
                <div>
                    <Button
                        variant="outline"
                        onClick={previewRecalc}
                        disabled={recalcLoading || saving}
                        data-testid="pricing-preview-recalc"
                    >
                        <Calculator className="w-4 h-4 mr-2" />
                        Преглед на recalc
                    </Button>
                    <p className="text-xs text-slate-500 mt-1">Преcмята цените според настройките (без save)</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    data-testid="pricing-save"
                >
                    {saving ? "Запазване…" : "Запази настройките"}
                </Button>
            </div>

            <Dialog open={recalcDialogOpen} onOpenChange={setRecalcDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="pricing-recalc-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Преглед на recalc</DialogTitle>
                        <DialogDescription>Apply за да приложиш промените.</DialogDescription>
                    </DialogHeader>
                    {recalcDryRun && (
                        <>
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div className="bg-stone-50 p-3 rounded">
                                    <div className="text-xs text-slate-500">Общо</div>
                                    <div className="text-2xl font-semibold" data-testid="recalc-total-count">{recalcDryRun.total_properties}</div>
                                </div>
                                <div className="bg-emerald-50 p-3 rounded">
                                    <div className="text-xs text-emerald-700">Updated</div>
                                    <div className="text-2xl font-semibold text-emerald-700" data-testid="recalc-updated-count">{recalcDryRun.updated_count}</div>
                                </div>
                                <div className="bg-amber-50 p-3 rounded">
                                    <div className="text-xs text-amber-700">Skipped</div>
                                    <div className="text-2xl font-semibold text-amber-700" data-testid="recalc-skipped-count">{recalcDryRun.skipped_count}</div>
                                </div>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-500 border-b">
                                        <th className="text-left py-2">Код</th>
                                        <th className="text-left py-2">Тип</th>
                                        <th className="text-right py-2">Стара</th>
                                        <th className="text-right py-2">Нова</th>
                                        <th className="text-right py-2">Δ</th>
                                        <th className="text-left py-2 pl-2">Source</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recalcDryRun.items.map((it) => (
                                        <tr key={it.code} className={`border-b hairline ${it.skipped ? "opacity-50" : ""}`}>
                                            <td className="py-1.5 font-mono">{it.code}</td>
                                            <td className="py-1.5">{it.property_type}</td>
                                            <td className="py-1.5 text-right">{it.old_list_price ? currency(it.old_list_price) : "—"}</td>
                                            <td className="py-1.5 text-right font-medium">{it.new_list_price ? currency(it.new_list_price) : "—"}</td>
                                            <td className={`py-1.5 text-right ${it.delta > 0 ? "text-rose-600" : it.delta < 0 ? "text-emerald-600" : ""}`}>
                                                {it.delta != null ? `${it.delta > 0 ? "+" : ""}${currency(it.delta)}` : "—"}
                                            </td>
                                            <td className="py-1.5 pl-2 text-xs text-slate-500">{it.skip_reason || it.used_pricing_source}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRecalcDialogOpen(false)}>Отказ</Button>
                        <Button
                            onClick={applyRecalc}
                            disabled={recalcLoading}
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                            data-testid="pricing-apply-recalc"
                        >
                            {recalcLoading ? "Прилагане…" : "Приложи recalc"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
