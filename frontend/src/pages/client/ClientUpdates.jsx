import React, { useEffect, useState } from "react";
import { api, formatDate } from "../../lib/api";

export default function ClientUpdates() {
    const [items, setItems] = useState([]);
    const [project, setProject] = useState(null);

    useEffect(() => {
        api.get("/projects").then((r) => {
            const p = r.data[0];
            if (p) {
                setProject(p);
                // Attempt fetching updates via dashboard (project_updates live in DB)
                api.get(`/projects/${p.id}`).then((rr) => {
                    // updates aren't returned yet; using a static endpoint path we know:
                    // For scaffold we read from a simple dedicated endpoint
                });
            }
        });
    }, []);

    useEffect(() => {
        if (!project) return;
        // fallback: call a generic project_updates listing is not yet exposed.
        // We'll derive from /projects list (no updates yet) — keep placeholder.
    }, [project]);

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Прогрес</div>
                <h1 className="font-serif text-4xl text-slate-900">Новини по проекта</h1>
            </div>
            {project ? (
                <div className="rounded-xl border hairline p-6 bg-white">
                    <div className="overline mb-2">{project.name}</div>
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                            <div className="h-full bg-slate-900" style={{ width: `${project.progress_percent}%` }} />
                        </div>
                        <div className="text-sm font-medium text-slate-900">{project.progress_percent}%</div>
                    </div>
                </div>
            ) : (
                <div className="text-sm text-slate-500">Няма активни проекти.</div>
            )}
        </div>
    );
}
