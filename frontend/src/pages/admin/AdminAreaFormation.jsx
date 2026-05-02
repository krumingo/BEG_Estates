import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Loader2, AlertCircle, FileText } from "lucide-react";
import { Button } from "../../components/ui/button";

/**
 * Площообразуване — read-only визуализация 1:1 с PDF.
 * Източник: GET /api/projects/{slug}/area-formation (canonical fixture).
 * Тази страница НЕ чете и НЕ пише properties.
 */

const FALLBACK_DASH = "—";

function formatDecimal(v) {
    if (v === null || v === undefined || v === "") return FALLBACK_DASH;
    if (typeof v !== "number") return v;
    return v.toFixed(2).replace(".", ",");
}

function formatPercent(v) {
    if (v === null || v === undefined || v === "") return FALLBACK_DASH;
    if (typeof v !== "number") return v;
    return v.toFixed(3).replace(".", ",") + " %";
}

function formatMoneyBgn(v) {
    if (v === null || v === undefined || v === "") return FALLBACK_DASH;
    if (typeof v !== "number") return v;
    // Хиляди с интервал, без десетични за лева
    return Math.round(v).toLocaleString("bg-BG").replace(/,/g, " ") + " лв.";
}

function formatPlain(v) {
    if (v === null || v === undefined || v === "") return FALLBACK_DASH;
    return String(v);
}

const FORMATTERS = {
    decimal: formatDecimal,
    percent: formatPercent,
    money_bgn: formatMoneyBgn,
};

function renderCell(row, col) {
    const raw = row[col.key];
    const fn = FORMATTERS[col.format] || formatPlain;
    return fn(raw);
}

function AreaFormationTable({ section, columnsTemplate }) {
    // Адаптираме заглавията на Кич / Кпг според секцията
    const columns = columnsTemplate.map((c) => {
        if (c.key === "Kich_pct" && section.kich_label) {
            return { ...c, label: section.kich_label };
        }
        if (c.key === "Kpg" && section.kpg_label) {
            return { ...c, label: section.kpg_label };
        }
        return c;
    });

    return (
        <section
            className="rounded-xl border hairline bg-white overflow-hidden"
            data-testid={`area-formation-section-${section.id}`}
        >
            <header className="px-5 py-4 border-b hairline bg-stone-50">
                <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="font-serif text-2xl text-slate-900">{section.title}</h2>
                    <span className="text-sm text-slate-600">— {section.subtitle}</span>
                </div>
            </header>
            <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-slate-100 text-slate-700">
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    className={`px-2 py-2 border-b border-r hairline whitespace-pre text-${c.align || "left"} font-medium`}
                                    style={c.primary ? { minWidth: 220 } : { minWidth: 70 }}
                                >
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {section.rows.map((row, idx) => (
                            <tr
                                key={`${section.id}-r${idx}`}
                                className="hover:bg-stone-50/60"
                                data-testid={`area-formation-row-${section.id}-${idx}`}
                            >
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        className={`px-2 py-1.5 border-b border-r hairline align-top text-${c.align || "left"} ${c.primary ? "font-medium text-slate-900" : "text-slate-700"}`}
                                    >
                                        {renderCell(row, c)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {section.totals.map((tot, idx) => (
                            <tr
                                key={`${section.id}-t${idx}`}
                                className="bg-amber-50 font-semibold"
                                data-testid={`area-formation-total-${section.id}-${idx}`}
                            >
                                {columns.map((c, ci) => {
                                    if (c.primary) {
                                        return (
                                            <td
                                                key={c.key}
                                                className="px-2 py-2 border-b border-r hairline text-left text-slate-900"
                                                colSpan={1}
                                            >
                                                {tot.label}
                                            </td>
                                        );
                                    }
                                    if (ci < columns.findIndex((cc) => cc.primary) && ci !== 0) {
                                        return <td key={c.key} className="px-2 py-2 border-b border-r hairline" />;
                                    }
                                    if (ci === 0) {
                                        return <td key={c.key} className="px-2 py-2 border-b border-r hairline" />;
                                    }
                                    return (
                                        <td
                                            key={c.key}
                                            className={`px-2 py-2 border-b border-r hairline text-${c.align || "right"} text-slate-900`}
                                        >
                                            {renderCell(tot, c)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function AdminAreaFormation() {
    const [projects, setProjects] = useState([]);
    const [projectSlug, setProjectSlug] = useState("hadzhi-dimitar");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/projects").then((r) => setProjects(r.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!projectSlug) return;
        setLoading(true);
        setError("");
        setData(null);
        api.get(`/projects/${projectSlug}/area-formation`)
            .then((r) => setData(r.data))
            .catch((e) => setError(formatApiError(e.response?.data?.detail) || "Грешка"))
            .finally(() => setLoading(false));
    }, [projectSlug]);

    const grandTotals = useMemo(() => {
        if (!data) return null;
        // вземаме последния total от секция IV (Общо I-а + I-б + II + III + IV)
        const sec4 = data.sections?.find((s) => s.id === "IV");
        const last = sec4?.totals?.[sec4.totals.length - 1];
        return last;
    }, [data]);

    return (
        <div className="space-y-6" data-testid="admin-area-formation-page">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="overline mb-2">Площообразуване</div>
                    <h1 className="font-serif text-4xl text-slate-900">
                        Таблица за определяне на площите
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                        Канонична таблица 1:1 с PDF "Площообразуване" — независим источник
                        от каталога на имотите. Промените тук не пипат properties / статуси /
                        купувачи / резервации.
                    </p>
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                    <div>
                        <label htmlFor="af-project" className="block text-xs text-slate-500 mb-1">
                            Проект
                        </label>
                        <select
                            id="af-project"
                            value={projectSlug}
                            onChange={(e) => setProjectSlug(e.target.value)}
                            className="h-10 rounded-md border hairline bg-white px-3 text-sm"
                            data-testid="area-formation-project-select"
                        >
                            {projects.map((p) => (
                                <option key={p.id} value={p.slug || p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                        data-testid="area-formation-print-btn"
                    >
                        <FileText className="h-4 w-4 mr-1.5" /> Печат / PDF
                    </Button>
                </div>
            </div>

            {loading && (
                <div className="rounded-xl border hairline bg-white p-8 text-sm text-slate-500 inline-flex items-center gap-2" data-testid="area-formation-loading">
                    <Loader2 className="h-4 w-4 animate-spin" /> Зареждане…
                </div>
            )}

            {error && !loading && (
                <div
                    className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800 inline-flex items-center gap-2"
                    data-testid="area-formation-error"
                >
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            )}

            {data && !loading && (
                <>
                    <div
                        className="rounded-md border bg-stone-50 px-4 py-3 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1"
                        data-testid="area-formation-meta"
                    >
                        <span>
                            <span className="font-medium text-slate-800">Проект:</span> {data.project_name}
                        </span>
                        <span>
                            <span className="font-medium text-slate-800">Източник:</span> {data.source_file}
                        </span>
                        <span>
                            <span className="font-medium text-slate-800">Площ на мястото:</span> {data.total_land_area_sqm} кв.м.
                        </span>
                    </div>

                    {data.sections.map((section) => (
                        <AreaFormationTable
                            key={section.id}
                            section={section}
                            columnsTemplate={data.common_columns}
                        />
                    ))}

                    {grandTotals && (
                        <div
                            className="rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-4"
                            data-testid="area-formation-grand-total"
                        >
                            <div className="text-xs uppercase tracking-wide text-amber-800 mb-1">
                                Общо за обекта
                            </div>
                            <div className="font-serif text-xl text-slate-900">
                                {grandTotals.label}
                                {": "}
                                F1 = <strong>{formatDecimal(grandTotals.F1)}</strong> кв.м.
                                {" · "}
                                F1+F2 = <strong>{formatDecimal(grandTotals.FT)}</strong> кв.м.
                            </div>
                        </div>
                    )}

                    {data.notice && (
                        <div className="text-xs text-slate-500 italic">
                            ⓘ {data.notice}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
