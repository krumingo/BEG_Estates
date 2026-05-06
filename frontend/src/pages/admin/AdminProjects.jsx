import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Plus, Pencil } from "lucide-react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "../../components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { PROJECT_STATUS_LABELS } from "../../lib/constants";
import { toast } from "sonner";

const EMPTY_FORM = {
    name: "",
    slug: "",
    city: "",
    address: "",
    short_description: "",
    description: "",
    status: "under_construction",
    completion_date: "",
    cover_image: "",
    gallery: "",
    lat: "",
    lng: "",
    progress_percent: 0,
    is_primary: false,
    expected_act_2_date: "",
    construction_duration_months: 30,
};

function toForm(project) {
    if (!project) return { ...EMPTY_FORM };
    return {
        name: project.name || "",
        slug: project.slug || "",
        city: project.city || "",
        address: project.address || "",
        short_description: project.short_description || "",
        description: project.description || "",
        status: project.status || "under_construction",
        completion_date: project.completion_date || "",
        cover_image: project.cover_image || "",
        gallery: (project.gallery || []).join("\n"),
        lat: project.lat ?? "",
        lng: project.lng ?? "",
        progress_percent: project.progress_percent ?? 0,
        is_primary: !!project.is_primary,
        expected_act_2_date: project.expected_act_2_date || "",
        construction_duration_months: project.construction_duration_months ?? 30,
    };
}

function toPayload(form) {
    const gallery = form.gallery
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
    return {
        name: form.name.trim(),
        slug: form.slug.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        short_description: form.short_description,
        description: form.description,
        status: form.status,
        completion_date: form.completion_date || null,
        cover_image: form.cover_image || null,
        gallery,
        lat: numOrNull(form.lat),
        lng: numOrNull(form.lng),
        progress_percent: Number(form.progress_percent) || 0,
        is_primary: !!form.is_primary,
        expected_act_2_date: form.expected_act_2_date || null,
        construction_duration_months: Number(form.construction_duration_months) || 30,
    };
}

export default function AdminProjects() {
    const [items, setItems] = useState([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [mode, setMode] = useState("create"); // "create" | "edit"
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const load = () => api.get("/projects").then((r) => setItems(r.data));

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setMode("create");
        setEditingId(null);
        setForm({ ...EMPTY_FORM });
        setDialogOpen(true);
    };

    const openEdit = (e, project) => {
        e.preventDefault();
        e.stopPropagation();
        setMode("edit");
        setEditingId(project.id);
        setForm(toForm(project));
        setDialogOpen(true);
    };

    const set = (k) => (e) => {
        const v = e && e.target ? e.target.value : e;
        setForm((f) => ({ ...f, [k]: v }));
    };

    const submit = async () => {
        setSaving(true);
        try {
            const payload = toPayload(form);
            if (mode === "create") {
                await api.post("/projects", payload);
                toast.success("Проектът е създаден");
            } else {
                await api.patch(`/projects/${editingId}`, payload);
                toast.success("Проектът е обновен");
            }
            setDialogOpen(false);
            await load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="overline mb-2">Проекти</div>
                    <h1 className="font-serif text-4xl text-slate-900">Всички проекти</h1>
                </div>
                <Button
                    onClick={openCreate}
                    data-testid="admin-new-project-btn"
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                    <Plus className="h-4 w-4 mr-2" /> Нов проект
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((p) => (
                    <div key={p.id} className="group rounded-xl border hairline bg-white overflow-hidden relative hover:border-slate-900 transition">
                        <Link to={`/projects/${p.id}`} data-testid={`admin-project-${p.id}`} className="block">
                            <div className="aspect-video bg-stone-100 overflow-hidden">
                                <img src={p.cover_image} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                            </div>
                            <div className="p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-serif text-2xl text-slate-900 truncate">{p.name}</div>
                                    {p.is_primary && (
                                        <span className="text-[10px] font-semibold tracking-widest uppercase bg-slate-900 text-white rounded-full px-2 py-0.5">
                                            Primary
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {p.city}</div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                                    <div className="rounded-md bg-emerald-50 text-emerald-700 py-2 font-medium">{p.stats?.available ?? 0} свободни</div>
                                    <div className="rounded-md bg-amber-50 text-amber-700 py-2 font-medium">{p.stats?.reserved ?? 0} резерв.</div>
                                    <div className="rounded-md bg-stone-100 text-slate-600 py-2 font-medium">{p.stats?.sold ?? 0} продадени</div>
                                </div>
                                <div className="mt-4 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                                        <div className="h-full bg-slate-900" style={{ width: `${p.progress_percent}%` }} />
                                    </div>
                                    <div className="text-xs font-medium text-slate-700">{p.progress_percent}%</div>
                                </div>
                            </div>
                        </Link>
                        <button
                            data-testid={`admin-edit-project-${p.id}`}
                            onClick={(e) => openEdit(e, p)}
                            className="absolute top-3 right-3 h-8 w-8 inline-flex items-center justify-center rounded-full bg-white/95 border hairline text-slate-700 hover:bg-slate-900 hover:text-white transition"
                            aria-label="Редакция"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="project-form-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">
                            {mode === "create" ? "Нов проект" : "Редакция на проект"}
                        </DialogTitle>
                        <DialogDescription>
                            Попълнете основните полета за проекта. Slug се използва в URL-а.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="pf-name">Име</Label>
                                <Input id="pf-name" value={form.name} onChange={set("name")} data-testid="pf-name" />
                            </div>
                            <div>
                                <Label htmlFor="pf-slug">Slug</Label>
                                <Input id="pf-slug" value={form.slug} onChange={set("slug")} placeholder="primer-slug" data-testid="pf-slug" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="pf-city">Град</Label>
                                <Input id="pf-city" value={form.city} onChange={set("city")} data-testid="pf-city" />
                            </div>
                            <div>
                                <Label htmlFor="pf-address">Адрес</Label>
                                <Input id="pf-address" value={form.address} onChange={set("address")} data-testid="pf-address" />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="pf-short">Кратко описание</Label>
                            <Input id="pf-short" value={form.short_description} onChange={set("short_description")} data-testid="pf-short" />
                        </div>

                        <div>
                            <Label htmlFor="pf-desc">Описание</Label>
                            <Textarea id="pf-desc" value={form.description} onChange={set("description")} rows={4} data-testid="pf-description" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <Label>Статус</Label>
                                <Select value={form.status} onValueChange={set("status")}>
                                    <SelectTrigger data-testid="pf-status"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="pf-completion">Планирано завършване</Label>
                                <Input id="pf-completion" type="date" value={form.completion_date || ""} onChange={set("completion_date")} data-testid="pf-completion-date" />
                            </div>
                            <div>
                                <Label htmlFor="pf-progress">Прогрес %</Label>
                                <Input id="pf-progress" type="number" min="0" max="100" value={form.progress_percent} onChange={set("progress_percent")} data-testid="pf-progress" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="pf-act2">Очаквана дата на Акт 2</Label>
                                <Input
                                    id="pf-act2"
                                    type="date"
                                    value={form.expected_act_2_date || ""}
                                    onChange={set("expected_act_2_date")}
                                    data-testid="pf-act2-date"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    От тази дата се изчисляват milestone-ите за Quote Builder (изкоп, кота 0, Акт 14, Акт 16…).
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="pf-duration">Срок за завършване (месеци)</Label>
                                <Input
                                    id="pf-duration"
                                    type="number"
                                    min="1"
                                    max="120"
                                    value={form.construction_duration_months}
                                    onChange={set("construction_duration_months")}
                                    data-testid="pf-duration-months"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="pf-cover">Cover image URL</Label>
                            <Input id="pf-cover" value={form.cover_image} onChange={set("cover_image")} placeholder="https://…" data-testid="pf-cover" />
                        </div>

                        <div>
                            <Label htmlFor="pf-gallery">Галерия (по 1 URL на ред)</Label>
                            <Textarea id="pf-gallery" rows={3} value={form.gallery} onChange={set("gallery")} placeholder={"https://…\nhttps://…"} data-testid="pf-gallery" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="pf-lat">Latitude</Label>
                                <Input id="pf-lat" value={form.lat} onChange={set("lat")} data-testid="pf-lat" />
                            </div>
                            <div>
                                <Label htmlFor="pf-lng">Longitude</Label>
                                <Input id="pf-lng" value={form.lng} onChange={set("lng")} data-testid="pf-lng" />
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-md border hairline bg-stone-50 p-3">
                            <div>
                                <Label htmlFor="pf-primary" className="mb-0">Primary project</Label>
                                <div className="text-xs text-slate-500">Само един проект може да е primary едновременно.</div>
                            </div>
                            <Switch
                                id="pf-primary"
                                checked={form.is_primary}
                                onCheckedChange={(v) => setForm((f) => ({ ...f, is_primary: v }))}
                                data-testid="pf-is-primary"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                            disabled={saving}
                            data-testid="pf-cancel"
                        >
                            Отказ
                        </Button>
                        <Button
                            onClick={submit}
                            disabled={saving}
                            data-testid="pf-save"
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {saving ? "Запазване…" : mode === "create" ? "Създай" : "Запази"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
