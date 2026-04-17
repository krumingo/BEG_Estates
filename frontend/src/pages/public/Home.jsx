import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MapPin, Ruler, Building2 } from "lucide-react";
import PublicHeader from "../../components/layout/PublicHeader";
import { api, currency } from "../../lib/api";
import { Button } from "../../components/ui/button";

export default function Home() {
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
    }, []);

    const featured = projects[0];

    return (
        <div className="min-h-screen bg-white">
            <PublicHeader dark />

            {/* HERO */}
            <section className="relative h-[92vh] min-h-[640px] overflow-hidden grain">
                <img
                    src="https://images.unsplash.com/photo-1758193431355-54df41421657?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400"
                    alt="Модерна сграда"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />
                <div className="relative z-10 h-full mx-auto max-w-7xl px-6 lg:px-10 flex flex-col justify-end pb-24 text-white">
                    <div className="overline text-white/70 mb-6">Premium ново строителство · София</div>
                    <h1 className="font-serif text-5xl sm:text-6xl lg:text-8xl font-medium tracking-tight leading-[0.95] max-w-4xl">
                        Домове, които<br />
                        не просто се строят.<br />
                        <span className="italic text-[#D4AF37]">Замислят се.</span>
                    </h1>
                    <p className="mt-8 max-w-xl text-base sm:text-lg text-white/80 leading-relaxed">
                        Бутикови жилищни проекти с архитектурна идентичност. Резервирайте своя
                        имот с капаро 0 и вземете решение в спокойствие.
                    </p>
                    <div className="mt-10 flex flex-wrap gap-3">
                        <Link to="/projects">
                            <Button size="lg" data-testid="hero-explore-btn" className="bg-white text-slate-900 hover:bg-stone-100 h-12 px-7 rounded-full">
                                Разгледай проектите <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                        <Link to="/contact">
                            <Button
                                size="lg"
                                variant="outline"
                                data-testid="hero-contact-btn"
                                className="h-12 px-7 rounded-full bg-transparent border-white/30 text-white hover:bg-white/10"
                            >
                                Свържи се с нас
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* FEATURED PROJECT */}
            {featured && (
                <section className="mx-auto max-w-7xl px-6 lg:px-10 py-24 lg:py-32">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-end mb-12">
                        <div className="lg:col-span-7">
                            <div className="overline mb-4">Флагмански проект</div>
                            <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight tracking-tight text-slate-900">
                                {featured.name}
                            </h2>
                        </div>
                        <div className="lg:col-span-5 text-slate-600 leading-relaxed">
                            {featured.short_description || featured.description}
                        </div>
                    </div>

                    <Link to={`/projects/${featured.id}`} data-testid={`featured-project-${featured.id}`}>
                        <div className="group relative overflow-hidden rounded-2xl">
                            <img
                                src={featured.cover_image}
                                alt={featured.name}
                                className="w-full h-[60vh] object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <div className="absolute bottom-0 inset-x-0 p-8 text-white grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <div className="overline text-white/60">Локация</div>
                                    <div className="flex items-center gap-2 mt-1 text-lg"><MapPin className="h-4 w-4" /> {featured.city}</div>
                                </div>
                                <div>
                                    <div className="overline text-white/60">Обекти</div>
                                    <div className="mt-1 text-lg">{featured.stats?.total || 0}</div>
                                </div>
                                <div>
                                    <div className="overline text-white/60">Свободни</div>
                                    <div className="mt-1 text-lg">{featured.stats?.available || 0}</div>
                                </div>
                                <div>
                                    <div className="overline text-white/60">Прогрес</div>
                                    <div className="mt-1 text-lg">{featured.progress_percent}%</div>
                                </div>
                            </div>
                        </div>
                    </Link>
                </section>
            )}

            {/* VALUE */}
            <section className="bg-stone-50 py-24">
                <div className="mx-auto max-w-7xl px-6 lg:px-10 grid grid-cols-1 md:grid-cols-3 gap-12">
                    {[
                        {
                            icon: Ruler,
                            title: "Архитектурно внимание",
                            body: "Проекти с авторска архитектура, premium материали и детайл, който се усеща.",
                        },
                        {
                            icon: Building2,
                            title: "Сигурни инвестиции",
                            body: "Прозрачен прогрес, ясни договори, проследяване на всяка стъпка от портала.",
                        },
                        {
                            icon: ArrowRight,
                            title: "Капаро 0",
                            body: "Запазете избрания имот без предварително плащане. Вземете решение спокойно.",
                        },
                    ].map((x) => (
                        <div key={x.title} className="space-y-3">
                            <x.icon className="h-6 w-6 text-slate-900" strokeWidth={1.5} />
                            <h3 className="font-serif text-2xl text-slate-900">{x.title}</h3>
                            <p className="text-slate-600 leading-relaxed">{x.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ALL PROJECTS */}
            <section className="mx-auto max-w-7xl px-6 lg:px-10 py-24">
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <div className="overline mb-3">Проекти</div>
                        <h2 className="font-serif text-4xl sm:text-5xl text-slate-900">Нашите проекти</h2>
                    </div>
                    <Link to="/projects" className="text-sm font-medium text-slate-900 underline underline-offset-4" data-testid="home-all-projects-link">
                        Виж всички →
                    </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {projects.slice(0, 4).map((p) => (
                        <Link
                            key={p.id}
                            to={`/projects/${p.id}`}
                            data-testid={`project-card-${p.id}`}
                            className="group block"
                        >
                            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-stone-100">
                                <img src={p.cover_image} alt={p.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                            </div>
                            <div className="mt-4 flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="font-serif text-2xl text-slate-900">{p.name}</h3>
                                    <div className="mt-1 text-sm text-slate-500 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {p.city}</div>
                                </div>
                                <div className="text-right">
                                    <div className="overline">Свободни</div>
                                    <div className="text-lg font-medium text-slate-900">
                                        {p.stats?.available || 0} / {p.stats?.total || 0}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            <footer className="border-t hairline">
                <div className="mx-auto max-w-7xl px-6 lg:px-10 py-12 flex flex-col md:flex-row justify-between gap-6 text-sm text-slate-500">
                    <div>
                        <span className="font-serif text-xl text-slate-900">BEG Estates</span>
                        <span className="ml-2 overline">EstateFlow</span>
                    </div>
                    <div>© {new Date().getFullYear()} BEG Estates. Всички права запазени.</div>
                </div>
            </footer>
        </div>
    );
}
