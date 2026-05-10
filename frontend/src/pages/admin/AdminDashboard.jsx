import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../../components/layout/AdminSidebar";
import { api } from "../../lib/api";
import CashCards from "../../components/admin/CashCards";
import ProjectFilter from "../../components/admin/ProjectFilter";
import SalesCards from "../../components/admin/SalesCards";
import SalesByTypeTable from "../../components/admin/SalesByTypeTable";
import RecentSalesTable from "../../components/admin/RecentSalesTable";
import CalendarSection from "../../components/admin/CalendarSection";
import TopClientsTable from "../../components/admin/TopClientsTable";
import AlertsList from "../../components/admin/AlertsList";

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
 * R.5: Финансов дашборд (финална версия).
 *
 * Секции (по ред):
 *   1. Header + Project filter
 *   2. Кеш днес — 3 карти (Част 2, finance only)
 *   3. Статус на продажбите — 3 карти (Част 3)
 *   4. По тип имот — таблица (Част 3)
 *   5. Последни продажби — таблица (Част 3)
 *   6. Календар на вноски — карти + bar chart + upcoming таблица (Част 4, finance only)
 *   7. Топ клиенти — таблица (Част 4, finance only)
 *   8. Алерти — списък по severity (Част 4)
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

    const isFinanceVisible = data?.is_finance_visible ?? false;

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

            {/* СЕКЦИЯ 1: КЕШ (Част 2, finance only) */}
            {(loading || (data && isFinanceVisible)) && (
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

            {/* СЕКЦИЯ 2: СТАТУС НА ПРОДАЖБИТЕ (Част 3) */}
            <section data-testid="dashboard-sales-section">
                <h2 className="font-serif text-2xl text-slate-900 mb-4">
                    Статус на продажбите
                </h2>
                <SalesCards
                    sales={data?.sales}
                    isFinanceVisible={isFinanceVisible}
                    loading={loading}
                />
            </section>

            {/* СЕКЦИЯ 3: ПО ТИП ИМОТ (Част 3) */}
            <section data-testid="dashboard-by-type-section">
                <h2 className="font-serif text-2xl text-slate-900 mb-4">
                    По тип имот
                </h2>
                <SalesByTypeTable
                    byType={data?.sales?.by_type}
                    isFinanceVisible={isFinanceVisible}
                    loading={loading}
                />
            </section>

            {/* СЕКЦИЯ 4: ПОСЛЕДНИ ПРОДАЖБИ (Част 3) */}
            <section data-testid="dashboard-recent-sales-section">
                <h2 className="font-serif text-2xl text-slate-900 mb-4">
                    Последни продажби
                </h2>
                <RecentSalesTable
                    sales={data?.recent_sales}
                    isFinanceVisible={isFinanceVisible}
                    loading={loading}
                />
            </section>

            {/* СЕКЦИЯ 5: КАЛЕНДАР НА ВНОСКИ (Част 4, finance only) */}
            {(loading || (data && isFinanceVisible)) && (
                <section data-testid="dashboard-calendar-section">
                    <h2 className="font-serif text-2xl text-slate-900 mb-4">
                        Календар на вноски
                    </h2>
                    <CalendarSection
                        calendar={data?.calendar}
                        loading={loading}
                    />
                </section>
            )}

            {/* СЕКЦИЯ 6: ТОП КЛИЕНТИ (Част 4, finance only) */}
            {(loading || (data && isFinanceVisible)) && (
                <section data-testid="dashboard-top-clients-section">
                    <h2 className="font-serif text-2xl text-slate-900 mb-4">
                        Топ клиенти
                    </h2>
                    <TopClientsTable
                        clients={data?.top_clients}
                        loading={loading}
                    />
                </section>
            )}

            {/* СЕКЦИЯ 7: АЛЕРТИ (Част 4, всички роли) */}
            <section data-testid="dashboard-alerts-section">
                <h2 className="font-serif text-2xl text-slate-900 mb-4">
                    Алерти
                </h2>
                <AlertsList
                    alerts={data?.alerts}
                    isFinanceVisible={isFinanceVisible}
                    loading={loading}
                />
            </section>
        </div>
    );
}
