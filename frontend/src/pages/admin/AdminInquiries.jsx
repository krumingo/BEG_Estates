import React, { useEffect, useState } from "react";
import { api, formatDate } from "../../lib/api";

export default function AdminInquiries() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        api.get("/inquiries").then((r) => setItems(r.data)).catch(() => {});
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Запитвания</div>
                <h1 className="font-serif text-4xl text-slate-900">Клиентски запитвания</h1>
            </div>
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
                        {items.map((i) => (
                            <tr key={i.id} className="border-t hairline" data-testid={`inquiry-${i.id}`}>
                                <td className="p-3 font-medium">{i.name}</td>
                                <td className="p-3 text-slate-600">{i.email}</td>
                                <td className="p-3 text-slate-600">{i.phone || "—"}</td>
                                <td className="p-3 text-slate-600 max-w-md">{i.message}</td>
                                <td className="p-3 text-slate-600">{formatDate(i.created_at)}</td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={5}>Няма запитвания.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
