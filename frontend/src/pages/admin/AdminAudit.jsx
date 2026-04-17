import React, { useEffect, useState } from "react";
import { api, formatDate } from "../../lib/api";

export default function AdminAudit() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        api.get("/audit-logs").then((r) => setItems(r.data)).catch(() => {});
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Audit log</div>
                <h1 className="font-serif text-4xl text-slate-900">История на действията</h1>
            </div>
            <div className="rounded-xl border hairline bg-white overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Час</th>
                            <th className="text-left p-3 font-medium">Действие</th>
                            <th className="text-left p-3 font-medium">Обект</th>
                            <th className="text-left p-3 font-medium">Обект ID</th>
                            <th className="text-left p-3 font-medium">Actor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((a) => (
                            <tr key={a.id} className="border-t hairline" data-testid={`audit-${a.id}`}>
                                <td className="p-3 font-mono text-xs text-slate-500">{formatDate(a.at)}</td>
                                <td className="p-3 font-medium">{a.action}</td>
                                <td className="p-3 text-slate-600">{a.entity}</td>
                                <td className="p-3 font-mono text-xs text-slate-500">{a.entity_id?.slice(0, 8)}…</td>
                                <td className="p-3 font-mono text-xs text-slate-500">{a.actor_id ? a.actor_id.slice(0, 8) + "…" : "system"}</td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={5}>Няма действия.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
