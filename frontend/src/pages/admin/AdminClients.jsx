import React, { useEffect, useState } from "react";
import { api, formatDate } from "../../lib/api";

export default function AdminClients() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        api.get("/clients").then((r) => setItems(r.data)).catch(() => {});
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Клиенти</div>
                <h1 className="font-serif text-4xl text-slate-900">Всички клиенти</h1>
            </div>
            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Име</th>
                            <th className="text-left p-3 font-medium">Имейл</th>
                            <th className="text-left p-3 font-medium">Телефон</th>
                            <th className="text-right p-3 font-medium">Резервации</th>
                            <th className="text-left p-3 font-medium">Регистрация</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((c) => (
                            <tr key={c.id} className="border-t hairline" data-testid={`admin-client-${c.id}`}>
                                <td className="p-3 font-medium">{c.name}</td>
                                <td className="p-3 text-slate-600">{c.email}</td>
                                <td className="p-3 text-slate-600">{c.phone || "—"}</td>
                                <td className="p-3 text-right font-medium">{c.reservation_count}</td>
                                <td className="p-3 text-slate-600">{formatDate(c.created_at)}</td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={5}>Няма клиенти.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
