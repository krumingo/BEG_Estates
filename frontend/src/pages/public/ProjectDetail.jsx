import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, Ruler, Home as HomeIcon } from "lucide-react";
import PublicHeader from "../../components/layout/PublicHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { api, currency } from "../../lib/api";
import { PROPERTY_STATUS, PROPERTY_TYPE_LABELS } from "../../lib/constants";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import InquiryForm from "./InquiryForm";

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
        return Object.entries(groups).sort((a, b) => b[0] - a[0]);
    }, [properties, typeFilter]);

    if (!project) {
        return (
            <div className="min-h-screen pt-24 text-center text-slate-500">Зареждане…</div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <PublicHeader dark />

            {/* Cover */}
            <section className="relative h-[75vh] min-h-[520px] overflow-hidden">
                <img src={project.cover_image} alt={project.name} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/80" />
                <div className="relative z-10 h-full mx-auto max-w-7xl px-6 lg:px-10 flex flex-col justify-end pb-14 text-white">
                    <div className="overline text-white/70 mb-3">{project.status.replace("_", " ")}</div>
                    <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl tracking-tight leading-none">{project.name}</h1>
                    <div className="mt-4 flex items-center gap-2 text-white/80 text-sm"><MapPin className="h-4 w-4" /> {project.city} · {project.address}</div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-7 space-y-6">
                    <div className="overline">За проекта</div>
                    <p className="text-slate-700 leading-relaxed text-lg">{project.description}</p>
                </div>
                <div className="lg:col-span-5">
                    <div className="grid grid-cols-2 gap-4">
                        <StatCard label="Завършено" value={`${project.progress_percent}%`} />
                        <StatCard label="Очаквано завършване" value={project.completion_date || "—"} />
                        <StatCard label="Общо имоти" value={properties.length} />
                        <StatCard label="Свободни" value={properties.filter((p) => p.status === "свободен").length} />
                    </div>
                </div>
            </section>

            {/* Availability */}
            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-12">
                <div className="overline mb-3">Наличност</div>
                <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-8">Избери своя имот</h2>
                <Tabs value={typeFilter} onValueChange={setTypeFilter} data-testid="property-type-tabs">
                    <TabsList className="bg-stone-100">
                        <TabsTrigger value="apartment" data-testid="tab-apartments">Апартаменти</TabsTrigger>
                        <TabsTrigger value="garage" data-testid="tab-garages">Гаражи</TabsTrigger>
                        <TabsTrigger value="parking" data-testid="tab-parking">Паркоместа</TabsTrigger>
                    </TabsList>
                    <TabsContent value={typeFilter} className="mt-8">
                        {byFloor.length === 0 && (
                            <div className="text-slate-500 text-sm">Няма налични имоти в тази категория.</div>
                        )}
                        {byFloor.map(([floor, items]) => (
                            <div key={floor} className="mb-10">
                                <div className="flex items-baseline justify-between mb-4">
                                    <h3 className="font-serif text-2xl text-slate-900">
                                        {floor > 0 ? `Етаж ${floor}` : floor === -1 ? "Подземен паркинг" : `Приземен`}
                                    </h3>
                                    <span className="text-sm text-slate-500">{items.length} имота</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {items.map((p) => (
                                        <PropertyCell key={p.id} p={p} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                </Tabs>
            </section>

            {/* Progress */}
            <section className="bg-stone-50 py-20">
                <div className="mx-auto max-w-7xl px-6 lg:px-10">
                    <div className="overline mb-3">Прогрес на строителството</div>
                    <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-10">Последни новини</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {project.lat && (
                            <div className="md:col-span-3 rounded-xl overflow-hidden border hairline">
                                <iframe
                                    title="location"
                                    className="w-full h-80"
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${project.lng - 0.01}%2C${project.lat - 0.008}%2C${project.lng + 0.01}%2C${project.lat + 0.008}&layer=mapnik&marker=${project.lat}%2C${project.lng}`}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Inquiry */}
            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-24">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                    <div className="lg:col-span-5">
                        <div className="overline mb-3">Свържи се с нас</div>
                        <h2 className="font-serif text-4xl text-slate-900 mb-4">Оставете запитване</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Наш консултант ще се свърже с вас до 24 часа.
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

function StatCard({ label, value }) {
    return (
        <div className="rounded-xl border hairline p-5 bg-stone-50">
            <div className="overline mb-2">{label}</div>
            <div className="text-2xl font-medium text-slate-900">{value}</div>
        </div>
    );
}

function PropertyCell({ p }) {
    const s = PROPERTY_STATUS[p.status];
    const disabled = p.status !== "свободен";
    return (
        <Link
            to={`/properties/${p.id}`}
            data-testid={`property-cell-${p.code}`}
            className={`block rounded-lg border hairline p-4 transition hover:border-slate-900 ${disabled ? "opacity-80" : ""}`}
        >
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="overline">{PROPERTY_TYPE_LABELS[p.property_type]}</div>
                    <div className="font-serif text-2xl text-slate-900">{p.code}</div>
                </div>
                <StatusBadge status={p.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
                {p.rooms != null && <div className="text-slate-600"><HomeIcon className="inline h-3.5 w-3.5 mr-1" /> {p.rooms} стаи</div>}
                {p.area_total != null && <div className="text-slate-600"><Ruler className="inline h-3.5 w-3.5 mr-1" /> {p.area_total} м²</div>}
            </div>
            {p.price_total != null && (
                <div className="mt-3 text-lg font-medium text-slate-900">
                    {currency(p.price_total)}
                </div>
            )}
        </Link>
    );
}
