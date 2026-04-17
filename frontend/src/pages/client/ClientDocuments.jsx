import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { api, formatDate } from "../../lib/api";

export default function ClientDocuments() {
    const [data, setData] = useState(null);
    useEffect(() => {
        api.get("/dashboard/client").then((r) => setData(r.data)).catch(() => {});
    }, []);
    if (!data) return <div className="text-slate-500">Зареждане…</div>;

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Документи</div>
                <h1 className="font-serif text-4xl text-slate-900">Моите документи</h1>
            </div>
            <div className="space-y-3">
                {(data.documents || []).map((d) => (
                    <div key={d.id} data-testid={`document-row-${d.id}`} className="rounded-xl border hairline p-4 bg-white flex items-center gap-4">
                        <FileText className="h-5 w-5 text-slate-500" strokeWidth={1.5} />
                        <div className="flex-1">
                            <div className="font-medium text-slate-900">{d.name}</div>
                            <div className="text-xs text-slate-500">{formatDate(d.created_at)} · {d.type}</div>
                        </div>
                    </div>
                ))}
                {(!data.documents || data.documents.length === 0) && (
                    <div className="text-sm text-slate-500">Все още нямате качени документи.</div>
                )}
            </div>
        </div>
    );
}
