import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, CalendarPlus, Trash2, AlertTriangle } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
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
        project_id: p.project_id || "",
        building_id: p.building_id || "__none__",
    };
}

const EMPTY_PROP_FORM = {
    code: "", property_type: "apartment", floor: 0, rooms: "", exposure: "",
    area_pure: "", area_common: "", area_total: "", ideal_parts_area: "", raw_area: "",
    price_per_sqm: "", base_price: "", list_price: "",
    negotiated_price: "", reservation_price: "", final_contract_price: "",
    description: "", plan_url: "", gallery: "",
    status: "available", buyer_id: "__none__", admin_notes: "",
    project_id: "", building_id: "__none__",
};

function toPayload(form, { includeProject = false } = {}) {
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
    if (includeProject) {
        out.project_id = form.project_id;
        out.building_id =
            form.building_id && form.building_id !== "__none__" ? form.building_id : null;
    }
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
    const [mode, setMode] = useState("edit"); // "edit" | "create"
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [buildings, setBuildings] = useState([]);

    // Reserve-from-property dialog state
    const [reserveOpen, setReserveOpen] = useState(false);
    const [reserveTarget, setReserveTarget] = useState(null);
    const [clients, setClients] = useState([]);
    const [reserveForm, setReserveForm] = useState({
        client_id: "",
        reservation_type: "zero_deposit",
        amount: "",
        notes: "",
    });
    const [reserving, setReserving] = useState(false);

    useEffect(() => {
        api.get("/projects").then((r) => {
            setProjects(r.data);
            const primary = r.data.find((p) => p.is_primary) || r.data[0];
            if (primary) setProjectId(primary.id);
        });
        api.get("/buyers").then((r) => setBuyers(r.data)).catch(() => {});
        api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    }, []);

    const load = (pid) => {
        if (!pid) return;
        api.get(`/projects/${pid}/properties`).then((r) => setProps(r.data));
    };
    useEffect(() => { load(projectId); }, [projectId]);

    // buildings for the form's currently selected project
    const formProjectId = form?.project_id || projectId;
    useEffect(() => {
        if (!formProjectId) { setBuildings([]); return; }
        api.get(`/projects/${formProjectId}`)
            .then((r) => setBuildings(r.data.buildings || []))
            .catch(() => setBuildings([]));
    }, [formProjectId]);

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
        setMode("edit");
        setEditing(p);
        setForm(toForm(p));
        setDialogOpen(true);
    };

    const openCreate = () => {
        setMode("create");
        setEditing(null);
        setForm({ ...EMPTY_PROP_FORM, project_id: projectId || "" });
        setDialogOpen(true);
    };

    const set = (k) => (e) => {
        const v = e && e.target ? e.target.value : e;
        setForm((f) => {
            const next = { ...f, [k]: v };
            if (k === "project_id" && mode === "create") {
                next.building_id = "__none__";
                next.buyer_id = "__none__";
            }
            return next;
        });
    };

    const submit = async () => {
        setSaving(true);
        try {
            if (mode === "edit") {
                await api.patch(`/properties/${editing.id}`, toPayload(form));
                toast.success(`Обектът ${form.code} е обновен`);
            } else {
                if (!form.project_id) {
                    toast.error("Моля, изберете проект");
                    setSaving(false);
                    return;
                }
                const created = await api.post("/properties", toPayload(form, { includeProject: true }));
                toast.success(`Обектът ${created.data.code} е създаден`);
                if (created.data.project_id !== projectId) {
                    setProjectId(created.data.project_id);
                }
            }
            setDialogOpen(false);
            load(mode === "create" ? form.project_id : projectId);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    const openReserve = (p) => {
        setReserveTarget(p);
        setReserveForm({ client_id: "", reservation_type: "zero_deposit", amount: "", notes: "" });
        setReserveOpen(true);
    };

    const setR = (k) => (e) => {
        const v = e && e.target ? e.target.value : e;
        setReserveForm((f) => ({ ...f, [k]: v }));
    };

    const submitReserve = async () => {
        if (!reserveTarget) return;
        if (!reserveForm.client_id) {
            toast.error("Моля, изберете клиент");
            return;
        }
        if (reserveForm.reservation_type === "deposit") {
            const amt = Number(reserveForm.amount);
            if (!amt || amt <= 0) {
                toast.error("Сумата за капаро трябва да е > 0");
                return;
            }
        }
        setReserving(true);
        try {
            const payload = {
                property_id: reserveTarget.id,
                client_id: reserveForm.client_id,
                reservation_type: reserveForm.reservation_type,
                notes: reserveForm.notes || "",
            };
            if (reserveForm.reservation_type === "deposit") {
                payload.amount = Number(reserveForm.amount);
            }
            await api.post("/reservations", payload);
            toast.success(`Обектът ${reserveTarget.code} е резервиран`);
            setReserveOpen(false);
            load(projectId);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setReserving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="overline mb-2">Инвентар</div>
                    <h1 className="font-serif text-4xl text-slate-900">Каталог на обектите</h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Купувачите и ownership данните са видими само в админ панела — никога публично.
                    </p>
                </div>
                <Button
                    onClick={openCreate}
                    data-testid="admin-new-property-btn"
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                    <Plus className="h-4 w-4 mr-2" /> Нов обект
                </Button>
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
                                        <div className="flex justify-end gap-2">
                                            {p.status === "available" && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => openReserve(p)}
                                                    data-testid={`admin-reserve-property-${p.code}`}
                                                    className="bg-slate-900 hover:bg-slate-800 text-white"
                                                >
                                                    <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Резервирай
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => openEdit(p)}
                                                data-testid={`admin-edit-property-${p.code}`}
                                            >
                                                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Редакция
                                            </Button>
                                        </div>
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
                            {mode === "create" ? "Нов обект" : `Редакция · ${editing?.code}`}
                        </DialogTitle>
                        <DialogDescription>
                            {mode === "create"
                                ? "Попълнете основните полета. source_ref остава празен за ръчно създадени обекти."
                                : "Промените се записват веднага. Source ref, project и building не могат да се променят в този екран."}
                        </DialogDescription>
                    </DialogHeader>

                    {form && (
                        <div className="space-y-4 py-2">
                            {mode === "edit" ? (
                                <Tabs defaultValue="basics" className="w-full">
                                    <TabsList className="grid grid-cols-2 w-full" data-testid="pf-tabs">
                                        <TabsTrigger value="basics" data-testid="pf-tab-basics">Основни данни</TabsTrigger>
                                        <TabsTrigger value="finance" data-testid="pf-tab-finance">Сделка / Плащания</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="basics" className="space-y-4 pt-4">
                                        <PropertyFormBody form={form} setField={set} buyers={buyers} mode={mode} projects={projects} buildings={buildings} />
                                    </TabsContent>
                                    <TabsContent value="finance" className="pt-4">
                                        {editing?.id && (
                                            <FinanceSection propertyId={editing.id} buyers={buyers} />
                                        )}
                                    </TabsContent>
                                </Tabs>
                            ) : (
                                <PropertyFormBody form={form} setField={set} buyers={buyers} mode={mode} projects={projects} buildings={buildings} />
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} data-testid="pf-cancel">
                            Отказ
                        </Button>
                        <Button onClick={submit} disabled={saving} data-testid="pf-save" className="bg-slate-900 hover:bg-slate-800 text-white">
                            {saving ? "Запазване…" : mode === "create" ? "Създай" : "Запази"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
                <DialogContent className="max-w-lg" data-testid="property-reserve-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            Резервация · {reserveTarget?.code}
                        </DialogTitle>
                        <DialogDescription>
                            Резервирайте обекта за клиент. При „Капаро 0“ се задава 7-дневен срок без сума.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <Label>Клиент <span className="text-red-600">*</span></Label>
                            <Select value={reserveForm.client_id} onValueChange={setR("client_id")}>
                                <SelectTrigger data-testid="reserve-client"><SelectValue placeholder="Изберете клиент" /></SelectTrigger>
                                <SelectContent>
                                    {clients.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name || c.email} · {c.email}
                                        </SelectItem>
                                    ))}
                                    {clients.length === 0 && (
                                        <div className="p-3 text-sm text-slate-500">Няма регистрирани клиенти</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label>Тип резервация</Label>
                                <Select value={reserveForm.reservation_type} onValueChange={setR("reservation_type")}>
                                    <SelectTrigger data-testid="reserve-type"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="zero_deposit">Капаро 0</SelectItem>
                                        <SelectItem value="deposit">Капаро</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>
                                    Сума (лв.)
                                    {reserveForm.reservation_type === "deposit" && (
                                        <span className="text-red-600"> *</span>
                                    )}
                                </Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    disabled={reserveForm.reservation_type === "zero_deposit"}
                                    value={reserveForm.amount}
                                    onChange={setR("amount")}
                                    placeholder={reserveForm.reservation_type === "zero_deposit" ? "0 (не се изисква)" : "напр. 2000"}
                                    data-testid="reserve-amount"
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Бележки</Label>
                            <Textarea rows={3} value={reserveForm.notes} onChange={setR("notes")} data-testid="reserve-notes" />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReserveOpen(false)} disabled={reserving} data-testid="reserve-cancel">
                            Отказ
                        </Button>
                        <Button onClick={submitReserve} disabled={reserving} data-testid="reserve-save" className="bg-slate-900 hover:bg-slate-800 text-white">
                            {reserving ? "Записване…" : "Резервирай"}
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

function PropertyFormBody({ form, setField, buyers, mode, projects, buildings }) {
    return (
        <>
            {mode === "create" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border hairline bg-stone-50 p-3">
                    <div>
                        <Label>Проект <span className="text-red-600">*</span></Label>
                        <Select value={form.project_id} onValueChange={setField("project_id")}>
                            <SelectTrigger data-testid="pf-project"><SelectValue placeholder="Изберете проект" /></SelectTrigger>
                            <SelectContent>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Сграда (optional)</Label>
                        <Select value={form.building_id} onValueChange={setField("building_id")}>
                            <SelectTrigger data-testid="pf-building"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">— без сграда —</SelectItem>
                                {buildings.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <Label>Код</Label>
                    <Input value={form.code} onChange={setField("code")} data-testid="pf-code" />
                </div>
                <div>
                    <Label>Тип</Label>
                    <Select value={form.property_type} onValueChange={setField("property_type")}>
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
                    <Input type="number" value={form.floor} onChange={setField("floor")} data-testid="pf-floor" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <Label>Стаи</Label>
                    <Input type="number" min="0" value={form.rooms} onChange={setField("rooms")} data-testid="pf-rooms" />
                </div>
                <div>
                    <Label>Изложение</Label>
                    <Input value={form.exposure} onChange={setField("exposure")} data-testid="pf-exposure" />
                </div>
                <div>
                    <Label>Статус</Label>
                    <Select value={form.status} onValueChange={setField("status")}>
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
                <NumInput label="Чиста площ" value={form.area_pure} onChange={setField("area_pure")} testId="pf-area-pure" />
                <NumInput label="Общи части" value={form.area_common} onChange={setField("area_common")} testId="pf-area-common" />
                <NumInput label="Обща площ" value={form.area_total} onChange={setField("area_total")} testId="pf-area-total" />
                <NumInput label="Идеални части" value={form.ideal_parts_area} onChange={setField("ideal_parts_area")} testId="pf-ideal" />
                <NumInput label="Груба площ" value={form.raw_area} onChange={setField("raw_area")} testId="pf-raw" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <NumInput label="Цена / м²" value={form.price_per_sqm} onChange={setField("price_per_sqm")} testId="pf-pps" />
                <NumInput label="Базова цена" value={form.base_price} onChange={setField("base_price")} testId="pf-base" />
                <NumInput label="Листова цена" value={form.list_price} onChange={setField("list_price")} testId="pf-list" />
                <NumInput label="Договорена" value={form.negotiated_price} onChange={setField("negotiated_price")} testId="pf-neg" />
                <NumInput label="Резервационна" value={form.reservation_price} onChange={setField("reservation_price")} testId="pf-res-price" />
                <NumInput label="Финална" value={form.final_contract_price} onChange={setField("final_contract_price")} testId="pf-final" />
            </div>

            <div>
                <Label>Описание</Label>
                <Textarea rows={3} value={form.description} onChange={setField("description")} data-testid="pf-description" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label>Plan URL</Label>
                    <Input value={form.plan_url} onChange={setField("plan_url")} placeholder="https://…" data-testid="pf-plan" />
                </div>
                <div>
                    <Label>Купувач (admin)</Label>
                    <Select value={form.buyer_id} onValueChange={setField("buyer_id")}>
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
                <Textarea rows={3} value={form.gallery} onChange={setField("gallery")} data-testid="pf-gallery" />
            </div>

            <div>
                <Label>Admin бележки (не се показват публично)</Label>
                <Textarea rows={2} value={form.admin_notes} onChange={setField("admin_notes")} data-testid="pf-admin-notes" />
            </div>
        </>
    );
}

const EMPTY_PLAN = {
    buyer_id: "__none__",
    final_contract_price: "",
    deposit_amount: "",
    payment_scheme_name: "",
    installments: [],
};
const EMPTY_PAYMENT = { amount: "", paid_at: new Date().toISOString().slice(0, 10), note: "" };

function formatBgDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("bg-BG");
}

function FinanceSection({ propertyId, buyers }) {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [plan, setPlan] = useState(EMPTY_PLAN);
    const [savingPlan, setSavingPlan] = useState(false);
    const [payment, setPayment] = useState(EMPTY_PAYMENT);
    const [savingPayment, setSavingPayment] = useState(false);

    const loadSummary = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/properties/${propertyId}/finance-summary`);
            setSummary(data);
            setPlan({
                buyer_id: data.buyer_id || "__none__",
                final_contract_price: data.final_contract_price || "",
                deposit_amount: data.deposit_amount || "",
                payment_scheme_name: data.payment_scheme_name || "",
                installments: (data.installments || []).map((i) => ({
                    number: i.number,
                    label: i.label || "",
                    due_date: (i.due_date || "").slice(0, 10),
                    amount: i.amount ?? "",
                    status: i.status || "предстоящо",
                })),
            });
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (propertyId) loadSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propertyId]);

    const updateInstallment = (idx, field, value) => {
        setPlan((prev) => {
            const next = { ...prev, installments: [...prev.installments] };
            next.installments[idx] = { ...next.installments[idx], [field]: value };
            return next;
        });
    };
    const addInstallment = () => {
        setPlan((prev) => ({
            ...prev,
            installments: [
                ...prev.installments,
                {
                    number: prev.installments.length + 1,
                    label: "",
                    due_date: "",
                    amount: "",
                    status: "предстоящо",
                },
            ],
        }));
    };
    const removeInstallment = (idx) => {
        setPlan((prev) => ({
            ...prev,
            installments: prev.installments.filter((_, i) => i !== idx),
        }));
    };

    const savePlan = async () => {
        for (const inst of plan.installments) {
            if (!inst.due_date) {
                toast.error(`Вноска #${inst.number}: липсва дата`);
                return;
            }
        }
        setSavingPlan(true);
        try {
            const payload = {
                buyer_id:
                    plan.buyer_id && plan.buyer_id !== "__none__" ? plan.buyer_id : null,
                final_contract_price: Number(plan.final_contract_price || 0),
                deposit_amount: Number(plan.deposit_amount || 0),
                payment_scheme_name: plan.payment_scheme_name || "",
                installments: plan.installments.map((i, idx) => ({
                    number: Number(i.number || idx + 1),
                    label: i.label || null,
                    due_date: i.due_date,
                    amount: Number(i.amount || 0),
                    status: i.status || "предстоящо",
                })),
            };
            const { data } = await api.put(`/properties/${propertyId}/finance-plan`, payload);
            setSummary(data);
            toast.success("Схемата на плащане е запазена");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSavingPlan(false);
        }
    };

    const savePayment = async () => {
        const amt = Number(payment.amount);
        if (!amt || amt <= 0) {
            toast.error("Сумата трябва да е > 0");
            return;
        }
        if (!payment.paid_at) {
            toast.error("Въведете дата на плащане");
            return;
        }
        setSavingPayment(true);
        try {
            const { data } = await api.post(`/properties/${propertyId}/payments`, {
                amount: amt,
                paid_at: payment.paid_at,
                note: payment.note || "",
            });
            setSummary(data);
            setPayment(EMPTY_PAYMENT);
            // also refresh plan view with updated installment statuses
            setPlan((prev) => ({
                ...prev,
                installments: (data.installments || []).map((i) => ({
                    number: i.number,
                    label: i.label || "",
                    due_date: (i.due_date || "").slice(0, 10),
                    amount: i.amount ?? "",
                    status: i.status || "предстоящо",
                })),
            }));
            toast.success("Плащането е записано");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSavingPayment(false);
        }
    };

    if (loading && !summary) {
        return <div className="text-sm text-slate-500 p-4" data-testid="finance-loading">Зареждане…</div>;
    }
    if (!summary) return null;

    return (
        <div className="space-y-6" data-testid="finance-section">
            {summary.next_due_alert && summary.next_due_installment && (
                <div
                    className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                    data-testid="finance-alert"
                >
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                        <div className="font-medium">Следващо плащане наближава</div>
                        <div className="text-xs">
                            Вноска #{summary.next_due_installment.number}
                            {summary.next_due_installment.label ? ` · ${summary.next_due_installment.label}` : ""} ·{" "}
                            {formatBgDate(summary.next_due_installment.due_date)} · {currency(summary.next_due_installment.amount)}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="finance-cards">
                <SummaryCard label="Крайна цена" value={currency(summary.final_contract_price)} testId="fs-final" />
                <SummaryCard label="Капаро" value={currency(summary.deposit_amount)} testId="fs-deposit" />
                <SummaryCard label="Платено" value={currency(summary.paid_total)} testId="fs-paid" />
                <SummaryCard label="Остава" value={currency(summary.remaining_total)} testId="fs-remaining" accent />
                <SummaryCard
                    label="Следваща вноска"
                    value={
                        summary.next_due_installment
                            ? `${currency(summary.next_due_installment.amount)} · ${formatBgDate(summary.next_due_installment.due_date)}`
                            : "—"
                    }
                    testId="fs-next"
                />
                <SummaryCard
                    label="Ср. цена РЗП"
                    value={summary.avg_price_rzp != null ? `${currency(summary.avg_price_rzp)} / м²` : "—"}
                    testId="fs-rzp"
                />
            </div>

            <div className="rounded-lg border hairline bg-stone-50 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm" data-testid="finance-upcoming">
                <div>
                    <div className="text-xs uppercase text-slate-500 tracking-wide">Следваща 1</div>
                    <div className="font-medium text-slate-900" data-testid="fs-next-1">{currency(summary.next_1_due_sum)}</div>
                </div>
                <div>
                    <div className="text-xs uppercase text-slate-500 tracking-wide">Следващи 2</div>
                    <div className="font-medium text-slate-900" data-testid="fs-next-2">{currency(summary.next_2_due_sum)}</div>
                </div>
                <div>
                    <div className="text-xs uppercase text-slate-500 tracking-wide">Следващи 3</div>
                    <div className="font-medium text-slate-900" data-testid="fs-next-3">{currency(summary.next_3_due_sum)}</div>
                </div>
            </div>

            <div className="rounded-lg border hairline p-4 space-y-4" data-testid="finance-plan-form">
                <div className="text-sm font-semibold text-slate-900">Схема и вноски</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <Label>Купувач</Label>
                        <Select value={plan.buyer_id} onValueChange={(v) => setPlan((p) => ({ ...p, buyer_id: v }))}>
                            <SelectTrigger data-testid="plan-buyer"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">— без купувач —</SelectItem>
                                {buyers.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>{b.name} · {b.relation}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Име на схема</Label>
                        <Input
                            value={plan.payment_scheme_name}
                            onChange={(e) => setPlan((p) => ({ ...p, payment_scheme_name: e.target.value }))}
                            placeholder="напр. 3 вноски по етапи"
                            data-testid="plan-scheme"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <Label>Крайна договорна цена (лв.)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={plan.final_contract_price}
                            onChange={(e) => setPlan((p) => ({ ...p, final_contract_price: e.target.value }))}
                            data-testid="plan-final-price"
                        />
                    </div>
                    <div>
                        <Label>Капаро (лв.)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={plan.deposit_amount}
                            onChange={(e) => setPlan((p) => ({ ...p, deposit_amount: e.target.value }))}
                            data-testid="plan-deposit"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Вноски</Label>
                        <Button size="sm" variant="outline" onClick={addInstallment} data-testid="plan-add-installment">
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Добави ред
                        </Button>
                    </div>
                    {plan.installments.length === 0 && (
                        <div className="text-xs text-slate-500">Няма въведени вноски. Добавете поне една.</div>
                    )}
                    {plan.installments.map((inst, idx) => (
                        <div
                            key={idx}
                            className="grid grid-cols-12 gap-2 items-end"
                            data-testid={`plan-inst-row-${idx}`}
                        >
                            <div className="col-span-1">
                                <Label className="text-xs">#</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={inst.number}
                                    onChange={(e) => updateInstallment(idx, "number", e.target.value)}
                                    data-testid={`plan-inst-number-${idx}`}
                                />
                            </div>
                            <div className="col-span-3">
                                <Label className="text-xs">Етап</Label>
                                <Input
                                    value={inst.label}
                                    onChange={(e) => updateInstallment(idx, "label", e.target.value)}
                                    placeholder="напр. Покрив"
                                    data-testid={`plan-inst-label-${idx}`}
                                />
                            </div>
                            <div className="col-span-3">
                                <Label className="text-xs">Дата</Label>
                                <Input
                                    type="date"
                                    value={inst.due_date}
                                    onChange={(e) => updateInstallment(idx, "due_date", e.target.value)}
                                    data-testid={`plan-inst-due-${idx}`}
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="text-xs">Сума</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={inst.amount}
                                    onChange={(e) => updateInstallment(idx, "amount", e.target.value)}
                                    data-testid={`plan-inst-amount-${idx}`}
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="text-xs">Статус</Label>
                                <Select
                                    value={inst.status}
                                    onValueChange={(v) => updateInstallment(idx, "status", v)}
                                >
                                    <SelectTrigger data-testid={`plan-inst-status-${idx}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="предстоящо">Предстоящо</SelectItem>
                                        <SelectItem value="платено">Платено</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-1 flex justify-end">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => removeInstallment(idx)}
                                    data-testid={`plan-inst-remove-${idx}`}
                                    title="Премахни ред"
                                >
                                    <Trash2 className="h-4 w-4 text-slate-500" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end">
                    <Button
                        onClick={savePlan}
                        disabled={savingPlan}
                        data-testid="plan-save"
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        {savingPlan ? "Запазване…" : "Запази схема"}
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border hairline p-4 space-y-4" data-testid="finance-payment-form">
                <div className="text-sm font-semibold text-slate-900">Запис на плащане</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <Label>Сума (лв.) <span className="text-red-600">*</span></Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={payment.amount}
                            onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
                            data-testid="pay-amount"
                        />
                    </div>
                    <div>
                        <Label>Дата <span className="text-red-600">*</span></Label>
                        <Input
                            type="date"
                            value={payment.paid_at}
                            onChange={(e) => setPayment((p) => ({ ...p, paid_at: e.target.value }))}
                            data-testid="pay-date"
                        />
                    </div>
                    <div>
                        <Label>Бележка</Label>
                        <Input
                            value={payment.note}
                            onChange={(e) => setPayment((p) => ({ ...p, note: e.target.value }))}
                            placeholder="напр. банков превод"
                            data-testid="pay-note"
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button
                        onClick={savePayment}
                        disabled={savingPayment}
                        data-testid="pay-save"
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        {savingPayment ? "Записване…" : "Запиши плащане"}
                    </Button>
                </div>

                {summary.payments.length > 0 && (
                    <div className="rounded-md border hairline bg-stone-50 overflow-hidden" data-testid="pay-history">
                        <table className="w-full text-xs">
                            <thead className="text-slate-500">
                                <tr>
                                    <th className="text-left p-2 font-medium">Дата</th>
                                    <th className="text-right p-2 font-medium">Сума</th>
                                    <th className="text-left p-2 font-medium">Бележка</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.payments.map((p) => (
                                    <tr key={p.id} className="border-t hairline">
                                        <td className="p-2">{formatBgDate(p.paid_at)}</td>
                                        <td className="p-2 text-right font-medium">{currency(p.amount)}</td>
                                        <td className="p-2 text-slate-600">{p.note || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryCard({ label, value, testId, accent = false }) {
    return (
        <div
            className={`rounded-lg border hairline p-3 ${accent ? "bg-slate-900 text-white" : "bg-white"}`}
            data-testid={testId}
        >
            <div className={`text-[10px] uppercase tracking-wider ${accent ? "text-white/70" : "text-slate-500"}`}>
                {label}
            </div>
            <div className="text-sm font-semibold mt-1 leading-tight">{value}</div>
        </div>
    );
}
