import React, { useEffect, useMemo, useState } from "react";
import { api, currency } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PROPERTY_TYPE_LABELS, PROPERTY_STATUS } from "../../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";

export default function AdminProperties() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [props, setProps] = useState([]);

    useEffect(() => {
        api.get("/projects").then((r) => {
            setProjects(r.data);
            if (r.data[0]) setProjectId(r.data[0].id);
        });
    }, []);

    const load = (pid) => {
        if (!pid) return;
        api.get(`/projects/${pid}/properties`).then((r) => setProps(r.data));
    };
    useEffect(() => { load(projectId); }, [projectId]);

    const filtered = useMemo(() => {
        return props.filter((p) =>
            (typeFilter === "all" || p.property_type === typeFilter) &&
            (statusFilter === "all" || p.status === statusFilter)
        );
    }, [props, typeFilter, statusFilter]);

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
                <div className="overline mb-2">Имоти</div>
                <h1 className="font-serif text-4xl text-slate-900">Каталог на имотите</h1>
            </div>

            <div className="flex flex-wrap gap-3">
                <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="w-64" data-testid="admin-select-project">
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
                        <SelectItem value="apartment">Апартаменти</SelectItem>
                        <SelectItem value="garage">Гаражи</SelectItem>
                        <SelectItem value="parking">Паркоместа</SelectItem>
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
            </div>

            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Код</th>
                            <th className="text-left p-3 font-medium">Тип</th>
                            <th className="text-left p-3 font-medium">Етаж</th>
                            <th className="text-right p-3 font-medium">Площ</th>
                            <th className="text-right p-3 font-medium">Цена</th>
                            <th className="text-left p-3 font-medium">Статус</th>
                            <th className="text-left p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p) => (
                            <tr key={p.id} className="border-t hairline" data-testid={`admin-property-row-${p.code}`}>
                                <td className="p-3 font-mono font-medium">{p.code}</td>
                                <td className="p-3 text-slate-600">{PROPERTY_TYPE_LABELS[p.property_type]}</td>
                                <td className="p-3 text-slate-600">{p.floor}</td>
                                <td className="p-3 text-right">{p.area_total ? `${p.area_total} м²` : "—"}</td>
                                <td className="p-3 text-right font-medium">{p.price_total ? currency(p.price_total) : "—"}</td>
                                <td className="p-3"><StatusBadge status={p.status} /></td>
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
                        ))}
                        {filtered.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={7}>Няма имоти с избраните филтри.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
