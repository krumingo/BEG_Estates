import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    MapPin,
    Ruler,
    Home as HomeIcon,
    ShoppingCart,
    Trees,
    School,
    Bus,
    Hammer,
} from "lucide-react";
import PublicHeader from "../../components/layout/PublicHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { api, currency, formatDate } from "../../lib/api";
import {
    PROPERTY_STATUS,
    PROPERTY_TYPE_FILTERS,
    PROPERTY_TYPE_LABELS,
    PROJECT_STATUS_LABELS,
} from "../../lib/constants";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import InquiryForm from "./InquiryForm";

const AMENITY_ICON = {
    "shopping-cart": ShoppingCart,
    trees: Trees,
    school: School,
    bus: Bus,
};

export default function ProjectDetail() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [properties, setProperties] = useState([]);
    const [typeFilter, setTypeFilter] = useState("apartment");

    useEffect(() => {
        api.get(`/projects/${id}`).then((r) => setData(r.data)).catch(() => {});
        api.get(`/projects/${id}/properties`).then((r) => setProperties(r.data)).catch(() => {});
    }, [id]);

    const project = data?.project;

    const byFloor = useMemo(() => {
        const filtered = properties.filter((p) => p.property_type === typeFilter);
        const groups = {};
        filtered.forEach((p) => {
            const k = p.floor;
            if (!groups[k]) groups[k] = [];
            groups[k].push(p);
        });
        return Object.entries(groups).sort((a, b) => Number(b[0]) - Number(a[0]));
    }, [properties, typeFilter]);

    if (!project) {
        return <div className="min-h-screen pt-24 text-center text-slate-500">Зареждане…</div>;
    }

    const totalAvailable = properties.filter((p) => p.status === "available").length;

    return (
        <div className="min-h-screen bg-white">
            <PublicHeader dark />

            {/* Cover */}
            <section className="relative h-[80vh] min-h-[560px] overflow-hidden grain">
                <img
                    src={project.cover_image}
                    alt={project.name}
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/80" />
                <div className="relative z-10 h-full mx-auto max-w-7xl px-6 lg:px-10 flex flex-col justify-end pb-16 text-white">
                    <div className="overline text-white/70 mb-3">
                        {PROJECT_STATUS_LABELS[project.status] || project.status}
                    </div>
                    <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl tracking-tight leading-[0.95]">
                        {project.name}
                    </h1>
                    <div className="mt-5 flex items-center gap-2 text-white/80 text-sm max-w-3xl">
                        <MapPin className="h-4 w-4 flex-shrink-0" /> {project.address}
                    </div>
                </div>
            </section>

            {/* Summary */}
            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-7 space-y-6">
                    <div className="overline">За проекта</div>
                    <p className="text-slate-700 leading-relaxed text-lg">{project.description}</p>
                </div>
                <div className="lg:col-span-5">
                    <div className="grid grid-cols-2 gap-4">
                        <StatCard label="Завършено" value={`${project.progress_percent}%`} />
                        <StatCard label="Планирано завършване" value={formatDate(project.completion_date)} />
                        <StatCard label="Общо обекти" value={properties.length} />
                        <StatCard label="Свободни" value={totalAvailable} highlight />
                    </div>
                </div>
            </section>

            {/* Gallery */}
            {project.gallery && project.gallery.length > 1 && (
                <section className="mx-auto max-w-7xl px-6 lg:px-10 pb-16">
                    <div className="overline mb-3">Галерия</div>
                    <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-8">Визия</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {project.gallery.slice(0, 6).map((src, i) => (
                            <div
                                key={i}
                                className={`overflow-hidden rounded-xl bg-stone-100 ${
                                    i === 0 ? "md:col-span-2 md:row-span-2 aspect-[4/3]" : "aspect-square"
                                }`}
                                data-testid={`gallery-image-${i}`}
                            >
                                <img src={src} alt="" className="w-full h-full object-cover hover:scale-[1.04] transition-transform duration-700" />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Nearby amenities */}
            {project.nearby_amenities && project.nearby_amenities.length > 0 && (
                <section className="bg-stone-50 py-20">
                    <div className="mx-auto max-w-7xl px-6 lg:px-10">
                        <div className="overline mb-3">Локация</div>
                        <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-10">В непосредствена близост</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {project.nearby_amenities.map((a, i) => {
                                const Icon = AMENITY_ICON[a.icon] || MapPin;
                                return (
                                    <div
                                        key={i}
                                        data-testid={`amenity-${a.icon}`}
                                        className="rounded-xl border hairline bg-white p-5 hover:border-slate-900 transition"
                                    >
                                        <div className="h-10 w-10 rounded-full bg-slate-900 text-white flex items-center justify-center mb-4">
                                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                                        </div>
                                        <div className="font-serif text-lg text-slate-900 leading-tight">{a.label}</div>
                                        <div className="text-xs text-slate-500 mt-1">{a.walk_time}</div>
                                    </div>
                                );
                            })}
                        </div>
                        {project.lat && (
                            <div className="mt-10 rounded-xl overflow-hidden border hairline">
                                <iframe
                                    title="location-map"
                                    className="w-full h-[400px]"
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${project.lng - 0.01}%2C${project.lat - 0.008}%2C${project.lng + 0.01}%2C${project.lat + 0.008}&layer=mapnik&marker=${project.lat}%2C${project.lng}`}
                                />
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Availability */}
            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-20">
                <div className="overline mb-3">Наличност</div>
                <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-8">Избери своя обект</h2>
                <Tabs value={typeFilter} onValueChange={setTypeFilter} data-testid="property-type-tabs">
                    <TabsList className="bg-stone-100 flex-wrap h-auto">
                        {PROPERTY_TYPE_FILTERS.map((f) => (
                            <TabsTrigger key={f.value} value={f.value} data-testid={`tab-${f.value}`}>
                                {f.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <TabsContent value={typeFilter} className="mt-8">
                        {byFloor.length === 0 && (
                            <div className="text-slate-500 text-sm">Няма обекти в тази категория.</div>
                        )}
                        {byFloor.map(([floor, items]) => (
                            <div key={floor} className="mb-10">
                                <div className="flex items-baseline justify-between mb-4">
                                    <h3 className="font-serif text-2xl text-slate-900">
                                        {Number(floor) > 0
                                            ? `Етаж ${floor}`
                                            : Number(floor) === 0
                                              ? "Партер"
                                              : "Сутерен / Паркинг"}
                                    </h3>
                                    <span className="text-sm text-slate-500">{items.length} обекта</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {items.map((p) => <PropertyCell key={p.id} p={p} />)}
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                </Tabs>
            </section>

            {/* Construction progress */}
            {data?.updates && data.updates.length > 0 && (
                <section className="bg-stone-50 py-20">
                    <div className="mx-auto max-w-7xl px-6 lg:px-10">
                        <div className="overline mb-3">Прогрес на строителството</div>
                        <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-10">
                            Последни новини
                        </h2>
                        <div className="relative border-l hairline pl-8 space-y-8">
                            {data.updates.map((u) => (
                                <div key={u.id} className="relative" data-testid={`update-${u.id}`}>
                                    <div className="absolute -left-[37px] top-1 h-5 w-5 rounded-full bg-white border hairline flex items-center justify-center">
                                        <Hammer className="h-2.5 w-2.5 text-slate-600" />
                                    </div>
                                    <div className="overline">{formatDate(u.created_at)}</div>
                                    <h3 className="font-serif text-2xl text-slate-900 mt-1">{u.title}</h3>
                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed max-w-2xl">
                                        {u.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Inquiry */}
            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-24">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                    <div className="lg:col-span-5">
                        <div className="overline mb-3">Свържи се с нас</div>
                        <h2 className="font-serif text-4xl text-slate-900 mb-4">Оставете запитване</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Наш консултант ще се свърже с вас до 24 часа за тази сграда.
                        </p>
                    </div>
                    <div className="lg:col-span-7">
                        <InquiryForm projectId={project.id} />
                    </div>
                </div>
            </section>
        </div>
    );
}

function StatCard({ label, value, highlight }) {
    return (
        <div className={`rounded-xl border hairline p-5 ${highlight ? "bg-slate-900 text-white border-slate-900" : "bg-stone-50"}`}>
            <div className={`overline ${highlight ? "text-white/60" : ""}`}>{label}</div>
            <div className={`text-2xl font-medium mt-2 ${highlight ? "text-white" : "text-slate-900"}`}>
                {value}
            </div>
        </div>
    );
}

function PropertyCell({ p }) {
    const s = PROPERTY_STATUS[p.status] || PROPERTY_STATUS.available;
    const disabled = p.status !== "available";
    const displayPrice = p.list_price ?? p.base_price;
    return (
        <Link
            to={`/properties/${p.id}`}
            data-testid={`property-cell-${p.code}`}
            className={`block rounded-lg border hairline p-4 transition hover:border-slate-900 ${disabled ? "opacity-85" : ""}`}
        >
            <div className="flex items-start justify-between mb-3 gap-2">
                <div>
                    <div className="overline">{PROPERTY_TYPE_LABELS[p.property_type]}</div>
                    <div className="font-serif text-2xl text-slate-900">{p.code}</div>
                </div>
                <StatusBadge status={p.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
                {p.rooms != null && (
                    <div className="text-slate-600"><HomeIcon className="inline h-3.5 w-3.5 mr-1" /> {p.rooms} стаи</div>
                )}
                {p.area_total != null && (
                    <div className="text-slate-600"><Ruler className="inline h-3.5 w-3.5 mr-1" /> {p.area_total} м²</div>
                )}
            </div>
            {displayPrice != null && (
                <div className="mt-3 text-lg font-medium text-slate-900">{currency(displayPrice)}</div>
            )}
        </Link>
    );
}
