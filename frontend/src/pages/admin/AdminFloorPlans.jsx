import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { PROPERTY_STATUS, PROPERTY_TYPE_LABELS } from "../../lib/constants";
import { toast } from "sonner";
import { Save } from "lucide-react";

function emptyBox() {
    return { x: 0, y: 0, width: 200, height: 150, label_x: "", label_y: "" };
}

export default function AdminFloorPlans() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [floor, setFloor] = useState("");
    const [properties, setProperties] = useState([]);
    const [planImageUrl, setPlanImageUrl] = useState("");
    const [rows, setRows] = useState({}); // property_id → {x,y,w,h,label_x,label_y, included:bool}
    const [saving, setSaving] = useState(false);

    // load projects
    useEffect(() => {
        api.get("/projects").then((r) => {
            setProjects(r.data);
            const primary = r.data.find((p) => p.is_primary) || r.data[0];
            if (primary) setProjectId(primary.id);
        });
    }, []);

    // load properties for project (staff call includes all statuses)
    useEffect(() => {
        if (!projectId) return;
        api.get(`/projects/${projectId}/properties`).then((r) => setProperties(r.data));
    }, [projectId]);

    const floors = useMemo(() => {
        const set = new Set(properties.map((p) => p.floor));
        return [...set].sort((a, b) => a - b);
    }, [properties]);

    // Default floor selection
    useEffect(() => {
        if (floors.length && floor === "") setFloor(String(floors[0]));
    }, [floors, floor]);

    const floorProps = useMemo(
        () => properties.filter((p) => String(p.floor) === String(floor)),
        [properties, floor]
    );

    // Load existing plan for (projectId, floor)
    useEffect(() => {
        if (!projectId || floor === "") return;
        api.get(`/projects/${projectId}/floor-plans`).then((r) => {
            const plan = (r.data || []).find((p) => String(p.floor) === String(floor));
            setPlanImageUrl(plan?.plan_image_url || "");
            const seeded = {};
            (plan?.units || []).forEach((u) => {
                seeded[u.property_id] = {
                    x: u.x,
                    y: u.y,
                    width: u.width,
                    height: u.height,
                    label_x: u.label_x ?? "",
                    label_y: u.label_y ?? "",
                    included: true,
                };
            });
            setRows(seeded);
        });
    }, [projectId, floor]);

    const updateRow = (pid, field, value) => {
        setRows((prev) => {
            const next = { ...prev };
            const existing = next[pid] || { ...emptyBox(), included: true };
            next[pid] = { ...existing, [field]: value };
            return next;
        });
    };
    const toggleInclude = (pid) => {
        setRows((prev) => {
            const next = { ...prev };
            if (next[pid]?.included) {
                next[pid] = { ...next[pid], included: false };
            } else {
                next[pid] = next[pid]
                    ? { ...next[pid], included: true }
                    : { ...emptyBox(), included: true };
            }
            return next;
        });
    };

    const save = async () => {
        if (!planImageUrl.trim()) {
            toast.error("Въведете URL на схемата (plan image)");
            return;
        }
        const units = floorProps
            .filter((p) => rows[p.id]?.included)
            .map((p) => {
                const r = rows[p.id];
                return {
                    property_id: p.id,
                    x: Number(r.x || 0),
                    y: Number(r.y || 0),
                    width: Number(r.width || 0),
                    height: Number(r.height || 0),
                    label_x: r.label_x === "" || r.label_x == null ? null : Number(r.label_x),
                    label_y: r.label_y === "" || r.label_y == null ? null : Number(r.label_y),
                };
            });
        for (const u of units) {
            if (u.width <= 0 || u.height <= 0) {
                toast.error("Width и Height трябва да са > 0");
                return;
            }
        }
        setSaving(true);
        try {
            await api.put(
                `/projects/${projectId}/floor-plans/${floor}`,
                { plan_image_url: planImageUrl.trim(), units }
            );
            toast.success(`Схемата за етаж ${floor} е запазена (${units.length} обекта)`);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8" data-testid="admin-floor-plans">
            <div>
                <div className="overline mb-2">Етажни схеми</div>
                <h1 className="font-serif text-4xl text-slate-900">Картографиране на обекти</h1>
                <p className="text-sm text-slate-500 mt-2">
                    Ръчно задайте позиции (x/y/width/height) на обектите върху схемата на етажа. Координатите са в пиксели спрямо горния ляв ъгъл на изображението. Клиентите ще виждат overlay-а в публичната страница на проекта.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <Label>Проект</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger data-testid="fp-project"><SelectValue placeholder="Избор на проект" /></SelectTrigger>
                        <SelectContent>
                            {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label>Етаж</Label>
                    <Select value={floor} onValueChange={setFloor}>
                        <SelectTrigger data-testid="fp-floor"><SelectValue placeholder="Избор на етаж" /></SelectTrigger>
                        <SelectContent>
                            {floors.map((f) => (
                                <SelectItem key={f} value={String(f)}>
                                    {Number(f) > 0 ? `Етаж ${f}` : Number(f) === 0 ? "Партер" : "Сутерен"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label>URL на схемата на етажа</Label>
                    <Input
                        value={planImageUrl}
                        onChange={(e) => setPlanImageUrl(e.target.value)}
                        placeholder="https://…/floor-1.png"
                        data-testid="fp-image-url"
                    />
                </div>
            </div>

            {planImageUrl && (
                <div className="rounded-xl border hairline bg-stone-50 p-2" data-testid="fp-preview">
                    <div className="text-xs text-slate-500 mb-2">Превю (native pixels):</div>
                    <div className="relative inline-block">
                        <img src={planImageUrl} alt="floor plan" className="max-w-full" />
                        {floorProps
                            .filter((p) => rows[p.id]?.included)
                            .map((p) => {
                                const r = rows[p.id];
                                return (
                                    <div
                                        key={p.id}
                                        className="absolute border-2 border-slate-900/70 bg-slate-900/15 text-slate-900 text-[10px] font-medium px-1 py-0.5"
                                        style={{
                                            left: `${r.x}px`,
                                            top: `${r.y}px`,
                                            width: `${r.width}px`,
                                            height: `${r.height}px`,
                                        }}
                                    >
                                        {p.code}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            <div className="rounded-xl border hairline bg-white overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="p-2 text-left font-medium">Вкл.</th>
                            <th className="p-2 text-left font-medium">Код</th>
                            <th className="p-2 text-left font-medium">Тип</th>
                            <th className="p-2 text-left font-medium">Статус</th>
                            <th className="p-2 text-right font-medium">X</th>
                            <th className="p-2 text-right font-medium">Y</th>
                            <th className="p-2 text-right font-medium">Ширина</th>
                            <th className="p-2 text-right font-medium">Височина</th>
                            <th className="p-2 text-right font-medium">Label X</th>
                            <th className="p-2 text-right font-medium">Label Y</th>
                        </tr>
                    </thead>
                    <tbody>
                        {floorProps.map((p) => {
                            const r = rows[p.id] || { ...emptyBox(), included: false };
                            return (
                                <tr key={p.id} className="border-t hairline" data-testid={`fp-row-${p.code}`}>
                                    <td className="p-2">
                                        <input
                                            type="checkbox"
                                            checked={!!r.included}
                                            onChange={() => toggleInclude(p.id)}
                                            data-testid={`fp-include-${p.code}`}
                                        />
                                    </td>
                                    <td className="p-2 font-mono">{p.code}</td>
                                    <td className="p-2 text-slate-600">{PROPERTY_TYPE_LABELS[p.property_type]}</td>
                                    <td className="p-2 text-slate-600">
                                        {PROPERTY_STATUS[p.status]?.label || p.status}
                                    </td>
                                    {["x", "y", "width", "height", "label_x", "label_y"].map((f) => (
                                        <td key={f} className="p-2">
                                            <Input
                                                type="number"
                                                step="1"
                                                value={r[f] ?? ""}
                                                onChange={(e) => updateRow(p.id, f, e.target.value)}
                                                disabled={!r.included}
                                                className="h-8 w-24 ml-auto"
                                                data-testid={`fp-${f}-${p.code}`}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                        {floorProps.length === 0 && (
                            <tr><td className="p-4 text-sm text-slate-500" colSpan={10}>
                                Няма обекти на този етаж.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={save}
                    disabled={saving || !floorProps.length}
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                    data-testid="fp-save"
                >
                    <Save className="h-4 w-4 mr-2" /> {saving ? "Запазване…" : "Запази схема"}
                </Button>
            </div>
        </div>
    );
}
