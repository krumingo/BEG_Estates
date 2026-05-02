import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { PROPERTY_STATUS } from "../../lib/constants";

/**
 * Reusable секция за интерактивна етажна планировка.
 *
 * Props:
 *  - projectId: string (задължително)
 *  - currentFloor: number | null — preselect tab + highlight ('Тук сте')
 *  - currentPropertyId: string | null — highlight ring, no link
 *  - title: string — заглавие (default „Планировка по етажи")
 *  - eyebrow: string — overline над заглавието
 *  - className: container override
 */
export default function FloorPlanSection({
    projectId,
    currentFloor = null,
    currentPropertyId = null,
    title = "Планировка по етажи",
    eyebrow = "Избери по етаж",
    className = "bg-white py-20",
}) {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFloor, setActiveFloor] = useState(null);
    const [dims, setDims] = useState({ natW: 0, natH: 0, renderW: 0 });
    const imgRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!projectId) return;
        setLoading(true);
        api.get(`/projects/${projectId}/floor-plans`)
            .then((r) => {
                const safe = (r.data || []).filter((p) => (p.units || []).length > 0);
                safe.sort((a, b) => a.floor - b.floor);
                setPlans(safe);
                if (safe.length) {
                    const preselect = currentFloor != null
                        && safe.find((p) => p.floor === currentFloor)
                        ? currentFloor
                        : safe[0].floor;
                    setActiveFloor(preselect);
                }
            })
            .catch(() => setPlans([]))
            .finally(() => setLoading(false));
    }, [projectId, currentFloor]);

    const plan = plans.find((p) => p.floor === activeFloor);

    useEffect(() => {
        const handler = () => {
            const el = imgRef.current;
            if (!el) return;
            setDims({
                natW: el.naturalWidth,
                natH: el.naturalHeight,
                renderW: el.clientWidth,
            });
        };
        const el = imgRef.current;
        if (el && el.complete) handler();
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, [plan?.plan_image_url]);

    if (loading) {
        return (
            <section className={className}>
                <div className="mx-auto max-w-7xl px-6 lg:px-10">
                    <div className="h-6 w-40 bg-stone-100 rounded mb-3 animate-pulse" />
                    <div className="h-12 w-72 bg-stone-100 rounded mb-8 animate-pulse" />
                    <div className="aspect-[16/9] bg-stone-100 rounded-xl animate-pulse" />
                </div>
            </section>
        );
    }
    if (!plans.length) return null;

    const scale = dims.natW > 0 ? dims.renderW / dims.natW : 1;

    return (
        <section className={className} data-testid="floor-plan-section">
            <div className="mx-auto max-w-7xl px-6 lg:px-10">
                <div className="overline mb-3">{eyebrow}</div>
                <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-8">{title}</h2>

                <div className="flex flex-wrap gap-2 mb-6" data-testid="floor-plan-tabs">
                    {plans.map((p) => (
                        <button
                            key={p.floor}
                            onClick={() => setActiveFloor(p.floor)}
                            className={`px-4 py-2 rounded-full border text-sm transition ${
                                activeFloor === p.floor
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-700 hover:bg-stone-50 hairline"
                            }`}
                            data-testid={`floor-tab-${p.floor}`}
                        >
                            {p.floor > 0 ? `Етаж ${p.floor}` : p.floor === 0 ? "Партер" : "Сутерен"}
                            <span className="ml-2 text-xs opacity-70">· {p.units.length} обекта</span>
                        </button>
                    ))}
                </div>

                {plan && (
                    <div className="rounded-xl border hairline bg-stone-50 p-3" data-testid="floor-plan-viewer">
                        <div className="relative inline-block w-full">
                            <img
                                ref={imgRef}
                                src={plan.plan_image_url}
                                alt={`Схема · етаж ${plan.floor}`}
                                className="w-full h-auto block rounded-md"
                                onLoad={(e) => setDims({
                                    natW: e.target.naturalWidth,
                                    natH: e.target.naturalHeight,
                                    renderW: e.target.clientWidth,
                                })}
                            />
                            {dims.renderW > 0 && plan.units.map((u) => {
                                const st = PROPERTY_STATUS[u.status] || { label: u.status, dot: "bg-slate-400" };
                                const isCurrent = currentPropertyId && u.property_id === currentPropertyId;
                                const left = u.x * scale;
                                const top = u.y * scale;
                                const w = u.width * scale;
                                const h = u.height * scale;
                                const baseClasses = `h-full w-full rounded-sm ${st.dot || "bg-slate-500"} ${
                                    isCurrent
                                        ? "border-2 ring-2 ring-amber-500 opacity-90"
                                        : "border-2 border-white/90 opacity-60 group-hover:opacity-85 transition"
                                }`;
                                const inner = (
                                    <>
                                        <div className={baseClasses} />
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-xs font-semibold drop-shadow-sm pointer-events-none">
                                            <span>{u.code}</span>
                                            {u.rooms != null && (
                                                <span className="text-[10px] opacity-90">{u.rooms} стаи</span>
                                            )}
                                        </div>
                                        {isCurrent && (
                                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-semibold whitespace-nowrap pointer-events-none">
                                                Тук сте
                                            </div>
                                        )}
                                    </>
                                );
                                if (isCurrent) {
                                    return (
                                        <div
                                            key={u.property_id}
                                            className="absolute group cursor-default"
                                            style={{ left, top, width: w, height: h }}
                                            data-testid={`floor-unit-${u.code}`}
                                            title={`${u.code} · текущ`}
                                        >
                                            {inner}
                                        </div>
                                    );
                                }
                                return (
                                    <Link
                                        key={u.property_id}
                                        to={`/properties/${u.property_id}`}
                                        onClick={(e) => {
                                            // SPA navigation в случай че сме вече в /properties/*
                                            e.preventDefault();
                                            navigate(`/properties/${u.property_id}`);
                                        }}
                                        className="absolute group"
                                        style={{ left, top, width: w, height: h }}
                                        data-testid={`floor-unit-${u.code}`}
                                        title={`${u.code} · ${u.rooms || "?"} стаи · ${st.label}`}
                                    >
                                        {inner}
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-3 mt-4 text-xs text-slate-600" data-testid="floor-plan-legend">
                            {["available","reserved_zero_deposit","reserved_paid_deposit","sold"].map((s) => {
                                const st = PROPERTY_STATUS[s];
                                if (!st) return null;
                                return (
                                    <span key={s} className="inline-flex items-center gap-1.5">
                                        <span className={`inline-block h-3 w-3 rounded-sm ${st.dot || "bg-slate-400"}`} />
                                        {st.label}
                                    </span>
                                );
                            })}
                            {currentPropertyId && (
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="inline-block h-3 w-3 rounded-sm bg-white border-2 ring-2 ring-amber-500" />
                                    Тук сте
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
