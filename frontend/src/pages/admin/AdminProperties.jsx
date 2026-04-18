import React, { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import {
    PROPERTY_TYPE_LABELS,
    PROPERTY_TYPE_FILTERS,
    PROPERTY_STATUS,
} from "../../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
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
import { toast } from "sonner";

const NUMERIC_FIELDS = [
    "floor", "rooms",
    "area_pure", "area_common", "area_total", "ideal_parts_area", "raw_area",
    "price_per_sqm", "base_price", "list_price", "negotiated_price",
    "reservation_price", "final_contract_price",
];

function toForm(p) {
    return {
        code: p.code || "",
        property_type: p.property_type || "apartment",
        floor: p.floor ?? "",
        rooms: p.rooms ?? "",
        exposure: p.exposure || "",
        area_pure: p.area_pure ?? "",
        area_common: p.area_common ?? "",
        area_total: p.area_total ?? "",
        ideal_parts_area: p.ideal_parts_area ?? "",
        raw_area: p.raw_area ?? "",
        price_per_sqm: p.price_per_sqm ?? "",
        base_price: p.base_price ?? "",
        list_price: p.list_price ?? "",
        negotiated_price: p.negotiated_price ?? "",
        reservation_price: p.reservation_price ?? "",
        final_contract_price: p.final_contract_price ?? "",
        description: p.description || "",
        plan_url: p.plan_url || "",
        gallery: (p.gallery || []).join("\n"),
        status: p.status || "available",
        buyer_id: p.buyer_id || "__none__",
        admin_notes: p.admin_notes || "",
    };
}

function toPayload(form) {
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const out = {
        code: form.code.trim(),
        property_type: form.property_type,
        exposure: form.exposure || null,
        description: form.description,
        plan_url: form.plan_url || null,
        gallery: form.gallery.split("\n").map((s) => s.trim()).filter(Boolean),
        status: form.status,
        buyer_id: form.buyer_id && form.buyer_id !== "__none__" ? form.buyer_id : null,
        admin_notes: form.admin_notes,
    };
    for (const f of NUMERIC_FIELDS) out[f] = num(form[f]);
    return out;
}

export default function AdminProperties() {
    const [projects, setProjects] = useState([]);
    const [buyers, setBuyers] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [floorFilter, setFloorFilter] = useState("all");
    const [props, setProps] = useState([]);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null); // property being edited
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get("/projects").then((r) => {
            setProjects(r.data);
            const primary = r.data.find((p) => p.is_primary) || r.data[0];
            if (primary) setProjectId(primary.id);
        });
        api.get("/buyers").then((r) => setBuyers(r.data)).catch(() => {});
    }, []);

    const load = (pid) => {
        if (!pid) return;
        api.get(`/projects/${pid}/properties`).then((r) => setProps(r.data));
    };
    useEffect(() => { load(projectId); }, [projectId]);

    const floors = useMemo(() => {
        const set = new Set(props.map((p) => p.floor));
        return [...set].sort((a, b) => b - a);
    }, [props]);

    const filtered = useMemo(() => {
        return props.filter((p) =>
            (typeFilter === "all" || p.property_type === typeFilter) &&
            (statusFilter === "all" || p.status === statusFilter) &&
            (floorFilter === "all" || String(p.floor) === floorFilter)
        );
    }, [props, typeFilter, statusFilter, floorFilter]);

    const buyerById = useMemo(() => {
        const m = {};
        buyers.forEach((b) => { m[b.id] = b; });
        return m;
    }, [buyers]);

    const changeStatus = async (property, newStatus) => {
        try {
            await api.patch(`/properties/${property.id}/status`, { status: newStatus });
            toast.success(`Статусът на ${property.code} е променен`);
            load(projectId);
        } catch (e) {
            toast.error("Грешка при промяна на статус");
        }
    };

    const openEdit = (p) => {
        setEditing(p);
        setForm(toForm(p));
        setDialogOpen(true);
    };

    const set = (k) => (e) => {
        const v = e && e.target ? e.target.value : e;
        setForm((f) => ({ ...f, [k]: v }));
    };

    const submit = async () => {
        setSaving(true);
        try {
            await api.patch(`/properties/${editing.id}`, toPayload(form));
            toast.success(`Обектът ${form.code} е обновен`);
            setDialogOpen(false);
            load(projectId);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Инвентар</div>
                <h1 className="font-serif text-4xl text-slate-900">Каталог на обектите</h1>
                <p className="text-sm text-slate-500 mt-2">
                    Купувачите и ownership данните са видими само в админ панела — никога публично.
                </p>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
                <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="w-72" data-testid="admin-select-project">
                        <SelectValue placeholder="Проект" />
                    </SelectTrigger>
                    <SelectContent>
                        {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-48" data-testid="admin-filter-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички типове</SelectItem>
                        {PROPERTY_TYPE_FILTERS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={floorFilter} onValueChange={setFloorFilter}>
                    <SelectTrigger className="w-40" data-testid="admin-filter-floor"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички етажи</SelectItem>
                        {floors.map((f) => (
                            <SelectItem key={f} value={String(f)}>
                                {Number(f) > 0 ? `Етаж ${f}` : Number(f) === 0 ? "Партер" : "Сутерен"}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-56" data-testid="admin-filter-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Всички статуси</SelectItem>
                        {Object.keys(PROPERTY_STATUS).map((s) => (
                            <SelectItem key={s} value={s}>{PROPERTY_STATUS[s].label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="ml-auto text-sm text-slate-500">{filtered.length} от {props.length}</div>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Код</th>
                            <th className="text-left p-3 font-medium">Тип</th>
                            <th className="text-left p-3 font-medium">Етаж</th>
                            <th className="text-right p-3 font-medium">Площ</th>
                            <th className="text-right p-3 font-medium">Базова</th>
                            <th className="text-right p-3 font-medium">Листова</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Купувач (admin)</th>
                            <th className="text-left p-3 font-medium">Бележки</th>
                            <th className="text-left p-3 font-medium">Inline status</th>
                            <th className="text-right p-3 font-medium">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => {
                            const buyer = p.buyer_id ? buyerById[p.buyer_id] : null;
                            return (
                                <tr key={p.id} className="border-t hairline align-top" data-testid={`admin-property-row-${p.code}`}>
                                    <td className="p-3 font-mono font-medium whitespace-nowrap">{p.code}</td>
                                    <td className="p-3 text-slate-600 whitespace-nowrap">{PROPERTY_TYPE_LABELS[p.property_type]}</td>
                                    <td className="p-3 text-slate-600">{p.floor}</td>
                                    <td className="p-3 text-right whitespace-nowrap">{p.area_total ? `${p.area_total} м²` : "—"}</td>
                                    <td className="p-3 text-right whitespace-nowrap">{p.base_price ? currency(p.base_price) : "—"}</td>
                                    <td className="p-3 text-right font-medium whitespace-nowrap">{p.list_price ? currency(p.list_price) : "—"}</td>
                                    <td className="p-3"><StatusBadge status={p.status} /></td>
                                    <td className="p-3 text-slate-700 whitespace-nowrap">
                                        {buyer ? (
                                            <div>
                                                <div className="font-medium text-slate-900">{buyer.name}</div>
                                                <div className="text-xs text-slate-500">{buyer.relation}</div>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-xs text-slate-500 max-w-xs">
                                        {p.admin_notes || <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="p-3">
                                        <Select value={p.status} onValueChange={(v) => changeStatus(p, v)}>
                                            <SelectTrigger className="h-8 w-40" data-testid={`admin-set-status-${p.code}`}><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Object.keys(PROPERTY_STATUS).map((s) => (
                                                    <SelectItem key={s} value={s}>{PROPERTY_STATUS[s].label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="p-3 text-right">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openEdit(p)}
                                            data-testid={`admin-edit-property-${p.code}`}
                                        >
                                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Редакция
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={11}>Няма обекти с избраните филтри.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="property-edit-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            Редакция · {editing?.code}
                        </DialogTitle>
                        <DialogDescription>
                            Промените се записват веднага. Source ref, project и building не могат да се променят в този екран.
                        </DialogDescription>
                    </DialogHeader>

                    {form && (
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <Label>Код</Label>
                                    <Input value={form.code} onChange={set("code")} data-testid="pf-code" />
                                </div>
                                <div>
                                    <Label>Тип</Label>
                                    <Select value={form.property_type} onValueChange={set("property_type")}>
                                        <SelectTrigger data-testid="pf-type"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                                                <SelectItem key={k} value={k}>{v}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Етаж</Label>
                                    <Input type="number" value={form.floor} onChange={set("floor")} data-testid="pf-floor" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <Label>Стаи</Label>
                                    <Input type="number" min="0" value={form.rooms} onChange={set("rooms")} data-testid="pf-rooms" />
                                </div>
                                <div>
                                    <Label>Изложение</Label>
                                    <Input value={form.exposure} onChange={set("exposure")} data-testid="pf-exposure" />
                                </div>
                                <div>
                                    <Label>Статус</Label>
                                    <Select value={form.status} onValueChange={set("status")}>
                                        <SelectTrigger data-testid="pf-status"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {Object.keys(PROPERTY_STATUS).map((s) => (
                                                <SelectItem key={s} value={s}>{PROPERTY_STATUS[s].label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <NumInput label="Чиста площ" value={form.area_pure} onChange={set("area_pure")} testId="pf-area-pure" />
                                <NumInput label="Общи части" value={form.area_common} onChange={set("area_common")} testId="pf-area-common" />
                                <NumInput label="Обща площ" value={form.area_total} onChange={set("area_total")} testId="pf-area-total" />
                                <NumInput label="Идеални части" value={form.ideal_parts_area} onChange={set("ideal_parts_area")} testId="pf-ideal" />
                                <NumInput label="Груба площ" value={form.raw_area} onChange={set("raw_area")} testId="pf-raw" />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <NumInput label="Цена / м²" value={form.price_per_sqm} onChange={set("price_per_sqm")} testId="pf-pps" />
                                <NumInput label="Базова цена" value={form.base_price} onChange={set("base_price")} testId="pf-base" />
                                <NumInput label="Листова цена" value={form.list_price} onChange={set("list_price")} testId="pf-list" />
                                <NumInput label="Договорена" value={form.negotiated_price} onChange={set("negotiated_price")} testId="pf-neg" />
                                <NumInput label="Резервационна" value={form.reservation_price} onChange={set("reservation_price")} testId="pf-res-price" />
                                <NumInput label="Финална" value={form.final_contract_price} onChange={set("final_contract_price")} testId="pf-final" />
                            </div>

                            <div>
                                <Label>Описание</Label>
                                <Textarea rows={3} value={form.description} onChange={set("description")} data-testid="pf-description" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label>Plan URL</Label>
                                    <Input value={form.plan_url} onChange={set("plan_url")} placeholder="https://…" data-testid="pf-plan" />
                                </div>
                                <div>
                                    <Label>Купувач (admin)</Label>
                                    <Select value={form.buyer_id} onValueChange={set("buyer_id")}>
                                        <SelectTrigger data-testid="pf-buyer"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">— без купувач —</SelectItem>
                                            {buyers.map((b) => (
                                                <SelectItem key={b.id} value={b.id}>{b.name} · {b.relation}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <Label>Галерия (по 1 URL на ред)</Label>
                                <Textarea rows={3} value={form.gallery} onChange={set("gallery")} data-testid="pf-gallery" />
                            </div>

                            <div>
                                <Label>Admin бележки (не се показват публично)</Label>
                                <Textarea rows={2} value={form.admin_notes} onChange={set("admin_notes")} data-testid="pf-admin-notes" />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} data-testid="pf-cancel">
                            Отказ
                        </Button>
                        <Button onClick={submit} disabled={saving} data-testid="pf-save" className="bg-slate-900 hover:bg-slate-800 text-white">
                            {saving ? "Запазване…" : "Запази"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function NumInput({ label, value, onChange, testId }) {
    return (
        <div>
            <Label className="text-xs">{label}</Label>
            <Input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={onChange}
                data-testid={testId}
            />
        </div>
    );
}
