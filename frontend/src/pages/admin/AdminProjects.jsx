import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminProjects() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        api.get("/projects").then((r) => setItems(r.data));
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Проекти</div>
                <h1 className="font-serif text-4xl text-slate-900">Всички проекти</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}`} data-testid={`admin-project-${p.id}`} className="group rounded-xl border hairline bg-white overflow-hidden hover:border-slate-900 transition">
                        <div className="aspect-video bg-stone-100 overflow-hidden">
                            <img src={p.cover_image} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                        </div>
                        <div className="p-5">
                            <div className="font-serif text-2xl text-slate-900">{p.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {p.city}</div>
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="rounded-md bg-emerald-50 text-emerald-700 py-2 font-medium">{p.stats?.available} свободни</div>
                                <div className="rounded-md bg-amber-50 text-amber-700 py-2 font-medium">{p.stats?.reserved} резерв.</div>
                                <div className="rounded-md bg-stone-100 text-slate-600 py-2 font-medium">{p.stats?.sold} продадени</div>
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                                <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                                    <div className="h-full bg-slate-900" style={{ width: `${p.progress_percent}%` }} />
                                </div>
                                <div className="text-xs font-medium text-slate-700">{p.progress_percent}%</div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
