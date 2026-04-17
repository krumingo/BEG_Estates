import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import PublicHeader from "../../components/layout/PublicHeader";
import { api } from "../../lib/api";

export default function Projects() {
    const [projects, setProjects] = useState([]);
    useEffect(() => {
        api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
    }, []);

    return (
        <div className="min-h-screen bg-white pt-24">
            <PublicHeader />
            <section className="mx-auto max-w-7xl px-6 lg:px-10 pt-12 pb-24">
                <div className="overline mb-4">Каталог</div>
                <h1 className="font-serif text-5xl sm:text-6xl text-slate-900 tracking-tight leading-none mb-16">
                    Всички проекти
                </h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {projects.map((p) => (
                        <Link
                            key={p.id}
                            to={`/projects/${p.id}`}
                            data-testid={`projects-card-${p.id}`}
                            className="group block"
                        >
                            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-stone-100 relative">
                                <img src={p.cover_image} alt={p.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-slate-900">
                                    {p.progress_percent}% завършен
                                </div>
                            </div>
                            <div className="mt-5 grid grid-cols-3 gap-6">
                                <div className="col-span-2">
                                    <h3 className="font-serif text-3xl text-slate-900">{p.name}</h3>
                                    <div className="mt-1 text-sm text-slate-500 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {p.city} · {p.address}</div>
                                    <p className="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-2">{p.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className="overline">Свободни</div>
                                    <div className="text-2xl font-medium text-slate-900">
                                        {p.stats?.available || 0}
                                    </div>
                                    <div className="text-xs text-slate-400">от {p.stats?.total || 0}</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
