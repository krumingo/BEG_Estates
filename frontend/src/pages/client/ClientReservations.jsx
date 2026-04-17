import React, { useEffect, useState } from "react";
import { api, currency, formatDate, daysRemaining } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { PROPERTY_TYPE_LABELS, RESERVATION_STATUS_LABELS, RESERVATION_TYPE_LABELS } from "../../lib/constants";

export default function ClientReservations() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        api.get("/reservations").then((r) => setItems(r.data)).catch(() => {});
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Резервации</div>
                <h1 className="font-serif text-4xl text-slate-900">Моите резервации</h1>
            </div>

            <div className="space-y-3">
                {items.map((r) => {
                    const remaining = daysRemaining(r.expires_at);
                    return (
                        <div key={r.id} data-testid={`reservation-row-${r.id}`} className="rounded-xl border hairline p-5 bg-white">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="overline">{PROPERTY_TYPE_LABELS[r.property?.property_type]}</div>
                                    <div className="font-serif text-2xl text-slate-900">{r.property?.code}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={r.property?.status} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <Info label="Тип резервация" value={RESERVATION_TYPE_LABELS[r.reservation_type]} />
                                <Info label="Статус" value={RESERVATION_STATUS_LABELS[r.status]} />
                                <Info label="Създадена" value={formatDate(r.created_at)} />
                                <Info label="Валидна до" value={`${formatDate(r.expires_at)}${remaining != null && r.status === "active" ? ` · ${remaining}д.` : ""}`} />
                            </div>
                        </div>
                    );
                })}
                {items.length === 0 && <div className="text-sm text-slate-500">Нямате резервации.</div>}
            </div>
        </div>
    );
}

function Info({ label, value }) {
    return (
        <div>
            <div className="overline">{label}</div>
            <div className="mt-1 text-slate-900 font-medium">{value}</div>
        </div>
    );
}
