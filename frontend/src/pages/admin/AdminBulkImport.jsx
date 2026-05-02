import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { api, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    FileJson,
    Lightbulb,
    Loader2,
    PlayCircle,
    ShieldCheck,
    Upload,
} from "lucide-react";

const SAMPLE_JSON = `[
  {"code":"101","property_type":"apartment","floor":2,"raw_area":44.96,"list_price":53078,"rooms":2},
  {"code":"Магазин","property_type":"shop","floor":1,"raw_area":31.62,"list_price":33382},
  {"code":"ПМ-1","property_type":"yard_parking","floor":1,"raw_area":14.81},
  {"code":"Склад-1","property_type":"storage","floor":-1,"raw_area":2.28,"list_price":722}
]`;

const PROPERTY_TYPES = ["apartment", "shop", "parking", "yard_parking", "garage", "storage", "house"];

export default function AdminBulkImport() {
    const navigate = useNavigate();

    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [mode, setMode] = useState("smart_diff");
    const [text, setText] = useState("");
    const [parseError, setParseError] = useState("");
    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [applying, setApplying] = useState(false);

    useEffect(() => {
        api.get("/projects").then((r) => {
            setProjects(r.data || []);
            if (r.data?.length && !projectId) setProjectId(r.data[0].id);
        }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const parsed = useMemo(() => {
        if (!text.trim()) return null;
        try {
            const data = JSON.parse(text);
            if (!Array.isArray(data)) {
                return { error: "JSON-ът трябва да е масив от обекти ([...])" };
            }
            // Validate each row
            const errors = [];
            data.forEach((row, idx) => {
                if (!row.code) errors.push(`#${idx + 1}: липсва 'code'`);
                if (!row.property_type) errors.push(`#${idx + 1}: липсва 'property_type'`);
                else if (!PROPERTY_TYPES.includes(row.property_type)) {
                    errors.push(`#${idx + 1} (${row.code}): невалиден property_type '${row.property_type}'`);
                }
            });
            return { rows: data, errors };
        } catch (e) {
            return { error: `JSON parse error: ${e.message}` };
        }
    }, [text]);

    const validate = () => {
        if (!parsed) {
            setParseError("Поставете JSON в полето.");
            return false;
        }
        if (parsed.error) {
            setParseError(parsed.error);
            return false;
        }
        if (parsed.errors?.length) {
            setParseError(`Грешки във валидацията:\n  - ${parsed.errors.slice(0, 5).join("\n  - ")}${parsed.errors.length > 5 ? `\n  + още ${parsed.errors.length - 5}…` : ""}`);
            return false;
        }
        if (!projectId) {
            setParseError("Изберете проект.");
            return false;
        }
        if (parsed.rows.length === 0) {
            setParseError("Масивът е празен.");
            return false;
        }
        setParseError("");
        return true;
    };

    const onFileSelected = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const txt = await file.text();
        setText(txt);
        e.target.value = "";
    };

    const runPreview = async () => {
        if (!validate()) return;
        setLoadingPreview(true);
        setPreview(null);
        try {
            const { data } = await api.post("/admin/import/bulk-properties", {
                project_id: projectId,
                properties: parsed.rows,
                mode,
                dry_run: true,
            });
            setPreview(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при анализ");
        } finally {
            setLoadingPreview(false);
        }
    };

    const runApply = async () => {
        if (!validate()) return;
        if (!preview) {
            toast.message("Стартирайте 'Анализирай' преди import.");
            return;
        }
        setApplying(true);
        try {
            const { data } = await api.post("/admin/import/bulk-properties", {
                project_id: projectId,
                properties: parsed.rows,
                mode,
                dry_run: false,
            });
            const s = data.summary;
            toast.success(
                `Импорт готов: ${s.created} създадени · ${s.updated_neutral} обновени · ${s.updated_protected} защитени · ${s.skipped} пропуснати.`,
            );
            setPreview(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail) || "Грешка при import");
        } finally {
            setApplying(false);
        }
    };

    const summary = preview?.summary;

    return (
        <div className="space-y-8" data-testid="admin-bulk-import-page">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <button
                        type="button"
                        onClick={() => navigate("/admin/import-docs")}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 mb-2"
                    >
                        <ArrowLeft className="h-3 w-3" /> Към AI Import
                    </button>
                    <div className="overline mb-2">Bulk Import</div>
                    <h1 className="font-serif text-4xl text-slate-900">Импорт на обекти от JSON</h1>
                    <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                        Поставете готов JSON масив с обекти и го приложете със Smart Diff —
                        защитава продадените и резервираните, обновява свободните, създава нови.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT: form */}
                <div className="space-y-5">
                    <div>
                        <Label htmlFor="bi-project">Проект</Label>
                        <select
                            id="bi-project"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className="w-full h-10 rounded-md border hairline bg-white px-3 text-sm"
                            data-testid="bulk-import-project"
                        >
                            <option value="">— избери проект —</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <Label>Режим</Label>
                        <div className="space-y-2 mt-2">
                            <label className="flex items-start gap-2 cursor-pointer p-3 border hairline rounded-md hover:bg-stone-50">
                                <input
                                    type="radio"
                                    name="mode"
                                    value="smart_diff"
                                    checked={mode === "smart_diff"}
                                    onChange={() => setMode("smart_diff")}
                                    className="mt-1"
                                    data-testid="bulk-import-mode-smart"
                                />
                                <span>
                                    <span className="font-medium text-sm flex items-center gap-1">
                                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                                        Smart Diff <span className="text-xs text-slate-500">(препоръчително)</span>
                                    </span>
                                    <span className="block text-xs text-slate-500 mt-0.5">
                                        Защитава продадени / резервирани / с купувач. Обновява свободните. Създава новите.
                                    </span>
                                </span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer p-3 border hairline rounded-md hover:bg-stone-50">
                                <input
                                    type="radio"
                                    name="mode"
                                    value="force_create"
                                    checked={mode === "force_create"}
                                    onChange={() => setMode("force_create")}
                                    className="mt-1"
                                    data-testid="bulk-import-mode-force"
                                />
                                <span>
                                    <span className="font-medium text-sm">Force Create</span>
                                    <span className="block text-xs text-slate-500 mt-0.5">
                                        Само нови обекти; съществуващите се пропускат с предупреждение.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <Label htmlFor="bi-json">JSON данни</Label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setText(SAMPLE_JSON)}
                                    className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
                                    data-testid="bulk-import-sample-btn"
                                >
                                    <Lightbulb className="h-3 w-3" /> Зареди пример
                                </button>
                                <label className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
                                    <Upload className="h-3 w-3" /> .json файл
                                    <input
                                        type="file"
                                        accept=".json,application/json"
                                        onChange={onFileSelected}
                                        className="hidden"
                                        data-testid="bulk-import-file"
                                    />
                                </label>
                            </div>
                        </div>
                        <Textarea
                            id="bi-json"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={18}
                            placeholder={SAMPLE_JSON}
                            className="font-mono text-xs"
                            data-testid="bulk-import-textarea"
                        />
                        <div className="text-xs text-slate-500 mt-1">
                            Полета на ред: <code>code</code>, <code>property_type</code> (задължителни),
                            и optional: <code>floor</code>, <code>rooms</code>, <code>raw_area</code>,
                            <code>area_pure</code>, <code>area_common</code>, <code>area_total</code>,
                            <code>list_price</code>, <code>final_contract_price</code>,
                            <code>exposure</code>, <code>description</code>, <code>status</code>.
                        </div>
                    </div>

                    {parsed && !parsed.error && (
                        <div
                            className="text-xs text-slate-600 inline-flex items-center gap-2"
                            data-testid="bulk-import-parsed-count"
                        >
                            <FileJson className="h-3.5 w-3.5" />
                            Разпознати {parsed.rows.length} обекта
                            {parsed.errors?.length ? (
                                <span className="text-red-600 ml-2">
                                    ({parsed.errors.length} грешки)
                                </span>
                            ) : (
                                <span className="text-emerald-700 ml-2">(валидно ✓)</span>
                            )}
                        </div>
                    )}

                    {parseError && (
                        <div
                            className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-800 whitespace-pre-line"
                            data-testid="bulk-import-error"
                        >
                            <AlertCircle className="h-4 w-4 inline mr-1.5" />
                            {parseError}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={runPreview}
                            disabled={loadingPreview || applying}
                            data-testid="bulk-import-preview-btn"
                        >
                            {loadingPreview && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                            Анализирай (dry-run)
                        </Button>
                        <Button
                            type="button"
                            onClick={runApply}
                            disabled={applying || !preview || (preview?.dry_run === false)}
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                            data-testid="bulk-import-apply-btn"
                        >
                            {applying && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                            <PlayCircle className="h-4 w-4 mr-1.5" />
                            Импортирай
                        </Button>
                    </div>
                </div>

                {/* RIGHT: preview */}
                <div>
                    {!preview && (
                        <div
                            className="border-2 border-dashed hairline rounded-xl p-8 text-center text-sm text-slate-500"
                            data-testid="bulk-import-preview-empty"
                        >
                            Натиснете <strong>„Анализирай"</strong>, за да видите plan-а преди import.
                        </div>
                    )}
                    {preview && summary && (
                        <div className="space-y-4" data-testid="bulk-import-preview">
                            <div
                                className={`rounded-md border p-3 text-xs ${preview.dry_run ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}
                            >
                                {preview.dry_run ? (
                                    <>📋 Това е dry-run преглед — нищо не е записано.</>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                                        Импортът е приложен успешно.
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <StatCard label="Общо в payload" value={summary.total_in_payload} />
                                <StatCard label="Създадени" value={summary.created} tone="emerald" />
                                <StatCard label="Обновени (свободни)" value={summary.updated_neutral} tone="sky" />
                                <StatCard label="Защитени" value={summary.updated_protected} tone="violet" />
                                <StatCard label="Пропуснати" value={summary.skipped} tone="stone" />
                                <StatCard label="Greenfield" value={preview.is_greenfield ? "да" : "не"} tone="stone" />
                            </div>

                            <DetailGroup
                                title="Нови обекти"
                                items={preview.details?.created || []}
                                renderRow={(c) => (
                                    <div key={c.code} className="flex justify-between text-xs py-1 border-b hairline last:border-0">
                                        <span className="font-mono">{c.code}</span>
                                        <span className="text-slate-500">{c.property_type}</span>
                                    </div>
                                )}
                            />
                            <DetailGroup
                                title="Свободни обновявания"
                                items={preview.details?.free_updates || []}
                                renderRow={(u) => (
                                    <div key={u.code} className="flex justify-between text-xs py-1 border-b hairline last:border-0">
                                        <span className="font-mono">{u.code}</span>
                                        <span className="text-slate-500">{u.changes?.length || 0} полета</span>
                                    </div>
                                )}
                            />
                            <DetailGroup
                                title="Защитени (само neutral updates)"
                                items={preview.details?.protected || []}
                                renderRow={(u) => (
                                    <div key={u.code} className="flex justify-between text-xs py-1 border-b hairline last:border-0">
                                        <span className="font-mono">{u.code}</span>
                                        <span className="text-slate-500">
                                            {u.current_status} · neutral {u.neutral_changes?.length || 0}
                                            {u.skipped_fields?.length ? ` · skipped ${u.skipped_fields.length}` : ""}
                                        </span>
                                    </div>
                                )}
                            />
                            <DetailGroup
                                title="Пропуснати"
                                items={preview.details?.skipped || []}
                                renderRow={(s, i) => (
                                    <div key={(s.code || "?") + i} className="flex justify-between text-xs py-1 border-b hairline last:border-0">
                                        <span className="font-mono">{s.code || "—"}</span>
                                        <span className="text-slate-500">{s.reason}</span>
                                    </div>
                                )}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, tone = "slate" }) {
    const tones = {
        emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
        sky: "bg-sky-50 border-sky-200 text-sky-900",
        violet: "bg-violet-50 border-violet-200 text-violet-900",
        amber: "bg-amber-50 border-amber-200 text-amber-900",
        stone: "bg-stone-50 border-stone-200 text-slate-700",
        slate: "bg-slate-50 border-slate-200 text-slate-700",
    };
    return (
        <div className={`rounded-md border p-3 ${tones[tone] || tones.slate}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
            <div className="font-serif text-2xl mt-0.5">{value}</div>
        </div>
    );
}

function DetailGroup({ title, items, renderRow }) {
    const [open, setOpen] = useState(false);
    if (!items || !items.length) return null;
    return (
        <div className="rounded-md border hairline bg-white">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex justify-between items-center p-3 text-sm hover:bg-stone-50"
            >
                <span className="font-medium">{title}</span>
                <span className="text-xs text-slate-500">
                    {items.length} {open ? "▾" : "▸"}
                </span>
            </button>
            {open && (
                <div className="px-3 pb-3 max-h-60 overflow-y-auto">
                    {items.map((it, i) => renderRow(it, i))}
                </div>
            )}
        </div>
    );
}
