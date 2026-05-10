import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../../components/layout/AdminSidebar";
import { api } from "../../lib/api";
import CashCards from "../../components/admin/CashCards";
import ProjectFilter from "../../components/admin/ProjectFilter";

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

/**
 * R.5 Част 2: Нов финансов дашборд.
 *
 * Този commit добавя само Кеш секция + Project filter.
 * Останалите секции (Sales, Calendar, Top clients, Recent sales, Alerts)
 * идват в Част 3 и Част 4.
 */
export default function AdminDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [projectId, setProjectId] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const params = projectId ? { project_id: projectId } : {};
        api.get("/dashboard/admin/full", { params })
            .then((r) => {
                if (!cancelled) setData(r.data);
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(e?.response?.data?.detail || "Грешка при зареждане");
                    setData(null);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    return (
        <div className="space-y-8">
            {/* HEADER + PROJECT FILTER */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-wider font-medium text-slate-500 mb-2">
                        Dashboard
                    </div>
                    <h1 className="font-serif text-4xl text-slate-900">Преглед</h1>
                </div>
                <ProjectFilter value={projectId} onChange={setProjectId} />
            </div>

            {error && (
                <div
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                    data-testid="dashboard-error"
                >
                    {error}
                </div>
            )}

            {/* СЕКЦИЯ 1: КЕШ */}
            {(loading || (data && data.is_finance_visible)) && (
                <section data-testid="dashboard-cash-section">
                    <h2 className="font-serif text-2xl text-slate-900 mb-4">
                        Кеш днес
                    </h2>
                    <CashCards
                        cash={data?.cash}
                        soldCount={data?.sales?.sold_count}
                        soldValueWithVat={data?.sales?.sold_value_with_vat}
                        loading={loading}
                    />
                </section>
            )}

            {/* Ако потребителят НЕ е финансов — показваме само бройки */}
            {!loading && data && !data.is_finance_visible && (
                <section
                    className="rounded-xl border border-stone-200 bg-white p-6"
                    data-testid="dashboard-non-finance-summary"
                >
                    <div className="text-xs uppercase tracking-wider font-medium text-slate-500 mb-2">
                        Продажби
                    </div>
                    <div className="text-3xl font-medium text-slate-900">
                        {data.sales?.sold_count ?? 0} продадени имота
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                        от общо {data.sales?.total_count ?? 0} в проекта
                    </div>
                </section>
            )}

            {/* PLACEHOLDER за следващите секции — за да се вижда че идват */}
            {!loading && data && (
                <section
                    className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center"
                    data-testid="dashboard-coming-soon"
                >
                    <div className="text-sm text-slate-500">
                        Останалите секции (Продажби по тип, Календар, Топ клиенти,
                        Последни продажби, Алерти) идват в следващите части.
                    </div>
                </section>
            )}
        </div>
    );
}
