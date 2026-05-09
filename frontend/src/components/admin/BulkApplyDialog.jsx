import React, { useMemo, useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { currency } from "../../lib/api";
import { PROPERTY_TYPE_LABELS, floorLabel } from "../../lib/constants";

const NON_EDITABLE_STATUSES = new Set(["sold"]);

/**
 * BulkApplyDialog — задава нова цена/м² на множество имоти.
 * Филтри: тип, етаж, статус. Preview показва текущ vs нов list_price.
 */
const BulkApplyDialog = ({ open, onOpenChange, properties = [], onApply }) => {
    const [typeFilter, setTypeFilter] = useState("all");
    const [floorFilter, setFloorFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("available");
    const [ppm, setPpm] = useState("");
    const [excludeSold, setExcludeSold] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setTypeFilter("all");
        setFloorFilter("all");
        setStatusFilter("available");
        setPpm("");
        setExcludeSold(true);
    };

    const types = useMemo(() => {
        const s = new Set();
        properties.forEach((p) => p.property_type && s.add(p.property_type));
        return Array.from(s);
    }, [properties]);

    const floors = useMemo(() => {
        const s = new Set();
        properties.forEach((p) => {
            if (p.floor != null) s.add(Number(p.floor));
        });
        return Array.from(s).sort((a, b) => a - b);
    }, [properties]);

    const filtered = useMemo(() => {
        const ppmNum = Number((ppm || "").toString().replace(",", "."));
        const valid = !isNaN(ppmNum) && ppmNum > 0;
        if (!valid) return [];
        return properties
            .filter((p) => {
                if (excludeSold && NON_EDITABLE_STATUSES.has(p.status)) return false;
                if (typeFilter !== "all" && p.property_type !== typeFilter) return false;
                if (floorFilter !== "all" && Number(p.floor) !== Number(floorFilter)) return false;
                if (statusFilter !== "all" && p.status !== statusFilter) return false;
                if (!p.area_total) return false;
                return true;
            })
            .map((p) => {
                const newList = Math.round(ppmNum * Number(p.area_total) * 100) / 100;
                return {
                    code: p.code,
                    property_type: p.property_type,
                    floor: p.floor,
                    area_total: p.area_total,
                    old_list: p.list_price || 0,
                    new_list: newList,
                    status: p.status,
                };
            });
    }, [properties, ppm, typeFilter, floorFilter, statusFilter, excludeSold]);

    const totalNew = useMemo(
        () => filtered.reduce((s, r) => s + (r.new_list || 0), 0),
        [filtered]
    );
    const totalOld = useMemo(
        () => filtered.reduce((s, r) => s + (r.old_list || 0), 0),
        [filtered]
    );

    const ppmNum = Number((ppm || "").toString().replace(",", "."));
    const ppmValid = !isNaN(ppmNum) && ppmNum > 0;

    const handleApply = async () => {
        if (!ppmValid || filtered.length === 0) return;
        try {
            setSubmitting(true);
            await onApply(filtered, ppmNum);
            reset();
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenChange = (next) => {
        if (!next) reset();
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="max-w-3xl max-h-[92vh] overflow-y-auto"
                data-testid="bulk-apply-dialog"
            >
                <DialogHeader>
                    <DialogTitle className="font-serif text-2xl">
                        Bulk прилагане на цена/м²
                    </DialogTitle>
                    <DialogDescription>
                        Изберете филтри и нова цена на квадратен метър. Прегледайте
                        промяната преди да приложите. Цените са <strong>без ДДС</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <Label>Тип имот</Label>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger data-testid="bulk-filter-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Всички</SelectItem>
                                    {types.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {PROPERTY_TYPE_LABELS[t] || t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Етаж</Label>
                            <Select value={floorFilter} onValueChange={setFloorFilter}>
                                <SelectTrigger data-testid="bulk-filter-floor">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Всички</SelectItem>
                                    {floors.map((f) => (
                                        <SelectItem key={f} value={String(f)}>
                                            {floorLabel(f)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Статус</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger data-testid="bulk-filter-status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Всички</SelectItem>
                                    <SelectItem value="available">Свободен</SelectItem>
                                    <SelectItem value="reserved">Резервиран</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="sm:col-span-2">
                            <Label>Нова цена €/м² (без ДДС)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={ppm}
                                onChange={(e) => setPpm(e.target.value)}
                                placeholder="напр. 2400"
                                data-testid="bulk-ppm-input"
                            />
                        </div>
                        <div className="flex items-center gap-2 pb-2">
                            <Checkbox
                                id="exclude-sold"
                                checked={excludeSold}
                                onCheckedChange={(v) => setExcludeSold(!!v)}
                                data-testid="bulk-exclude-sold"
                            />
                            <Label
                                htmlFor="exclude-sold"
                                className="cursor-pointer text-sm"
                            >
                                Изключи продадените
                            </Label>
                        </div>
                    </div>

                    {!ppmValid && (
                        <div className="rounded-md border hairline bg-stone-50 p-4 text-sm text-slate-500">
                            Въведете валидна цена/м², за да видите preview.
                        </div>
                    )}

                    {ppmValid && (
                        <div
                            className="rounded-md border hairline overflow-hidden"
                            data-testid="bulk-preview"
                        >
                            <div className="bg-stone-50 px-4 py-2 text-xs text-slate-500 flex justify-between">
                                <span>
                                    Preview · {filtered.length}{" "}
                                    {filtered.length === 1 ? "обект" : "обекта"}
                                </span>
                                <span>
                                    Δ общо:{" "}
                                    <strong className="text-slate-900">
                                        {currency(totalNew - totalOld)}
                                    </strong>
                                </span>
                            </div>
                            <div className="max-h-72 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white text-slate-500">
                                        <tr>
                                            <th className="text-left p-2 font-medium">Код</th>
                                            <th className="text-left p-2 font-medium">Тип</th>
                                            <th className="text-left p-2 font-medium">Етаж</th>
                                            <th className="text-right p-2 font-medium">м²</th>
                                            <th className="text-right p-2 font-medium">Стара</th>
                                            <th className="text-right p-2 font-medium">Нова</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((r) => (
                                            <tr
                                                key={r.code}
                                                className="border-t hairline"
                                                data-testid={`bulk-preview-row-${r.code}`}
                                            >
                                                <td className="p-2 font-mono">{r.code}</td>
                                                <td className="p-2 text-slate-600">
                                                    {PROPERTY_TYPE_LABELS[r.property_type] ||
                                                        r.property_type}
                                                </td>
                                                <td className="p-2 text-slate-600">
                                                    {floorLabel(r.floor)}
                                                </td>
                                                <td className="p-2 text-right tabular-nums">
                                                    {r.area_total}
                                                </td>
                                                <td className="p-2 text-right tabular-nums text-slate-500">
                                                    {r.old_list ? currency(r.old_list) : "—"}
                                                </td>
                                                <td className="p-2 text-right tabular-nums font-medium">
                                                    {currency(r.new_list)}
                                                </td>
                                            </tr>
                                        ))}
                                        {filtered.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="p-4 text-sm text-slate-500"
                                                >
                                                    Няма имоти с тези филтри (или липсва площ
                                                    F1+F2).
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => handleOpenChange(false)}
                        disabled={submitting}
                        data-testid="bulk-cancel-btn"
                    >
                        Отказ
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={!ppmValid || filtered.length === 0 || submitting}
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                        data-testid="bulk-apply-confirm-btn"
                    >
                        {submitting
                            ? "Прилагане…"
                            : `Приложи на ${filtered.length} ${
                                  filtered.length === 1 ? "обект" : "обекта"
                              }`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default BulkApplyDialog;
