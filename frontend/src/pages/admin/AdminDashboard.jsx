import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../../components/layout/AdminSidebar";
import { api } from "../../lib/api";
import CashCards from "../../components/admin/CashCards";
import ProjectFilter from "../../components/admin/ProjectFilter";
import SalesCards from "../../components/admin/SalesCards";
import SalesByTypeTable from "../../components/admin/SalesByTypeTable";
import RecentSalesTable from "../../components/admin/RecentSalesTable";

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
 * R.5: Финансов дашборд.
 *
 * Секции (по ред):
 *   1. Header + Project filter
 *   2. Кеш днес (Част 2): 3 карти платено/очаквано/закъснели
 *   3. Статус на продажбите (Част 3): 3 карти продадено/остава/общо
 *   4. По тип имот (Част 3): таблица
 *   5. Последни продажби (Част 3): таблица
 *   6. Calendar / Top clients / Alerts: идват в Част 4
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

            {/* СЕКЦИЯ 1: КЕШ (Част 2) */}
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

            {/* СЕКЦИЯ 2: СТАТУС НА ПРОДАЖБИТЕ (Част 3 — карти) */}
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

            {/* СЕКЦИЯ 3: ПО ТИП ИМОТ (Част 3 — таблица) */}
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

            {/* СЕКЦИЯ 4: ПОСЛЕДНИ ПРОДАЖБИ (Част 3 — таблица) */}
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

            {/* PLACEHOLDER за Part 4 секциите */}
            {!loading && data && (
                <section
                    className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center"
                    data-testid="dashboard-coming-soon"
                >
                    <div className="text-sm text-slate-500">
                        Календар на вноски, Топ клиенти и Алерти идват в Част 4.
                    </div>
                </section>
            )}
        </div>
    );
}
