import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import ClientSidebar from "../../components/layout/ClientSidebar";
import { api, currency, formatDate, daysRemaining } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PROPERTY_TYPE_LABELS, RESERVATION_TYPE_LABELS } from "../../lib/constants";
import { Clock, Home as HomeIcon, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";

export function ClientLayout() {
    return (
        <div className="min-h-screen bg-white">
            <ClientSidebar />
            <main className="lg:pl-64 p-6 lg:p-10 max-w-6xl">
                <Outlet />
            </main>
        </div>
    );
}

export default function ClientDashboard() {
    const [data, setData] = useState(null);
    useEffect(() => {
        api.get("/dashboard/client").then((r) => setData(r.data)).catch(() => {});
    }, []);

    if (!data) return <div className="text-slate-500">Зареждане…</div>;
    const { reservations, installments } = data;
    const nextInstallment = installments.find((i) => i.status !== "платено");

    return (
        <div className="space-y-10">
            <div>
                <div className="overline mb-2">Моят портал</div>
                <h1 className="font-serif text-4xl sm:text-5xl text-slate-900 leading-none">Добре дошли</h1>
            </div>

            {reservations.length === 0 && (
                <div className="rounded-xl border hairline p-8 bg-stone-50 text-center">
                    <HomeIcon className="mx-auto h-6 w-6 text-slate-400 mb-2" />
                    <p className="text-slate-600">Все още нямате резервирани имоти.</p>
                    <Link to="/projects" className="inline-block mt-4 text-sm underline text-slate-900" data-testid="client-explore-projects">Разгледай проектите</Link>
                </div>
            )}

            {reservations.length > 0 && (
                <section>
                    <div className="flex items-baseline justify-between mb-4">
                        <h2 className="font-serif text-2xl text-slate-900">Моите имоти</h2>
                        <span className="text-sm text-slate-500">{reservations.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {reservations.map((r) => (
                            <ReservationCard key={r.id} r={r} />
                        ))}
                    </div>
                </section>
            )}

            {nextInstallment && (
                <section>
                    <h2 className="font-serif text-2xl text-slate-900 mb-4">Следваща вноска</h2>
                    <div className="rounded-xl border hairline p-6 bg-white flex items-center justify-between" data-testid="client-next-installment">
                        <div>
                            <div className="overline">Вноска #{nextInstallment.number}</div>
                            <div className="text-2xl font-medium text-slate-900 mt-1">{currency(nextInstallment.amount, nextInstallment.currency)}</div>
                            <div className="text-sm text-slate-500 mt-1"><CalendarClock className="inline h-3.5 w-3.5 mr-1" /> Падеж: {formatDate(nextInstallment.due_date)}</div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs bg-amber-50 text-amber-700 border-amber-200">{nextInstallment.status}</span>
                    </div>
                </section>
            )}
        </div>
    );
}

function ReservationCard({ r }) {
    const remaining = daysRemaining(r.expires_at);
    const p = r.property;
    return (
        <Link
            to={`/portal/reservations`}
            data-testid={`client-reservation-${r.id}`}
            className="block rounded-xl border hairline p-5 hover:border-slate-900 transition"
        >
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="overline">{PROPERTY_TYPE_LABELS[p?.property_type]}</div>
                    <div className="font-serif text-3xl text-slate-900">{p?.code}</div>
                </div>
                <StatusBadge status={p?.status} />
            </div>
            <div className="text-sm text-slate-500 mb-3">{r.project?.name}</div>
            <div className="flex items-center justify-between pt-3 border-t hairline">
                <div className="text-xs overline">{RESERVATION_TYPE_LABELS[r.reservation_type]}</div>
                {r.status === "active" && remaining != null && (
                    <div className={`text-xs flex items-center gap-1 ${remaining <= 2 ? "text-amber-700" : "text-slate-500"}`}>
                        <Clock className="h-3.5 w-3.5" /> {remaining > 0 ? `Остават ${remaining} дни` : "Изтича днес"}
                    </div>
                )}
            </div>
        </Link>
    );
}
