import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapPin, Ruler, ArrowLeft, Clock, FileText, Download, ExternalLink, X } from "lucide-react";
import PublicHeader from "../../components/layout/PublicHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { api, currency, formatApiError } from "../../lib/api";
import { PROPERTY_TYPE_LABELS } from "../../lib/constants";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import FloorPlanSection from "../../components/public/FloorPlanSection";
import { useAuth } from "../../lib/auth";
import { toast } from "sonner";

export default function PropertyDetail() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();

    const load = () => api.get(`/properties/${id}`).then((r) => setData(r.data)).catch(() => {});
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

    const reserveZero = async () => {
        if (!user) {
            navigate(`/login/client?next=/properties/${id}`);
            return;
        }
        setSubmitting(true);
        try {
            await api.post("/reservations", {
                property_id: id,
                reservation_type: "zero_deposit",
            });
            toast.success("Резервацията с капаро 0 е създадена!");
            navigate("/portal/reservations");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSubmitting(false);
        }
    };

    if (!data) return <div className="min-h-screen pt-24 text-center text-slate-500">Зареждане…</div>;

    const { property: p, project } = data;

    return (
        <div className="min-h-screen bg-white">
            <PublicHeader />
            <div className="pt-24 mx-auto max-w-7xl px-6 lg:px-10">
                <Link to={`/projects/${project?.id}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6" data-testid="back-to-project">
                    <ArrowLeft className="h-4 w-4" /> Обратно към проекта
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-6 pb-20">
                    <div className="lg:col-span-7 space-y-4">
                        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-stone-100">
                            <img
                                src={p.gallery?.[0] || project?.cover_image}
                                alt={p.code}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {(p.gallery || []).slice(1).map((g, i) => (
                                <img key={i} src={g} alt="" className="aspect-square rounded-lg object-cover" />
                            ))}
                        </div>
                    </div>

                    <div className="lg:col-span-5">
                        <div className="overline mb-2">{PROPERTY_TYPE_LABELS[p.property_type]} · {project?.name}</div>
                        <div className="flex items-start justify-between mb-4">
                            <h1 className="font-serif text-5xl text-slate-900 leading-none">{p.code}</h1>
                            <StatusBadge status={p.status} />
                        </div>
                        <div className="text-sm text-slate-500 flex items-center gap-1 mb-6"><MapPin className="h-3.5 w-3.5" /> {project?.city} · {project?.address}</div>
                        <p className="text-slate-700 leading-relaxed mb-8">{p.description}</p>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            {p.rooms != null && <Spec label="Стаи" value={p.rooms} />}
                            {p.area_pure != null && <Spec label="Чиста площ" value={`${p.area_pure} м²`} />}
                            {p.area_common != null && <Spec label="Общи части" value={`${p.area_common} м²`} />}
                            {p.area_total != null && <Spec label="Обща площ" value={`${p.area_total} м²`} />}
                            {p.floor != null && <Spec label="Етаж" value={p.floor > 0 ? p.floor : "паркинг"} />}
                            {p.exposure && <Spec label="Изложение" value={p.exposure} />}
                            {p.price_per_sqm != null && <Spec label="Цена / м²" value={currency(p.price_per_sqm)} />}
                            {(p.list_price ?? p.base_price) != null && (
                                <Spec label="Цена" value={currency(p.list_price ?? p.base_price)} highlight />
                            )}
                        </div>

                        {p.status === "available" && (
                            <div className="rounded-xl border hairline p-6 bg-amber-50/60">
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock className="h-4 w-4 text-amber-700" />
                                    <div className="overline text-amber-700">Капаро 0</div>
                                </div>
                                <div className="font-serif text-2xl text-slate-900 mb-1">
                                    Запази обекта без плащане
                                </div>
                                <p className="text-sm text-slate-600 mb-4">
                                    Резервацията е безплатна и валидна 7 дни. Без задължения, само спокойствие да решите.
                                </p>
                                <Button
                                    size="lg"
                                    onClick={reserveZero}
                                    disabled={submitting}
                                    data-testid="reserve-zero-deposit-btn"
                                    className="bg-slate-900 hover:bg-slate-800 text-white w-full"
                                >
                                    {submitting ? "Резервиране…" : "Резервирай с капаро 0"}
                                </Button>
                            </div>
                        )}

                        {p.status !== "available" && (
                            <div className="rounded-xl border hairline p-5 bg-stone-50 text-sm text-slate-600">
                                Този обект вече не е свободен. Разгледайте другите налични обекти в проекта.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Floor plan section: pre-selects текущ етаж и маркира текущия имот */}
            {project?.id && (
                <div className="border-t hairline">
                    <FloorPlanSection
                        projectId={project.id}
                        currentFloor={p.floor}
                        currentPropertyId={p.id}
                        title="Планировка на етажа"
                        eyebrow="Огледай съседните обекти"
                        className="bg-stone-50 py-16"
                    />
                </div>
            )}

            {/* Разпределение — чертеж на апартамента */}
            <PropertyPlanSection plan_url={p.plan_url || p.floor_plan_url} code={p.code} />
        </div>
    );
}

function Spec({ label, value, highlight }) {
    return (
        <div className={`rounded-lg border hairline p-4 ${highlight ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`}>
            <div className={`overline ${highlight ? "text-white/60" : ""}`}>{label}</div>
            <div className={`mt-1 text-lg font-medium ${highlight ? "text-white" : "text-slate-900"}`}>{value}</div>
        </div>
    );
}

function PropertyPlanSection({ plan_url, code }) {
    const [open, setOpen] = useState(false);
    if (!plan_url) return null;

    const isPdf = /\.pdf(\?|#|$)/i.test(plan_url);
    // Image: явен extension ИЛИ unknown URL без PDF (нека default-ваме на image rendering за хостнати картинки)
    const hasImageExt = /\.(jpe?g|png|webp|gif|svg)(\?|#|$)/i.test(plan_url);
    const isImage = hasImageExt || (!isPdf && /^https?:\/\//i.test(plan_url));

    return (
        <section
            className="mx-auto max-w-7xl px-6 lg:px-10 py-16 border-t hairline"
            data-testid="property-plan-section"
        >
            <div className="overline mb-3">Чертеж на апартамента</div>
            <h2 className="font-serif text-4xl sm:text-5xl text-slate-900 mb-8">Разпределение</h2>

            {isPdf && (
                <div
                    className="rounded-xl border hairline bg-stone-50 p-8 flex flex-col sm:flex-row items-center gap-6"
                    data-testid="property-plan-pdf"
                >
                    <div className="h-16 w-16 rounded-full bg-white border hairline flex items-center justify-center flex-shrink-0">
                        <FileText className="h-7 w-7 text-slate-700" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                        <div className="font-serif text-2xl text-slate-900 mb-1">Чертеж · {code}</div>
                        <div className="text-sm text-slate-600">PDF документ с детайлно разпределение</div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center">
                        <a
                            href={plan_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="property-plan-view"
                        >
                            <Button variant="outline">
                                <ExternalLink className="h-4 w-4 mr-2" /> Виж в браузъра
                            </Button>
                        </a>
                        <a href={plan_url} download data-testid="property-plan-download">
                            <Button>
                                <Download className="h-4 w-4 mr-2" /> Изтегли PDF
                            </Button>
                        </a>
                    </div>
                </div>
            )}

            {isImage && (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="block w-full rounded-xl border hairline bg-stone-50 overflow-hidden group focus:outline-none focus:ring-2 focus:ring-amber-500"
                        data-testid="property-plan-image"
                        aria-label="Уголеми чертежа"
                    >
                        <img
                            src={plan_url}
                            alt={`Разпределение · ${code}`}
                            className="w-full h-auto object-contain max-h-[700px] mx-auto group-hover:opacity-95 transition"
                        />
                        <div className="px-5 py-3 text-xs text-slate-500 text-left">
                            Кликнете за уголемен изглед
                        </div>
                    </button>
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogContent
                            className="max-w-screen-lg w-[95vw] p-0 bg-black/95 border-none"
                            data-testid="property-plan-lightbox"
                        >
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                                aria-label="Затвори"
                                data-testid="property-plan-lightbox-close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                            <img
                                src={plan_url}
                                alt={`Разпределение · ${code}`}
                                className="w-full h-auto object-contain max-h-[90vh]"
                            />
                        </DialogContent>
                    </Dialog>
                </>
            )}

            {!isPdf && !isImage && (
                <div className="rounded-xl border hairline bg-stone-50 p-6 flex items-center gap-3">
                    <ExternalLink className="h-5 w-5 text-slate-600" />
                    <a
                        href={plan_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-900 underline"
                        data-testid="property-plan-link"
                    >
                        Отвори чертежа
                    </a>
                </div>
            )}
        </section>
    );
}
