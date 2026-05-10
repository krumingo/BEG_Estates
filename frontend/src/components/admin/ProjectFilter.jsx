import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

/**
 * R.5 Част 2: Project filter dropdown.
 *
 * Зарежда проекти от /api/projects и позволява избор:
 *   - "Всички проекти" (default) → връща null
 *   - Конкретен проект → връща project_id
 *
 * Props:
 *   value: string | null — текущо избран project_id (null = всички)
 *   onChange: (project_id | null) => void
 */
export default function ProjectFilter({ value, onChange }) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.get("/projects")
            .then((r) => {
                if (!cancelled) {
                    setProjects(Array.isArray(r.data) ? r.data : []);
                }
            })
            .catch(() => {
                if (!cancelled) setProjects([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleChange = (e) => {
        const v = e.target.value;
        onChange(v === "__all__" ? null : v);
    };

    return (
        <div
            className="inline-flex items-center gap-2"
            data-testid="dashboard-project-filter"
        >
            <label
                htmlFor="dashboard-project-select"
                className="text-xs uppercase tracking-wider font-medium text-slate-500"
            >
                Проект
            </label>
            <select
                id="dashboard-project-select"
                value={value || "__all__"}
                onChange={handleChange}
                disabled={loading}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            >
                <option value="__all__">Всички проекти</option>
                {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
