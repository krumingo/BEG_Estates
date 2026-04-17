import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../../components/layout/AdminSidebar";
import { api, currency, formatDate } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { Building2, Clock, Home, Users, Wallet, AlertCircle } from "lucide-react";

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

export default function AdminDashboard() {
    const [data, setData] = useState(null);
    useEffect(() => {
        api.get("/dashboard/admin").then((r) => setData(r.data)).catch(() => {});
    }, []);
    if (!data) return <div className="text-slate-500">Зареждане…</div>;
    const k = data.kpi;

    const kpis = [
        { label: "Общо проекти", value: k.total_projects, icon: Building2 },
        { label: "Общо обекти", value: k.total_properties, icon: Home },
        { label: "Свободни", value: k.free, icon: Home, accent: "text-emerald-600" },
        { label: "Капаро 0", value: k.reserved_zero, icon: Clock, accent: "text-amber-600" },
        { label: "С капаро", value: k.reserved_deposit, icon: Clock, accent: "text-orange-600" },
        { label: "Продадени", value: k.sold, icon: Home, accent: "text-slate-500" },
        { label: "Обезщетение", value: k.compensation, icon: Building2, accent: "text-violet-600" },
        { label: "Скрити (admin)", value: k.hidden, icon: Building2, accent: "text-stone-500" },
        { label: "Активни капаро 0", value: k.active_zero_deposit, icon: AlertCircle, accent: "text-amber-600" },
        { label: "Изтичат до 48ч", value: k.expiring_soon, icon: Clock, accent: "text-red-600" },
        { label: "Клиенти", value: k.total_clients, icon: Users },
        { label: "Събрани средства", value: currency(k.total_collected), icon: Wallet, wide: true },
    ];

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Dashboard</div>
                <h1 className="font-serif text-4xl text-slate-900">Преглед</h1>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {kpis.map((k) => (
                    <div key={k.label} data-testid={`kpi-${k.label}`} className={`rounded-xl border hairline p-5 bg-white ${k.wide ? "col-span-2" : ""}`}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="overline">{k.label}</div>
                            <k.icon className={`h-4 w-4 ${k.accent || "text-slate-400"}`} strokeWidth={1.5} />
                        </div>
                        <div className="text-2xl font-medium text-slate-900">{k.value ?? 0}</div>
                    </div>
                ))}
            </div>

            <section>
                <h2 className="font-serif text-2xl text-slate-900 mb-4">Последни резервации</h2>
                <div className="rounded-xl border hairline bg-white overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="text-left p-3 font-medium">Имот</th>
                                <th className="text-left p-3 font-medium">Клиент</th>
                                <th className="text-left p-3 font-medium">Тип</th>
                                <th className="text-left p-3 font-medium">Статус</th>
                                <th className="text-left p-3 font-medium">Валидна до</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.recent_reservations.map((r) => (
                                <tr key={r.id} className="border-t hairline" data-testid={`recent-reservation-${r.id}`}>
                                    <td className="p-3 font-medium">{r.property?.code}</td>
                                    <td className="p-3 text-slate-600">{r.client?.name}</td>
                                    <td className="p-3"><span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs bg-amber-50 text-amber-700 border-amber-200">{r.reservation_type}</span></td>
                                    <td className="p-3 text-slate-600">{r.status}</td>
                                    <td className="p-3 text-slate-600">{formatDate(r.expires_at)}</td>
                                </tr>
                            ))}
                            {data.recent_reservations.length === 0 && (
                                <tr><td className="p-5 text-sm text-slate-500" colSpan={5}>Няма резервации.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <h2 className="font-serif text-2xl text-slate-900 mb-4">Последни запитвания</h2>
                <div className="rounded-xl border hairline bg-white overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="text-left p-3 font-medium">Име</th>
                                <th className="text-left p-3 font-medium">Имейл</th>
                                <th className="text-left p-3 font-medium">Телефон</th>
                                <th className="text-left p-3 font-medium">Съобщение</th>
                                <th className="text-left p-3 font-medium">Дата</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.recent_inquiries.map((i) => (
                                <tr key={i.id} className="border-t hairline">
                                    <td className="p-3 font-medium">{i.name}</td>
                                    <td className="p-3 text-slate-600">{i.email}</td>
                                    <td className="p-3 text-slate-600">{i.phone || "—"}</td>
                                    <td className="p-3 text-slate-600 truncate max-w-xs">{i.message}</td>
                                    <td className="p-3 text-slate-600">{formatDate(i.created_at)}</td>
                                </tr>
                            ))}
                            {data.recent_inquiries.length === 0 && (
                                <tr><td className="p-5 text-sm text-slate-500" colSpan={5}>Няма запитвания.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
