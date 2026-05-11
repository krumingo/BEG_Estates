import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../../components/layout/AdminSidebar";
import { api } from "../../lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import DashboardFilters from "../../components/admin/DashboardFilters";
import {
    OverviewTab,
    SalesTab,
    FinanceTab,
    CalendarTab,
    ClientsTab,
    UnsoldTab,
} from "../../components/admin/DashboardTabs";
import ConstructionCashflowTab from "../../components/admin/ConstructionCashflowTab";

export function AdminLayout() {
    return (
        <div className="min-h-screen bg-stone-50">
            <AdminSidebar />
            <main className="lg:pl-64 p-6 lg:p-10">
                <Outlet />
            </main>
        </div>
    );
}

const INITIAL_FILTERS = {
    project_id: null,
    building_id: null,
    property_type: null,
    status: null,
    client_id: null,
    period: null,
    only_overdue: false,
    only_available: false,
};

/**
 * R.6: Tab-based management dashboard.
 *
 * Tabs: Обзор / Продажби / Финанси / Календар / Клиенти / Непродадени.
 * Глобални филтри (горе): проект, сграда, тип, статус, клиент, период,
 *                         only_overdue, only_available.
 *
 * Изпраща филтрите като query params към /dashboard/admin/full.
 */
export default function AdminDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [tab, setTab] = useState("overview");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const params = {};
        Object.entries(filters).forEach(([k, v]) => {
            if (v !== null && v !== "" && v !== false) params[k] = v;
        });
        api.get("/dashboard/admin/full", { params })
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch((e) => {
                if (!cancelled) {
                    setError(e?.response?.data?.detail || "Грешка при зареждане на dashboard-а");
                    setData(null);
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filters, reloadKey]);

    const isFinanceVisible = data?.is_finance_visible ?? false;
    const reloadDashboard = () => setReloadKey((k) => k + 1);

    const handleTypeClick = (type) => {
        setFilters((f) => ({ ...f, property_type: type }));
        setTab("overview");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-wider font-medium text-slate-500 mb-2">
                        Dashboard
                    </div>
                    <h1 className="font-serif text-4xl text-slate-900">Управление</h1>
                </div>
                {(filters.project_id || filters.property_type || filters.status || filters.client_id || filters.only_overdue || filters.only_available) && (
                    <button
                        onClick={() => setFilters(INITIAL_FILTERS)}
                        className="text-sm text-slate-600 hover:text-slate-900 underline"
                        data-testid="dashboard-reset-filters"
                    >
                        Изчисти филтрите
                    </button>
                )}
            </div>

            <DashboardFilters filters={filters} onChange={setFilters} />

            {error && (
                <div
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                    data-testid="dashboard-error"
                >
                    {error}
                </div>
            )}

            {loading && !data && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="dashboard-loading">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl border border-stone-200 bg-white p-5 h-28 animate-pulse" />
                    ))}
                </div>
            )}

            <Tabs value={tab} onValueChange={setTab} className="space-y-6">
                <TabsList className="bg-stone-100 p-1.5 h-auto" data-testid="dashboard-tabs">
                    <TabsTrigger value="overview" data-testid="tab-overview" className="text-sm px-4 py-2">Обзор</TabsTrigger>
                    <TabsTrigger value="sales" data-testid="tab-sales" className="text-sm px-4 py-2">Продажби</TabsTrigger>
                    <TabsTrigger value="finance" data-testid="tab-finance" className="text-sm px-4 py-2">Финанси</TabsTrigger>
                    <TabsTrigger value="calendar" data-testid="tab-calendar" className="text-sm px-4 py-2">Календар</TabsTrigger>
                    <TabsTrigger value="clients" data-testid="tab-clients" className="text-sm px-4 py-2">Клиенти</TabsTrigger>
                    <TabsTrigger value="unsold" data-testid="tab-unsold" className="text-sm px-4 py-2">Непродадени</TabsTrigger>
                    {isFinanceVisible && (
                        <TabsTrigger value="construction" data-testid="tab-construction" className="text-sm px-4 py-2">Строителство</TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="overview">
                    {data && <OverviewTab data={data} isFinanceVisible={isFinanceVisible} />}
                </TabsContent>
                <TabsContent value="sales">
                    {data && <SalesTab data={data} isFinanceVisible={isFinanceVisible} onTypeClick={handleTypeClick} />}
                </TabsContent>
                <TabsContent value="finance">
                    {data && <FinanceTab data={data} />}
                </TabsContent>
                <TabsContent value="calendar">
                    {data && <CalendarTab data={data} isFinanceVisible={isFinanceVisible} />}
                </TabsContent>
                <TabsContent value="clients">
                    {data && <ClientsTab data={data} isFinanceVisible={isFinanceVisible} />}
                </TabsContent>
                <TabsContent value="unsold">
                    {data && <UnsoldTab data={data} isFinanceVisible={isFinanceVisible} />}
                </TabsContent>
                {isFinanceVisible && (
                    <TabsContent value="construction">
                        {data && (
                            <ConstructionCashflowTab
                                data={data}
                                projectId={filters.project_id}
                                onSaved={reloadDashboard}
                            />
                        )}
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
