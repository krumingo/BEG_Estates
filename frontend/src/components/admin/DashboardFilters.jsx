import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";

/**
 * R.6: Глобални филтри за dashboard-а.
 * Контролирани от parent — value/onChange на filters обект.
 */
export default function DashboardFilters({ filters, onChange }) {
    const [projects, setProjects] = useState([]);
    const [buildings, setBuildings] = useState([]);
    const [clients, setClients] = useState([]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            api.get("/projects").catch(() => ({ data: [] })),
            api.get("/clients").catch(() => ({ data: [] })),
        ]).then(([p, c]) => {
            if (cancelled) return;
            setProjects(Array.isArray(p.data) ? p.data : []);
            // buildings endpoint doesn't exist — leave empty so the filter stays hidden
            setBuildings([]);
            setClients(Array.isArray(c.data) ? c.data : []);
        });
        return () => { cancelled = true; };
    }, []);

    const set = (k, v) => onChange({ ...filters, [k]: v === "__all__" ? null : v });

    return (
        <div
            className="rounded-xl border border-stone-200 bg-white p-4 flex flex-wrap items-center gap-3"
            data-testid="dashboard-filters"
        >
            <FilterCell label="Проект">
                <Select value={filters.project_id || "__all__"} onValueChange={(v) => set("project_id", v)}>
                    <SelectTrigger className="h-9 w-44" data-testid="filter-project">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Всички проекти</SelectItem>
                        {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FilterCell>

            {buildings.length > 0 && (
                <FilterCell label="Сграда">
                    <Select value={filters.building_id || "__all__"} onValueChange={(v) => set("building_id", v)}>
                        <SelectTrigger className="h-9 w-40" data-testid="filter-building">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">Всички сгради</SelectItem>
                            {buildings.map((b) => (
                                <SelectItem key={b.id} value={b.id}>{b.name || b.id.slice(0, 8)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterCell>
            )}

            <FilterCell label="Тип">
                <Select value={filters.property_type || "__all__"} onValueChange={(v) => set("property_type", v)}>
                    <SelectTrigger className="h-9 w-40" data-testid="filter-type">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Всички типове</SelectItem>
                        <SelectItem value="apartment">Апартаменти</SelectItem>
                        <SelectItem value="parking">Паркоместа</SelectItem>
                        <SelectItem value="yard_parking">Дворни паркоместа</SelectItem>
                        <SelectItem value="garage">Гаражи</SelectItem>
                        <SelectItem value="storage">Складове</SelectItem>
                        <SelectItem value="shop">Магазини</SelectItem>
                        <SelectItem value="house">Къщи</SelectItem>
                    </SelectContent>
                </Select>
            </FilterCell>

            <FilterCell label="Статус">
                <Select value={filters.status || "__all__"} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger className="h-9 w-40" data-testid="filter-status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Всички статуси</SelectItem>
                        <SelectItem value="available">Свободен</SelectItem>
                        <SelectItem value="reserved_zero_deposit">Резерв. (0)</SelectItem>
                        <SelectItem value="reserved_paid_deposit">Резерв. с капаро</SelectItem>
                        <SelectItem value="sold">Продаден</SelectItem>
                        <SelectItem value="compensation">Обезщет.</SelectItem>
                    </SelectContent>
                </Select>
            </FilterCell>

            <FilterCell label="Клиент">
                <Select value={filters.client_id || "__all__"} onValueChange={(v) => set("client_id", v)}>
                    <SelectTrigger className="h-9 w-44" data-testid="filter-client">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Всички клиенти</SelectItem>
                        {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name || c.email}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FilterCell>

            <FilterCell label="Период">
                <Select value={filters.period || "__all__"} onValueChange={(v) => set("period", v)}>
                    <SelectTrigger className="h-9 w-32" data-testid="filter-period">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Всички</SelectItem>
                        <SelectItem value="7d">7 дни</SelectItem>
                        <SelectItem value="30d">30 дни</SelectItem>
                        <SelectItem value="90d">90 дни</SelectItem>
                        <SelectItem value="365d">12 месеца</SelectItem>
                    </SelectContent>
                </Select>
            </FilterCell>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox
                    checked={!!filters.only_overdue}
                    onCheckedChange={(v) => onChange({ ...filters, only_overdue: !!v })}
                    data-testid="filter-only-overdue"
                />
                Само просрочени
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <Checkbox
                    checked={!!filters.only_available}
                    onCheckedChange={(v) => onChange({ ...filters, only_available: !!v })}
                    data-testid="filter-only-available"
                />
                Само свободни
            </label>
        </div>
    );
}

function FilterCell({ label, children }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-medium text-slate-500">
                {label}
            </span>
            {children}
        </div>
    );
}
