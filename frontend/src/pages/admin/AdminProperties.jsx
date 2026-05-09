import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, CalendarPlus, Upload, Download, RotateCcw, Calculator, Settings } from "lucide-react";
import { api, currency, formatApiError } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { InlinePriceCell, calculateWithVat, calculatePricePerSqm } from "../../components/admin/InlinePriceCell";
import BulkApplyDialog from "../../components/admin/BulkApplyDialog";
import PricingSettingsTab from "../../components/admin/PricingSettingsTab";
import { useIsSuperAdmin } from "../../lib/auth";
import {
    PROPERTY_TYPE_LABELS,
    PROPERTY_TYPE_FILTERS,
    PROPERTY_STATUS,
    EDITABLE_STATUSES,
    floorLabel,
    floorKote,
    matchesTypeFilter,
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
    "price_per_sqm", "base_price", "list_price",
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
    const [koteFilter, setKoteFilter] = useState("all");
    const [exposureFilter, setExposureFilter] = useState("all");
    const [roomsFilter, setRoomsFilter] = useState("all");
    const [props, setProps] = useState([]);
    const [importOpen, setImportOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [bulkApplyOpen, setBulkApplyOpen] = useState(false);
    const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
    const isSuperAdmin = useIsSuperAdmin();

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
        api.get("/clients", { params: { active: "all" } })
            .then((r) => {
                const raw = Array.isArray(r.data) ? r.data : [];
                const mapped = raw
                    .filter((c) => c && c.id)
                    .map((c) => ({
                        ...c,
                        relation:
                            c.client_type === "compensation"
                                ? "обезщетение"
                                : c.client_type === "investor"
                                  ? "инвеститор"
                                  : c.client_type === "company"
                                    ? "фирма"
                                    : "купувач",
                    }));
                setBuyers(mapped);
                setClients(mapped);
            })
            .catch(() => {});
    }, []);

    const load = (pid) => {
        if (!pid) return;
        api.get(`/projects/${pid}/properties`).then((r) => setProps(r.data));
    };
    useEffect(() => { load(projectId); }, [projectId]);

    const formProjectId = form?.project_id || projectId;
    useEffect(() => {
        if (!formProjectId) { setBuildings([]); return; }
        api.get(`/projects/${formProjectId}`)
            .then((r) => setBuildings(r.data.buildings || []))
            .catch(() => setBuildings([]));
    }, [formProjectId]);

    const floors = useMemo(() => {
        const set = new Set(props.map((p) => p.floor));
        return [...set].sort((a, b) => a - b);
    }, [props]);

    const exposures = useMemo(() => {
        const set = new Set(props.map((p) => (p.exposure || "").trim()).filter(Boolean));
        return [...set].sort();
    }, [props]);

    const filtered = useMemo(() => {
        return props.filter((p) => {
            if (typeFilter !== "all") {
                const tf = PROPERTY_TYPE_FILTERS.find((x) => x.value === typeFilter);
                if (tf ? !matchesTypeFilter(tf, p.property_type) : p.property_type !== typeFilter) return false;
            }
            if (statusFilter !== "all" && p.status !== statusFilter) return false;
            if (floorFilter !== "all" && String(p.floor) !== floorFilter) return false;
            if (koteFilter !== "all" && floorKote(p.floor) !== koteFilter) return false;
            if (exposureFilter !== "all" && (p.exposure || "") !== exposureFilter) return false;
            if (roomsFilter !== "all") {
                if (p.property_type !== "apartment") return false;
                if (roomsFilter === "4+") { if ((p.rooms || 0) < 4) return false; }
                else if (Number(p.rooms) !== Number(roomsFilter)) return false;
            }
            return true;
        });
    }, [props, typeFilter, statusFilter, floorFilter, koteFilter, exposureFilter, roomsFilter]);

    const groupedByFloor = useMemo(() => {
        const groups = {};
        filtered.forEach((p) => {
            const k = String(p.floor);
            if (!groups[k]) groups[k] = [];
            groups[k].push(p);
        });
        const codeSort = (a, b) => {
            const an = parseInt(a.code, 10);
            const bn = parseInt(b.code, 10);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
            return String(a.code).localeCompare(String(b.code), "bg");
        };
        Object.values(groups).forEach((arr) => arr.sort(codeSort));
        return Object.keys(groups)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => ({ floor: Number(k), units: groups[k] }));
    }, [filtered]);

    const resetFilters = () => {
        setTypeFilter("all"); setStatusFilter("all"); setFloorFilter("all");
        setKoteFilter("all"); setExposureFilter("all"); setRoomsFilter("all");
    };

    const exportXlsx = async () => {
        if (!projectId) return;
        setExporting(true);
        try {
            const resp = await api.get(`/admin/projects/${projectId}/properties/export`, {
                responseType: "blob",
                params: { format: "xlsx" },
            });
            const proj = projects.find((p) => p.id === projectId);
            const slug = proj?.slug || proj?.id || "inventory";
            const date = new Date().toISOString().slice(0, 10);
            const url = window.URL.createObjectURL(new Blob([resp.data]));
            const a = document.createElement("a");
            a.href = url; a.download = `${slug}-inventar-${date}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Експортът се провали");
        } finally {
            setExporting(false);
        }
    };

    const buyerById = useMemo(() => {
        const m = {};
        (buyers || []).forEach((b) => {
            if (b && b.id) m[b.id] = b;
        });
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

    // R.2: inline edit на цена/м²
    const updatePropertyPrice = async (propertyId, newPpm, newListPrice) => {
        try {
            await api.patch(`/properties/${propertyId}`, {
                price_per_sqm: newPpm,
                list_price: newListPrice,
                base_price: newListPrice,
            });
            toast.success("Цената е обновена");
            setProps((prev) => prev.map((p) =>
                p.id === propertyId
                    ? { ...p, price_per_sqm: newPpm, list_price: newListPrice, base_price: newListPrice }
                    : p
            ));
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при обновяване");
            throw e;
        }
    };

    // R.2: bulk apply на цена/м² на много имоти
    const handleBulkApply = async (preview, ppmValue) => {
        let success = 0;
        let failed = 0;
        for (const row of preview) {
            const prop = props.find((p) => p.code === row.code);
            if (!prop) { failed++; continue; }
            try {
                await api.patch(`/properties/${prop.id}`, {
                    price_per_sqm: ppmValue,
                    list_price: row.new_list,
                    base_price: row.new_list,
                });
                success++;
            } catch (e) {
                failed++;
            }
        }
        if (success > 0) toast.success(`Обновени ${success} имота`);
        if (failed > 0) toast.error(`${failed} имота не можаха да се обновят`);
        load(projectId);
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
                        Финансовите детайли (договорена цена, schedule, плащания) са в раздел „Сделки / Плащания".
                    </p>
                </div>
                <div className="flex gap-2">
                    {isSuperAdmin && (
                        <Button
                            variant="outline"
                            onClick={() => setPricingDialogOpen(true)}
                            disabled={!projectId}
                            data-testid="admin-pricing-settings-btn"
                        >
                            <Settings className="h-4 w-4 mr-2" /> Площообразуване
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        onClick={() => setBulkApplyOpen(true)}
                        disabled={!projectId}
                        data-testid="admin-bulk-apply-btn"
                    >
                        <Calculator className="h-4 w-4 mr-2" /> Bulk цена/м²
                    </Button>
                    <Button
                        variant="outline"
                        onClick={exportXlsx}
                        disabled={!projectId || exporting}
                        data-testid="admin-export-xlsx-btn"
                    >
                        <Download className="h-4 w-4 mr-2" /> {exporting ? "Експорт…" : "Експорт Excel"}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setImportOpen(true)}
                        data-testid="admin-import-json-btn"
                    >
                        <Upload className="h-4 w-4 mr-2" /> Импорт от JSON
                    </Button>
                    <Button
                        onClick={openCreate}
                        data-testid="admin-new-property-btn"
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        <Plus className="h-4 w-4 mr-2" /> Нов обект
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
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
                        <SelectTrigger className="w-44" data-testid="admin-filter-type"><SelectValue /></SelectTrigger>
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
                                <SelectItem key={f} value={String(f)}>{floorLabel(f)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-52" data-testid="admin-filter-status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Всички статуси</SelectItem>
                            {Object.keys(PROPERTY_STATUS).map((s) => (
                                <SelectItem key={s} value={s}>{PROPERTY_STATUS[s].label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="ml-auto text-sm text-slate-500">{filtered.length} от {props.length}</div>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    <Select value={koteFilter} onValueChange={setKoteFilter}>
                        <SelectTrigger className="w-44" data-testid="admin-filter-kote"><SelectValue placeholder="Кота" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Всички коти</SelectItem>
                            {floors.map((f) => {
                                const k = floorKote(f);
                                if (k === "—") return null;
                                return <SelectItem key={f} value={k}>{k} ({floorLabel(f)})</SelectItem>;
                            })}
                        </SelectContent>
                    </Select>

                    <Select value={exposureFilter} onValueChange={setExposureFilter}>
                        <SelectTrigger className="w-44" data-testid="admin-filter-exposure"><SelectValue placeholder="Изложение" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Всички изложения</SelectItem>
                            {exposures.map((e) => (
                                <SelectItem key={e} value={e}>{e}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={roomsFilter} onValueChange={setRoomsFilter}>
                        <SelectTrigger className="w-40" data-testid="admin-filter-rooms"><SelectValue placeholder="Стаи" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Всички стаи</SelectItem>
                            <SelectItem value="1">1 стая</SelectItem>
                            <SelectItem value="2">2 стаи</SelectItem>
                            <SelectItem value="3">3 стаи</SelectItem>
                            <SelectItem value="4+">4+ стаи</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="admin-filter-reset">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset filters
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-x-auto">
                <table className="w-full text-sm" data-testid="admin-properties-grouped">
                    <thead className="bg-stone-50 text-slate-600 sticky top-0 z-10">
                        <tr>
                            <th className="text-left p-3 font-medium">Код</th>
                            <th className="text-left p-3 font-medium">Тип</th>
                            <th className="text-left p-3 font-medium">Етаж</th>
                            <th className="text-right p-3 font-medium">Стаи</th>
                            <th className="text-right p-3 font-medium">F1 м²</th>
                            <th className="text-right p-3 font-medium hidden md:table-cell">F2 м²</th>
                            <th className="text-right p-3 font-medium hidden md:table-cell">F1+F2 м²</th>
                            <th className="text-left p-3 font-medium">Изложение</th>
                            <th className="text-right p-3 font-medium">€/м²</th>
                            <th className="text-right p-3 font-medium">Без ДДС</th>
                            <th className="text-right p-3 font-medium">С ДДС</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Купувач</th>
                            <th className="text-left p-3 font-medium">Бележки</th>
                            <th className="text-left p-3 font-medium">Промяна статус</th>
                            <th className="text-right p-3 font-medium">Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedByFloor.map((g) => (
                            <React.Fragment key={g.floor}>
                                <tr className="bg-slate-900 text-white" data-testid={`floor-group-${g.floor}`}>
                                    <td colSpan={16} className="px-4 py-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-xs opacity-70">{floorKote(g.floor)}</span>
                                                <span className="font-medium tracking-wider text-sm">{floorLabel(g.floor)}</span>
                                            </div>
                                            <span className="text-xs opacity-80">{g.units.length} {g.units.length === 1 ? "обект" : "обекта"}</span>
                                        </div>
                                    </td>
                                </tr>
                                {g.units.map((p) => {
                                    const buyer = p.buyer_id ? buyerById[p.buyer_id] : null;
                                    const ppmDisplay = p.price_per_sqm
                                        ? p.price_per_sqm
                                        : calculatePricePerSqm(p.list_price, p.area_total);
                                    const withVat = calculateWithVat(p.list_price, 20);
                                    return (
                                        <tr key={p.id} className="border-t hairline align-top" data-testid={`admin-property-row-${p.code}`}>
                                            <td className="p-3 font-mono font-medium whitespace-nowrap">{p.code}</td>
                                            <td className="p-3 text-slate-600 whitespace-nowrap">{PROPERTY_TYPE_LABELS[p.property_type]}</td>
                                            <td className="p-3 text-slate-600 whitespace-nowrap">{floorLabel(p.floor)}</td>
                                            <td className="p-3 text-right text-slate-600">{p.property_type === "apartment" ? (p.rooms ?? "—") : "—"}</td>
                                            <td className="p-3 text-right whitespace-nowrap">{p.raw_area != null ? `${p.raw_area} м²` : "—"}</td>
                                            <td className="p-3 text-right whitespace-nowrap hidden md:table-cell">{p.ideal_parts_area != null ? p.ideal_parts_area : "—"}</td>
                                            <td className="p-3 text-right whitespace-nowrap hidden md:table-cell">{p.area_total != null ? `${p.area_total} м²` : "—"}</td>
                                            <td className="p-3 text-slate-600 whitespace-nowrap">{p.exposure || "—"}</td>
                                            <td className="p-3 text-right whitespace-nowrap">
                                                <InlinePriceCell
                                                    value={ppmDisplay}
                                                    area={p.area_total}
                                                    onSave={(newPpm, newListPrice) => updatePropertyPrice(p.id, newPpm, newListPrice)}
                                                    testId={`admin-ppm-${p.code}`}
                                                    disabled={!p.area_total}
                                                />
                                            </td>
                                            <td className="p-3 text-right font-medium whitespace-nowrap">{p.list_price ? currency(p.list_price) : "—"}</td>
                                            <td className="p-3 text-right whitespace-nowrap text-slate-600">{withVat ? currency(withVat) : "—"}</td>
                                            <td className="p-3"><StatusBadge status={p.status} /></td>
                                            <td className="p-3 text-slate-700 whitespace-nowrap">
                                                {buyer ? (
                                                    <div>
                                                        <div className={`font-medium ${buyer.is_active === false ? "text-slate-500" : "text-slate-900"}`}>
                                                            {buyer.name}
                                                            {buyer.is_active === false && (
                                                                <span className="ml-1 text-xs text-slate-400">(деактивиран)</span>
                                                            )}
                                                        </div>
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
                                                        {EDITABLE_STATUSES.map((s) => (
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
                            </React.Fragment>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={16}>Няма обекти с избраните филтри.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* R.2: Footer със суми */}
            <PropertiesSummary properties={props} />

            <BulkApplyDialog
                open={bulkApplyOpen}
                onOpenChange={setBulkApplyOpen}
                properties={props}
                onApply={handleBulkApply}
            />

            {/* R.3: Pricing Settings Dialog (само за super_admin) */}
            <Dialog open={pricingDialogOpen} onOpenChange={setPricingDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="pricing-settings-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Площообразуване</DialogTitle>
                        <DialogDescription>
                            Настройки за автоматично изчисление на цени по етаж и тип имот.
                            Цените са БЕЗ ДДС. Прилагат се само при ползване на „Преглед на recalc".
                        </DialogDescription>
                    </DialogHeader>
                    {projectId && (
                        <PricingSettingsTab
                            project={projects.find((p) => p.id === projectId)}
                            onSaved={() => {
                                load(projectId);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="property-edit-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            {mode === "create" ? "Нов обект" : `Редакция · ${editing?.code}`}
                        </DialogTitle>
                        <DialogDescription>
                            {mode === "create"
                                ? "Попълнете основните полета. Финансовите данни (договорена цена, плащания) се управляват в раздел „Сделки / Плащания\"."
                                : "Промените се записват веднага. Source ref, project и building не могат да се променят. Финансовите данни са в раздел „Сделки / Плащания\"."}
                        </DialogDescription>
                    </DialogHeader>

                    {form && (
                        <div className="space-y-4 py-2" data-testid="property-basics-form">
                            <PropertyFormBody form={form} setField={set} buyers={buyers} mode={mode} projects={projects} buildings={buildings} />
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} data-testid="pf-cancel">
                            Отказ
                        </Button>
                        {mode === "edit" && editing?.id && (form?.status === "available" || form?.status === "reserved_zero_deposit") && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDialogOpen(false);
                                    window.location.href = `/admin/quotes/new?property_id=${editing.id}`;
                                }}
                                data-testid="pf-add-to-quote"
                                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            >
                                Добави в нова оферта
                            </Button>
                        )}
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
                            Резервирайте обекта за клиент. При „Капаро 0" се задава 7-дневен срок без сума.
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

            <BulkImportDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                projects={projects}
                defaultProjectId={projectId}
                onApplied={() => load(projectId)}
            />
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

// R.2: Footer със финансови суми
function PropertiesSummary({ properties }) {
    const summary = useMemo(() => {
        const all = properties || [];

        const sumLp = (list) => list.reduce((acc, p) => acc + (parseFloat(p.list_price) || 0), 0);
        const sumWithVat = (list) => sumLp(list) * 1.20;

        const sold = all.filter((p) => p.status === "sold");
        const free = all.filter((p) => p.status === "available");
        const reserved = all.filter((p) =>
            p.status === "reserved_zero_deposit" || p.status === "reserved_paid_deposit"
        );
        const compensation = all.filter((p) => p.status === "compensation");

        return {
            totalCount: all.length,
            soldCount: sold.length,
            freeCount: free.length,
            reservedCount: reserved.length,
            compensationCount: compensation.length,
            totalLp: sumLp(all),
            totalWithVat: sumWithVat(all),
            soldLp: sumLp(sold),
            soldWithVat: sumWithVat(sold),
            freeLp: sumLp(free),
            freeWithVat: sumWithVat(free),
            soldPercent: all.length > 0 ? Math.round((sold.length / all.length) * 100) : 0,
        };
    }, [properties]);

    if (summary.totalCount === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="properties-summary">
            {/* Общо */}
            <div className="rounded-xl border hairline bg-white p-5">
                <div className="overline text-slate-500 mb-2">Общо обекти</div>
                <div className="text-3xl font-serif text-slate-900">
                    {summary.totalCount}
                </div>
                <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <div>Без ДДС: <span className="font-medium text-slate-700">{currency(summary.totalLp)}</span></div>
                    <div>С ДДС: <span className="font-medium text-slate-700">{currency(summary.totalWithVat)}</span></div>
                </div>
            </div>

            {/* Продадени */}
            <div className="rounded-xl border hairline bg-emerald-50/50 p-5" data-testid="summary-sold">
                <div className="overline text-emerald-700 mb-2">Продадени ({summary.soldPercent}%)</div>
                <div className="text-3xl font-serif text-emerald-900">
                    {summary.soldCount}
                </div>
                <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <div>Без ДДС: <span className="font-medium text-slate-700">{currency(summary.soldLp)}</span></div>
                    <div>С ДДС: <span className="font-medium text-slate-700">{currency(summary.soldWithVat)}</span></div>
                </div>
                <div className="mt-3 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{ width: `${summary.soldPercent}%` }}
                    />
                </div>
            </div>

            {/* Свободни */}
            <div className="rounded-xl border hairline bg-stone-50 p-5">
                <div className="overline text-slate-600 mb-2">Свободни</div>
                <div className="text-3xl font-serif text-slate-900">
                    {summary.freeCount}
                    {summary.reservedCount > 0 && (
                        <span className="text-base text-amber-600 ml-2">
                            (+{summary.reservedCount} резерв.)
                        </span>
                    )}
                </div>
                <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <div>Без ДДС: <span className="font-medium text-slate-700">{currency(summary.freeLp)}</span></div>
                    <div>С ДДС: <span className="font-medium text-slate-700">{currency(summary.freeWithVat)}</span></div>
                    {summary.compensationCount > 0 && (
                        <div className="text-violet-600">Обезщетение: {summary.compensationCount}</div>
                    )}
                </div>
            </div>
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
                            {EDITABLE_STATUSES.map((s) => (
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
                            {buyers
                                .filter((b) => b && b.id && (b.is_active !== false || b.id === form.buyer_id))
                                .map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.name}
                                        {b.is_active === false ? " (деактивиран)" : ""} · {b.relation}
                                    </SelectItem>
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

// =====================================================
// Bulk import dialog (preserved from previous version)
// =====================================================
const SAMPLE_JSON = `[
  {"code":"101","property_type":"apartment","floor":2,"rooms":2,"raw_area":44.96,"area_total":55.24,"list_price":53078,"base_price":53078,"ideal_parts":10.28,"exposure":"изток"}
]`;

function BulkImportDialog({ open, onOpenChange, projects, defaultProjectId, onApplied }) {
    const [projectId, setProjectId] = useState("");
    const [mode, setMode] = useState("smart_diff");
    const [text, setText] = useState("");
    const [parsedError, setParsedError] = useState("");
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) {
            setProjectId(defaultProjectId || projects[0]?.id || "");
            setMode("smart_diff");
            setText("");
            setParsedError("");
            setPreview(null);
        }
    }, [open, defaultProjectId, projects]);

    const onTextChange = (v) => {
        setText(v);
        setPreview(null);
        if (!v.trim()) { setParsedError(""); return; }
        try {
            const j = JSON.parse(v);
            if (!Array.isArray(j)) throw new Error("Очаква се масив от обекти");
            setParsedError("");
        } catch (e) {
            setParsedError(`Невалиден JSON: ${e.message}`);
        }
    };

    const buildPayload = () => {
        const arr = JSON.parse(text);
        return { project_id: projectId, properties: arr, mode };
    };

    const analyze = async () => {
        if (!projectId) return toast.error("Изберете проект");
        if (parsedError) return toast.error(parsedError);
        if (!text.trim()) return toast.error("Поставете JSON");
        setBusy(true);
        try {
            const payload = { ...buildPayload(), dry_run: true };
            const { data } = await api.post("/admin/import/bulk-properties", payload);
            setPreview(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    const apply = async () => {
        if (!preview) return toast.error("Първо анализирайте");
        setBusy(true);
        try {
            const payload = { ...buildPayload(), dry_run: false };
            const { data } = await api.post("/admin/import/bulk-properties", payload);
            const s = data.summary;
            toast.success(`Готово: създадени ${s.created}, обновени ${s.updated_neutral + s.updated_protected}, пропуснати ${s.skipped}`);
            onApplied?.();
            onOpenChange(false);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl" data-testid="bulk-import-dialog">
                <DialogHeader>
                    <DialogTitle className="font-serif text-2xl">Импорт на обекти от JSON</DialogTitle>
                    <DialogDescription>
                        Smart Diff пази продадените и резервираните — обновява само neutral полета.
                        Force Create създава само нови (skip-ва съществуващи).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label>Проект</Label>
                            <Select value={projectId} onValueChange={setProjectId}>
                                <SelectTrigger data-testid="import-project"><SelectValue placeholder="Изберете проект" /></SelectTrigger>
                                <SelectContent>
                                    {projects.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Режим</Label>
                            <div className="flex gap-4 pt-2 text-sm">
                                <label className="inline-flex items-center gap-2">
                                    <input type="radio" name="import-mode" value="smart_diff" checked={mode === "smart_diff"} onChange={() => setMode("smart_diff")} data-testid="import-mode-smart" />
                                    Smart Diff <span className="text-xs text-slate-500">(защитава продадените)</span>
                                </label>
                                <label className="inline-flex items-center gap-2">
                                    <input type="radio" name="import-mode" value="force_create" checked={mode === "force_create"} onChange={() => setMode("force_create")} data-testid="import-mode-force" />
                                    Force Create <span className="text-xs text-slate-500">(само нови)</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <Label>JSON payload (масив от обекти)</Label>
                            <Button size="sm" variant="ghost" onClick={() => onTextChange(SAMPLE_JSON)} data-testid="import-load-sample">
                                Зареди sample
                            </Button>
                        </div>
                        <Textarea
                            rows={12}
                            value={text}
                            onChange={(e) => onTextChange(e.target.value)}
                            placeholder='[{"code":"101","property_type":"apartment","floor":2,...}]'
                            className={`font-mono text-xs ${parsedError ? "border-rose-400 focus:border-rose-500" : ""}`}
                            data-testid="import-textarea"
                        />
                        {parsedError && <div className="text-xs text-rose-600 mt-1" data-testid="import-error">{parsedError}</div>}
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={analyze} disabled={busy || !!parsedError || !text.trim()} variant="outline" data-testid="import-analyze">
                            {busy ? "Анализирам…" : "Анализирай"}
                        </Button>
                    </div>

                    {preview && (
                        <div className="space-y-3 rounded-lg border hairline bg-stone-50 p-4 text-sm" data-testid="import-preview">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                                <div data-testid="import-stat-protected" className="rounded-md bg-amber-50 border border-amber-200 p-2">
                                    <div className="text-[11px] text-amber-700">Защитени</div>
                                    <div className="font-semibold text-amber-900">{preview.details.protected.length}</div>
                                </div>
                                <div data-testid="import-stat-free" className="rounded-md bg-emerald-50 border border-emerald-200 p-2">
                                    <div className="text-[11px] text-emerald-700">Стандартни</div>
                                    <div className="font-semibold text-emerald-900">{preview.details.free_updates.length}</div>
                                </div>
                                <div data-testid="import-stat-new" className="rounded-md bg-sky-50 border border-sky-200 p-2">
                                    <div className="text-[11px] text-sky-700">Нови</div>
                                    <div className="font-semibold text-sky-900">{preview.details.new_units.length}</div>
                                </div>
                                <div data-testid="import-stat-orphan" className="rounded-md bg-stone-100 border border-stone-300 p-2">
                                    <div className="text-[11px] text-slate-600">Не са в payload</div>
                                    <div className="font-semibold text-slate-900">{preview.details.in_db_not_in_payload.length}</div>
                                </div>
                            </div>
                            <div className="text-xs text-slate-600">
                                Total: {preview.summary.total_in_payload} · created: {preview.summary.created} · updated: {preview.summary.updated_neutral + preview.summary.updated_protected} · skipped: {preview.summary.skipped}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} data-testid="import-cancel">
                        Отказ
                    </Button>
                    <Button onClick={apply} disabled={busy || !preview} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="import-apply">
                        {busy ? "Прилагам…" : "Прилагам всичко"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
