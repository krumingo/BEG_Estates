import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, currency, formatApiError } from "../../lib/api";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { UploadCloud, Sparkles, CheckCircle2, AlertTriangle, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";

const DOC_LABELS = {
    area_schedule: "Квадратури",
    pricing: "Цени",
    buyers: "Купувачи",
    floor_plan: "Етажен план",
    mixed: "Смесен",
    unknown: "Неизвестен",
};

function confClass(c) {
    if (c >= 0.8) return "text-emerald-700";
    if (c >= 0.45) return "text-amber-700";
    return "text-rose-700";
}
function confBadge(c) {
    return `${Math.round((c || 0) * 100)}%`;
}

export default function AdminImportDocs() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [session, setSession] = useState(null);
    const [files, setFiles] = useState([]); // pending browser files
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [applying, setApplying] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        api.get("/projects").then((r) => {
            setProjects(r.data);
            const primary = r.data.find((p) => p.is_primary) || r.data[0];
            if (primary) setProjectId(primary.id);
        });
    }, []);

    const extracted = session?.extracted_payload || {};
    const units = extracted.candidate_units || [];
    const buyers = extracted.candidate_buyers || [];
    const conflicts = session?.conflicts || [];
    const summary = session?.summary || {};
    const hasCritical = conflicts.some((c) => c.severity === "critical");
    const approvedUnits = units.filter((u) => u.approved).length;
    const approvedBuyers = buyers.filter((b) => b.approved).length;

    const createSession = async () => {
        if (!projectId) {
            toast.error("Изберете проект");
            return null;
        }
        const { data } = await api.post("/import-sessions", { project_id: projectId });
        setSession(data);
        return data;
    };

    const handleFiles = (list) => {
        const arr = Array.from(list || []).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
        if (arr.length === 0) {
            toast.error("Добавете поне един PDF файл");
            return;
        }
        if (arr.length > 10) {
            toast.error("Максимум 10 файла наведнъж");
            return;
        }
        setFiles((prev) => [...prev, ...arr]);
    };

    const uploadFiles = async () => {
        if (files.length === 0) return;
        setUploading(true);
        try {
            let active = session;
            if (!active) active = await createSession();
            if (!active) return;
            const fd = new FormData();
            files.forEach((f) => fd.append("files", f));
            const { data } = await api.post(
                `/import-sessions/${active.id}/files`,
                fd,
                { headers: { "Content-Type": "multipart/form-data" } }
            );
            setSession(data);
            setFiles([]);
            toast.success(`Качени ${data.files.length} файла`);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setUploading(false);
        }
    };

    const analyze = async () => {
        if (!session) return;
        setAnalyzing(true);
        try {
            const { data } = await api.post(`/import-sessions/${session.id}/analyze`);
            setSession(data);
            toast.success("Разпознаването завърши — прегледайте резултатите");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setAnalyzing(false);
        }
    };

    const persistReview = async (nextUnits, nextBuyers) => {
        if (!session) return;
        await api.patch(`/import-sessions/${session.id}/review-payload`, {
            candidate_units: nextUnits ?? units,
            candidate_buyers: nextBuyers ?? buyers,
        });
    };

    const updateUnit = (idx, field, value) => {
        const next = units.map((u, i) => (i === idx ? { ...u, [field]: value } : u));
        setSession((s) => ({ ...s, extracted_payload: { ...s.extracted_payload, candidate_units: next } }));
    };
    const updateBuyer = (idx, field, value) => {
        const next = buyers.map((b, i) => (i === idx ? { ...b, [field]: value } : b));
        setSession((s) => ({ ...s, extracted_payload: { ...s.extracted_payload, candidate_buyers: next } }));
    };

    const apply = async () => {
        if (!session) return;
        if (hasCritical) {
            toast.error("Има критични конфликти — разрешете ги първо");
            return;
        }
        setApplying(true);
        try {
            await persistReview();
            const { data } = await api.post(`/import-sessions/${session.id}/apply`);
            setSession(data.session);
            toast.success(
                `Приложено: ${data.report.applied_units} обекта (нови: ${data.report.created_units}) · ${data.report.applied_buyers} купувачи`
            );
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setApplying(false);
        }
    };

    const startOver = () => {
        setSession(null);
        setFiles([]);
    };

    const sessionApplied = session?.status === "applied";

    return (
        <div className="space-y-8" data-testid="admin-import-docs">
            <div>
                <div className="overline mb-2">AI Import</div>
                <h1 className="font-serif text-4xl text-slate-900">Импорт на PDF документи</h1>
                <p className="text-sm text-slate-500 mt-2">
                    Дропнете 4–5 PDF файла (квадратури, цени, купувачи, етажни планове). Системата ги разпознава и ви показва преглед —
                    нищо не се записва преди „Потвърди import“.
                </p>
            </div>

            {!sessionApplied && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-1">
                        <Label>Проект</Label>
                        <Select value={projectId} onValueChange={setProjectId} disabled={!!session}>
                            <SelectTrigger data-testid="imp-project"><SelectValue placeholder="Избор" /></SelectTrigger>
                            <SelectContent>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {!sessionApplied && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        handleFiles(e.dataTransfer.files);
                    }}
                    onClick={() => inputRef.current?.click()}
                    className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition ${
                        dragOver ? "border-slate-900 bg-slate-50" : "border-slate-300 bg-white hover:border-slate-500"
                    }`}
                    data-testid="imp-dropzone"
                >
                    <UploadCloud className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                    <div className="font-medium text-slate-900">Дропнете PDF файлове тук или кликнете за избор</div>
                    <div className="text-xs text-slate-500 mt-1">до 10 файла · макс. 25 MB всеки · само PDF</div>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => handleFiles(e.target.files)}
                        data-testid="imp-file-input"
                    />
                </div>
            )}

            {files.length > 0 && (
                <div className="rounded-lg border hairline bg-white p-4 space-y-2" data-testid="imp-pending">
                    <div className="text-sm font-medium text-slate-900 mb-2">Избрани {files.length} файла:</div>
                    {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                            <FileText className="h-4 w-4 text-slate-400" />
                            <span>{f.name}</span>
                            <span className="text-xs text-slate-400">· {(f.size / 1024).toFixed(0)} KB</span>
                        </div>
                    ))}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setFiles([])}>Изчисти</Button>
                        <Button
                            onClick={uploadFiles}
                            disabled={uploading}
                            data-testid="imp-upload"
                            className="bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {uploading ? "Качване…" : `Качи ${files.length} файла`}
                        </Button>
                    </div>
                </div>
            )}

            {session && (
                <div className="rounded-lg border hairline bg-stone-50 p-4 flex items-center gap-3 flex-wrap" data-testid="imp-session">
                    <div className="text-sm text-slate-700">
                        Сесия <span className="font-mono text-xs">{session.id.slice(0, 8)}</span> · статус:
                        <strong className="ml-1">{session.status}</strong> · {session.files?.length || 0} файла
                    </div>
                    <div className="ml-auto flex gap-2">
                        <Button
                            variant="outline"
                            onClick={analyze}
                            disabled={analyzing || sessionApplied || (session.files?.length || 0) === 0}
                            data-testid="imp-analyze"
                        >
                            <Sparkles className="h-4 w-4 mr-2" />
                            {analyzing ? "Разпознаване…" : "Разпознай документи"}
                        </Button>
                        {sessionApplied && (
                            <Button variant="outline" onClick={startOver} data-testid="imp-reset">
                                Нова сесия
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {session?.files?.length > 0 && (
                <div className="rounded-lg border hairline bg-white overflow-hidden" data-testid="imp-files-table">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-slate-600">
                            <tr>
                                <th className="p-2 text-left font-medium">Файл</th>
                                <th className="p-2 text-left font-medium">Разпознат тип</th>
                                <th className="p-2 text-right font-medium">Страници</th>
                                <th className="p-2 text-right font-medium">Сигурност</th>
                            </tr>
                        </thead>
                        <tbody>
                            {session.files.map((f) => (
                                <tr key={f.id} className="border-t hairline">
                                    <td className="p-2">{f.original_name}</td>
                                    <td className="p-2 text-slate-600">{DOC_LABELS[f.document_type_guess] || "—"}</td>
                                    <td className="p-2 text-right">{f.pages_count ?? "—"}</td>
                                    <td className={`p-2 text-right ${confClass(f.document_type_guess_confidence || 0)}`}>
                                        {f.document_type_guess_confidence != null ? confBadge(f.document_type_guess_confidence) : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {session?.status === "review_ready" || sessionApplied ? (
                <div className="space-y-6" data-testid="imp-review">
                    <SummaryBar summary={summary} approvedUnits={approvedUnits} approvedBuyers={approvedBuyers} conflicts={conflicts} />

                    <Tabs defaultValue="units" className="w-full">
                        <TabsList className="grid grid-cols-3 w-full max-w-2xl" data-testid="imp-tabs">
                            <TabsTrigger value="units" data-testid="imp-tab-units">Обекти ({units.length})</TabsTrigger>
                            <TabsTrigger value="buyers" data-testid="imp-tab-buyers">Купувачи ({buyers.length})</TabsTrigger>
                            <TabsTrigger value="conflicts" data-testid="imp-tab-conflicts">Конфликти ({conflicts.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="units" className="pt-4">
                            <UnitsTable units={units} onChange={updateUnit} disabled={sessionApplied} />
                        </TabsContent>
                        <TabsContent value="buyers" className="pt-4">
                            <BuyersTable buyers={buyers} onChange={updateBuyer} disabled={sessionApplied} />
                        </TabsContent>
                        <TabsContent value="conflicts" className="pt-4">
                            <ConflictsTable conflicts={conflicts} />
                        </TabsContent>
                    </Tabs>

                    {!sessionApplied && (
                        <div className="flex items-center justify-end gap-3 pt-4 border-t hairline">
                            <div className="text-xs text-slate-500 mr-auto">
                                {hasCritical && (
                                    <span className="inline-flex items-center gap-1 text-rose-700">
                                        <XCircle className="h-3.5 w-3.5" />
                                        Има критични конфликти — apply е блокиран
                                    </span>
                                )}
                            </div>
                            <Button
                                onClick={apply}
                                disabled={applying || hasCritical || (approvedUnits + approvedBuyers) === 0}
                                data-testid="imp-apply"
                                className="bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {applying ? "Прилагане…" : `Потвърди import (${approvedUnits} обекта · ${approvedBuyers} купувача)`}
                            </Button>
                        </div>
                    )}

                    {sessionApplied && session.apply_report && (
                        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="imp-applied">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                <strong>Import приложен.</strong>
                            </div>
                            <div className="text-xs mt-1">
                                {session.apply_report.applied_units} обекта ({session.apply_report.created_units} нови) ·
                                {session.apply_report.applied_buyers} купувачи ({session.apply_report.created_buyers} нови)
                                {session.apply_report.skipped.length > 0 && (
                                    <> · пропуснати: {session.apply_report.skipped.join(", ")}</>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function SummaryBar({ summary, approvedUnits, approvedBuyers, conflicts }) {
    const critical = conflicts.filter((c) => c.severity === "critical").length;
    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="imp-summary-bar">
            <Card label="Файлове" value={summary.files_count ?? 0} />
            <Card label="Обекти" value={`${approvedUnits} / ${summary.candidate_units_count ?? 0}`} hint="одобрени / намерени" />
            <Card label="Купувачи" value={`${approvedBuyers} / ${summary.candidate_buyers_count ?? 0}`} hint="одобрени / намерени" />
            <Card label="Конфликти" value={summary.conflicts_count ?? 0} hint={critical ? `${critical} критични` : ""} />
            <Card label="Неясни редове" value={summary.unknown_rows_count ?? 0} />
        </div>
    );
}

function Card({ label, value, hint }) {
    return (
        <div className="rounded-lg border hairline bg-white p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className="text-lg font-semibold mt-1">{value}</div>
            {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
        </div>
    );
}

function UnitsTable({ units, onChange, disabled }) {
    if (units.length === 0) return <div className="text-sm text-slate-500">Няма разпознати обекти.</div>;
    return (
        <div className="rounded-lg border hairline bg-white overflow-x-auto">
            <table className="w-full text-xs">
                <thead className="bg-stone-50 text-slate-600">
                    <tr>
                        <th className="p-2 text-left">✓</th>
                        <th className="p-2 text-left">Код</th>
                        <th className="p-2 text-left">Тип</th>
                        <th className="p-2 text-right">Етаж</th>
                        <th className="p-2 text-right">Стаи</th>
                        <th className="p-2 text-right">Обща площ</th>
                        <th className="p-2 text-right">Стартова цена</th>
                        <th className="p-2 text-left">Статус</th>
                        <th className="p-2 text-right">Сигурност</th>
                        <th className="p-2 text-left">Предупреждения</th>
                    </tr>
                </thead>
                <tbody>
                    {units.map((u, i) => (
                        <tr key={i} className="border-t hairline" data-testid={`imp-unit-${i}`}>
                            <td className="p-2">
                                <input
                                    type="checkbox"
                                    checked={!!u.approved}
                                    disabled={disabled}
                                    onChange={(e) => onChange(i, "approved", e.target.checked)}
                                    data-testid={`imp-unit-approve-${i}`}
                                />
                            </td>
                            <td className="p-2">
                                <Input className="h-7 w-24" value={u.code || ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "code", e.target.value)} />
                            </td>
                            <td className="p-2">
                                <Select value={u.property_type || "apartment"} onValueChange={(v) => onChange(i, "property_type", v)} disabled={disabled}>
                                    <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="apartment">Апартамент</SelectItem>
                                        <SelectItem value="parking">Паркомясто</SelectItem>
                                        <SelectItem value="garage">Гараж</SelectItem>
                                        <SelectItem value="storage">Склад</SelectItem>
                                        <SelectItem value="shop">Магазин</SelectItem>
                                    </SelectContent>
                                </Select>
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-14 ml-auto" type="number" value={u.floor ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "floor", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-14 ml-auto" type="number" value={u.rooms ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "rooms", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-20 ml-auto" type="number" step="0.01" value={u.area_total ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "area_total", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-24 ml-auto" type="number" step="0.01" value={u.start_price_basis ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "start_price_basis", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2">
                                <Select value={u.status_guess || "available"} onValueChange={(v) => onChange(i, "status_guess", v)} disabled={disabled}>
                                    <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="available">Свободен</SelectItem>
                                        <SelectItem value="reserved_paid_deposit">Резервиран</SelectItem>
                                        <SelectItem value="sold">Продаден</SelectItem>
                                    </SelectContent>
                                </Select>
                            </td>
                            <td className={`p-2 text-right font-semibold ${confClass(u.confidence)}`}>{confBadge(u.confidence)}</td>
                            <td className="p-2 text-slate-500">{(u.warnings || []).join(" · ") || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function BuyersTable({ buyers, onChange, disabled }) {
    if (buyers.length === 0) return <div className="text-sm text-slate-500">Няма разпознати купувачи.</div>;
    return (
        <div className="rounded-lg border hairline bg-white overflow-x-auto">
            <table className="w-full text-xs">
                <thead className="bg-stone-50 text-slate-600">
                    <tr>
                        <th className="p-2 text-left">✓</th>
                        <th className="p-2 text-left">Име</th>
                        <th className="p-2 text-left">Телефон</th>
                        <th className="p-2 text-left">Имейл</th>
                        <th className="p-2 text-left">Свързан код</th>
                        <th className="p-2 text-right">Сигурност</th>
                        <th className="p-2 text-left">Предупреждения</th>
                    </tr>
                </thead>
                <tbody>
                    {buyers.map((b, i) => (
                        <tr key={i} className="border-t hairline" data-testid={`imp-buyer-${i}`}>
                            <td className="p-2">
                                <input
                                    type="checkbox"
                                    checked={!!b.approved}
                                    disabled={disabled}
                                    onChange={(e) => onChange(i, "approved", e.target.checked)}
                                    data-testid={`imp-buyer-approve-${i}`}
                                />
                            </td>
                            <td className="p-2">
                                <Input className="h-7 min-w-48" value={b.name || ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "name", e.target.value)} />
                            </td>
                            <td className="p-2">
                                <Input className="h-7 w-36" value={b.phone || ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "phone", e.target.value)} />
                            </td>
                            <td className="p-2">
                                <Input className="h-7 w-48" value={b.email || ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "email", e.target.value)} />
                            </td>
                            <td className="p-2">
                                <Input className="h-7 w-24" value={b.linked_unit_code || ""} disabled={disabled}
                                    onChange={(e) => onChange(i, "linked_unit_code", e.target.value)} />
                            </td>
                            <td className={`p-2 text-right font-semibold ${confClass(b.confidence)}`}>{confBadge(b.confidence)}</td>
                            <td className="p-2 text-slate-500">{(b.warnings || []).join(" · ") || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ConflictsTable({ conflicts }) {
    if (conflicts.length === 0) {
        return (
            <div className="text-sm text-emerald-700 flex items-center gap-2" data-testid="imp-no-conflicts">
                <CheckCircle2 className="h-4 w-4" /> Няма открити конфликти.
            </div>
        );
    }
    return (
        <div className="rounded-lg border hairline bg-white overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-stone-50 text-slate-600">
                    <tr>
                        <th className="p-2 text-left">Тип</th>
                        <th className="p-2 text-left">Код</th>
                        <th className="p-2 text-left">Описание</th>
                        <th className="p-2 text-left">Тежест</th>
                    </tr>
                </thead>
                <tbody>
                    {conflicts.map((c, i) => (
                        <tr key={i} className="border-t hairline" data-testid={`imp-conflict-${i}`}>
                            <td className="p-2 font-mono text-xs">{c.type}</td>
                            <td className="p-2 font-mono text-xs">{c.code || "—"}</td>
                            <td className="p-2 text-slate-700">{c.description}</td>
                            <td className="p-2">
                                {c.severity === "critical" ? (
                                    <span className="inline-flex items-center gap-1 text-rose-700 text-xs">
                                        <XCircle className="h-3.5 w-3.5" /> критична
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
                                        <AlertTriangle className="h-3.5 w-3.5" /> предупреждение
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
