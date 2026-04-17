import React, { useEffect, useState } from "react";
import { api, formatDate, daysRemaining } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { RESERVATION_STATUS_LABELS, RESERVATION_TYPE_LABELS } from "../../lib/constants";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

export default function AdminReservations() {
    const [items, setItems] = useState([]);

    const load = () => api.get("/reservations").then((r) => setItems(r.data)).catch(() => {});
    useEffect(() => { load(); }, []);

    const release = async (id) => {
        try {
            await api.post(`/reservations/${id}/release`);
            toast.success("Резервацията е освободена");
            load();
        } catch (e) {
            toast.error("Грешка");
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Резервации</div>
                <h1 className="font-serif text-4xl text-slate-900">Активни и предишни</h1>
            </div>

            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Имот</th>
                            <th className="text-left p-3 font-medium">Клиент</th>
                            <th className="text-left p-3 font-medium">Тип</th>
                            <th className="text-left p-3 font-medium">Имот-статус</th>
                            <th className="text-left p-3 font-medium">Резервация</th>
                            <th className="text-left p-3 font-medium">Валидна до</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((r) => {
                            const remaining = daysRemaining(r.expires_at);
                            return (
                                <tr key={r.id} className="border-t hairline" data-testid={`admin-reservation-${r.id}`}>
                                    <td className="p-3 font-mono font-medium">{r.property?.code}</td>
                                    <td className="p-3 text-slate-600">
                                        <div>{r.client?.name}</div>
                                        <div className="text-xs text-slate-400">{r.client?.email}</div>
                                    </td>
                                    <td className="p-3"><span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs bg-amber-50 text-amber-700 border-amber-200">{RESERVATION_TYPE_LABELS[r.reservation_type]}</span></td>
                                    <td className="p-3"><StatusBadge status={r.property?.status} /></td>
                                    <td className="p-3 text-slate-600">{RESERVATION_STATUS_LABELS[r.status]}</td>
                                    <td className="p-3 text-slate-600">{formatDate(r.expires_at)}{remaining != null && r.status === "active" ? ` · ${remaining}д.` : ""}</td>
                                    <td className="p-3 text-right">
                                        {r.status === "active" && (
                                            <Button size="sm" variant="outline" onClick={() => release(r.id)} data-testid={`release-reservation-${r.id}`}>
                                                Освободи
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={7}>Няма резервации.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
