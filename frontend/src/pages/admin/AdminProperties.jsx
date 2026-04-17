import React, { useEffect, useMemo, useState } from "react";
import { api, currency } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import {
    PROPERTY_TYPE_LABELS,
    PROPERTY_TYPE_FILTERS,
    PROPERTY_STATUS,
} from "../../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";

export default function AdminProperties() {
    const [projects, setProjects] = useState([]);
    const [buyers, setBuyers] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [floorFilter, setFloorFilter] = useState("all");
    const [props, setProps] = useState([]);

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
                            <th className="text-left p-3 font-medium">Действие</th>
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
                                            <SelectTrigger className="h-8 w-44" data-testid={`admin-set-status-${p.code}`}><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Object.keys(PROPERTY_STATUS).map((s) => (
                                                    <SelectItem key={s} value={s}>{PROPERTY_STATUS[s].label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={10}>Няма обекти с избраните филтри.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
