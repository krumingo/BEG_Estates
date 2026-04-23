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
import { UploadCloud, Sparkles, CheckCircle2, AlertTriangle, XCircle, FileText, Info } from "lucide-react";
import { toast } from "sonner";

const DOC_LABELS = {
    area_schedule: "Квадратури",
    pricing: "Цени",
    buyers: "Купувачи",
    floor_plan: "Етажен план",
    summary_table: "Обобщителна таблица",
    mixed: "Смесен",
    unknown: "Неизвестен",
};

const TYPE_LABELS = {
    apartment: "Апартаменти",
    parking: "Паркоместа",
    garage: "Гаражи",
    storage: "Складове",
    shop: "Магазини",
};

const BULK_APPROVE_MIN_CONFIDENCE = 0.80;

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
    const [diff, setDiff] = useState(null);
    const [loadingDiff, setLoadingDiff] = useState(false);
    const [activeTab, setActiveTab] = useState("units");
    const [unitsFilter, setUnitsFilter] = useState({ type: null, manualOnly: false });
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

    // Safety predicate за bulk approve. Rows, които НЕ match-ват, се оставят за ръчен преглед.
    const conflictCodes = React.useMemo(() => {
        const s = new Set();
        for (const c of conflicts) {
            if (c?.code && (c.severity === "critical" || c.severity === "warning")) {
                s.add(c.code);
            }
        }
        return s;
    }, [conflicts]);
    const isSafeForBulk = React.useCallback((u) => {
        if (!u) return false;
        if (typeof u.code !== "string" || !u.code.trim()) return false;
        if (!u.property_type) return false;
        if ((u.confidence ?? 0) < 0.80) return false;
        if (conflictCodes.has(u.code)) return false;
        return true;
    }, [conflictCodes]);

    // Filtered изглед за tab „Обекти" (ползва originalIndex за callbacks).
    const filteredUnitsView = React.useMemo(() => {
        const rows = units.map((u, idx) => ({ ...u, _idx: idx }));
        return rows.filter((u) => {
            if (unitsFilter.type && u.property_type !== unitsFilter.type) return false;
            if (unitsFilter.manualOnly && isSafeForBulk(u)) return false;
            return true;
        });
    }, [units, unitsFilter, isSafeForBulk]);

    const bulkApproveByType = async (propertyType, approve) => {
        if (!session) return;
        const next = units.map((u) => {
            if (u.property_type !== propertyType) return u;
            if (approve) {
                return isSafeForBulk(u) ? { ...u, approved: true } : u;
            }
            return { ...u, approved: false };
        });
        setSession((s) => ({
            ...s,
            extracted_payload: { ...s.extracted_payload, candidate_units: next },
        }));
        setDiff(null);
        try {
            await api.patch(`/import-sessions/${session.id}/review-payload`, {
                candidate_units: next,
                candidate_buyers: buyers,
            });
            const label = TYPE_LABELS[propertyType] || propertyType;
            if (approve) {
                const changed = next.filter((u, i) => u.property_type === propertyType && !units[i].approved && u.approved).length;
                toast.success(`Одобрени ${changed} ${label.toLowerCase()}`);
            } else {
                const changed = units.filter((u) => u.property_type === propertyType && u.approved).length;
                toast.success(`Махнато одобрение от ${changed} ${label.toLowerCase()}`);
            }
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

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
            candidate_floor_plans: extracted.candidate_floor_plans || [],
        });
    };

    const setDocumentTypeOverride = async (fileId, value) => {
        if (!session) return;
        try {
            const { data } = await api.patch(
                `/import-sessions/${session.id}/files/${fileId}/document-type`,
                { document_type: value === "__auto__" ? null : value },
            );
            setSession(data);
            setDiff(null);
            toast.success("Document type обновен — пуснете „Разпознай отново“");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    const loadDiff = async () => {
        if (!session) return;
        setLoadingDiff(true);
        try {
            await persistReview(); // запазва edits преди diff calc
            const { data } = await api.get(`/import-sessions/${session.id}/apply-diff`);
            setDiff(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoadingDiff(false);
        }
    };


    const updateUnit = (idx, field, value) => {
        const next = units.map((u, i) => (i === idx ? { ...u, [field]: value } : u));
        setSession((s) => ({ ...s, extracted_payload: { ...s.extracted_payload, candidate_units: next } }));
    };
    const updateBuyer = (idx, field, value) => {
        const next = buyers.map((b, i) => (i === idx ? { ...b, [field]: value } : b));
        setSession((s) => ({ ...s, extracted_payload: { ...s.extracted_payload, candidate_buyers: next } }));
    };
    const updateFloorPlan = (idx, field, value) => {
        const plans = extracted.candidate_floor_plans || [];
        const next = plans.map((p, i) => (i === idx ? { ...p, [field]: value } : p));
        setSession((s) => ({ ...s, extracted_payload: { ...s.extracted_payload, candidate_floor_plans: next } }));
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
                            {analyzing ? "Разпознаване…" : (session.status === "review_ready" ? "Разпознай отново" : "Разпознай документи")}
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
                                <th className="p-2 text-left font-medium">AI guess</th>
                                <th className="p-2 text-left font-medium">Приложен тип (override)</th>
                                <th className="p-2 text-right font-medium">Обекти</th>
                                <th className="p-2 text-right font-medium">Стр.</th>
                                <th className="p-2 text-right font-medium">Сигурност</th>
                            </tr>
                        </thead>
                        <tbody>
                            {session.files.map((f) => {
                                const byType = f.extracted_units_by_type || {};
                                const appliedHint = [
                                    byType.apartment ? `${byType.apartment} АП` : null,
                                    byType.parking ? `${byType.parking} ПМ` : null,
                                    byType.garage ? `${byType.garage} Г` : null,
                                    byType.storage ? `${byType.storage} СКЛ` : null,
                                    byType.shop ? `${byType.shop} МАГ` : null,
                                ].filter(Boolean).join(" · ");
                                return (
                                    <tr key={f.id} className="border-t hairline" data-testid={`imp-file-row-${f.id}`}>
                                        <td className="p-2 align-middle max-w-xs">
                                            <div className="truncate">{f.original_name}</div>
                                            {appliedHint && (
                                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{appliedHint}</div>
                                            )}
                                        </td>
                                        <td className="p-2 text-slate-600">{DOC_LABELS[f.document_type_guess] || "—"}</td>
                                        <td className="p-2">
                                            <Select
                                                value={f.document_type_override || "__auto__"}
                                                onValueChange={(v) => setDocumentTypeOverride(f.id, v)}
                                                disabled={sessionApplied}
                                            >
                                                <SelectTrigger
                                                    className="h-8 w-44"
                                                    data-testid={`imp-doc-type-${f.id}`}
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__auto__">
                                                        Auto (AI: {DOC_LABELS[f.document_type_guess] || "—"})
                                                    </SelectItem>
                                                    <SelectItem value="area_schedule">Квадратури</SelectItem>
                                                    <SelectItem value="pricing">Цени</SelectItem>
                                                    <SelectItem value="buyers">Купувачи</SelectItem>
                                                    <SelectItem value="floor_plan">Етажен план</SelectItem>
                                                    <SelectItem value="summary_table">Обобщителна таблица</SelectItem>
                                                    <SelectItem value="mixed">Смесен</SelectItem>
                                                    <SelectItem value="unknown">Неизвестен</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="p-2 text-right font-mono text-xs">
                                            {f.extracted_units_count ?? "—"}
                                        </td>
                                        <td className="p-2 text-right">{f.pages_count ?? "—"}</td>
                                        <td className={`p-2 text-right ${confClass(f.document_type_guess_confidence || 0)}`}>
                                            {f.document_type_guess_confidence != null ? confBadge(f.document_type_guess_confidence) : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {session?.status === "review_ready" || sessionApplied ? (
                <div className="space-y-6" data-testid="imp-review">
                    <SummaryBar summary={summary} approvedUnits={approvedUnits} approvedBuyers={approvedBuyers} conflicts={conflicts} />
                    <BreakdownPanel
                        summary={summary}
                        perFile={session.files || []}
                        units={units}
                        isSafeForBulk={isSafeForBulk}
                        onBulkApprove={bulkApproveByType}
                        onManualReviewClick={(type) => {
                            setUnitsFilter({ type, manualOnly: true });
                            setActiveTab("units");
                        }}
                        disabled={sessionApplied}
                    />

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid grid-cols-4 w-full max-w-3xl" data-testid="imp-tabs">
                            <TabsTrigger value="units" data-testid="imp-tab-units">Обекти ({units.length})</TabsTrigger>
                            <TabsTrigger value="buyers" data-testid="imp-tab-buyers">Купувачи ({buyers.length})</TabsTrigger>
                            <TabsTrigger value="floors" data-testid="imp-tab-floors">Етажи / Планове ({(extracted.candidate_floor_plans || []).length})</TabsTrigger>
                            <TabsTrigger value="conflicts" data-testid="imp-tab-conflicts">Конфликти ({conflicts.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="units" className="pt-4 space-y-2">
                            <UnitsFilterBar
                                filter={unitsFilter}
                                totalVisible={filteredUnitsView.length}
                                totalAll={units.length}
                                onClear={() => setUnitsFilter({ type: null, manualOnly: false })}
                            />
                            <UnitsTable units={filteredUnitsView} onChange={updateUnit} disabled={sessionApplied} />
                        </TabsContent>
                        <TabsContent value="buyers" className="pt-4">
                            <BuyersTable buyers={buyers} onChange={updateBuyer} disabled={sessionApplied} />
                        </TabsContent>
                        <TabsContent value="floors" className="pt-4">
                            <FloorPlanPagesTable
                                pages={extracted.candidate_floor_plans || []}
                                files={session.files || []}
                                summary={summary}
                                onChange={updateFloorPlan}
                                disabled={sessionApplied}
                                sessionId={session.id}
                                projectId={session.project_id}
                            />
                        </TabsContent>
                        <TabsContent value="conflicts" className="pt-4">
                            <ConflictsTable conflicts={conflicts} />
                        </TabsContent>
                    </Tabs>

                    {!sessionApplied && (
                        <ApplyDiffPanel
                            diff={diff}
                            loading={loadingDiff}
                            onLoad={loadDiff}
                        />
                    )}

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

function BreakdownPanel({ summary, perFile, units, isSafeForBulk, onBulkApprove, onManualReviewClick, disabled }) {
    const byType = summary.by_type || {};
    const sanity = summary.sanity_warnings || [];

    const typeStats = (key) => {
        const filtered = (units || []).filter((u) => u.property_type === key);
        const total = byType[key] ?? filtered.length;
        const approved = filtered.filter((u) => u.approved).length;
        const eligibleRemaining = filtered.filter((u) => !u.approved && isSafeForBulk?.(u)).length;
        const manualRemaining = filtered.filter((u) => !u.approved && !isSafeForBulk?.(u)).length;
        return { total, approved, eligibleRemaining, manualRemaining };
    };

    return (
        <div className="space-y-4" data-testid="imp-breakdown">
            <div>
                <div className="overline mb-2 text-slate-500">Breakdown по тип</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="imp-breakdown-types">
                    {Object.entries(TYPE_LABELS).map(([key, label]) => {
                        const s = typeStats(key);
                        return (
                            <div
                                key={key}
                                className="rounded-lg border hairline bg-white p-3 space-y-2"
                                data-testid={`imp-type-card-${key}`}
                            >
                                <div className="overline text-slate-500">{label}</div>
                                <div className="text-2xl font-semibold tabular-nums text-slate-900">
                                    {s.total}
                                </div>
                                <div className="text-[11px] text-slate-600 space-y-0.5 leading-tight">
                                    <div>одобрени: <span className="font-mono">{s.approved}</span></div>
                                    <div>за одобряване: <span className="font-mono">{s.eligibleRemaining}</span></div>
                                    {s.manualRemaining > 0 && (
                                        <button
                                            type="button"
                                            className="text-amber-700 text-left w-full hover:text-amber-900 hover:underline focus:outline-none"
                                            onClick={() => onManualReviewClick?.(key)}
                                            data-testid={`imp-type-manual-${key}`}
                                        >
                                            {s.manualRemaining} за ръчен преглед
                                            <span className="text-[10px] text-amber-600/80 block">
                                                (ниска сигурност / конфликт — клик за филтър)
                                            </span>
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-1.5 pt-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 h-7 text-[11px]"
                                        onClick={() => onBulkApprove?.(key, true)}
                                        disabled={disabled || s.eligibleRemaining === 0}
                                        data-testid={`imp-type-approve-${key}`}
                                    >
                                        Одобри всички
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 h-7 text-[11px]"
                                        onClick={() => onBulkApprove?.(key, false)}
                                        disabled={disabled || s.approved === 0}
                                        data-testid={`imp-type-unapprove-${key}`}
                                    >
                                        Махни
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {perFile.length > 0 && (
                <div>
                    <div className="overline mb-2 text-slate-500">По файл</div>
                    <div className="rounded-lg border hairline bg-white overflow-x-auto" data-testid="imp-breakdown-files">
                        <table className="w-full text-xs">
                            <thead className="bg-stone-50 text-slate-600">
                                <tr>
                                    <th className="p-2 text-left font-medium">Файл</th>
                                    <th className="p-2 text-left font-medium">Приложен тип</th>
                                    <th className="p-2 text-right font-medium">Обекти</th>
                                    <th className="p-2 text-right font-medium">Апарт.</th>
                                    <th className="p-2 text-right font-medium">ПМ</th>
                                    <th className="p-2 text-right font-medium">Гаражи</th>
                                    <th className="p-2 text-right font-medium">Складове</th>
                                    <th className="p-2 text-right font-medium">Магазини</th>
                                    <th className="p-2 text-right font-medium">Купувачи</th>
                                </tr>
                            </thead>
                            <tbody>
                                {perFile.map((f) => {
                                    const b = f.extracted_units_by_type || {};
                                    return (
                                        <tr key={f.id} className="border-t hairline">
                                            <td className="p-2 truncate max-w-xs">{f.original_name}</td>
                                            <td className="p-2 text-slate-600">
                                                {DOC_LABELS[f.document_type_applied || f.document_type_guess] || "—"}
                                            </td>
                                            <td className="p-2 text-right font-mono">{f.extracted_units_count ?? 0}</td>
                                            <td className="p-2 text-right font-mono">{b.apartment ?? 0}</td>
                                            <td className="p-2 text-right font-mono">{b.parking ?? 0}</td>
                                            <td className="p-2 text-right font-mono">{b.garage ?? 0}</td>
                                            <td className="p-2 text-right font-mono">{b.storage ?? 0}</td>
                                            <td className="p-2 text-right font-mono">{b.shop ?? 0}</td>
                                            <td className="p-2 text-right font-mono">{f.extracted_buyers_count ?? 0}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {sanity.length > 0 && (
                <div
                    className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1"
                    data-testid="imp-sanity-warnings"
                >
                    <div className="flex items-center gap-2 font-medium">
                        <Info className="h-4 w-4" /> Diagnosis
                    </div>
                    <ul className="list-disc ml-5 space-y-0.5 text-xs">
                        {sanity.map((w, i) => (
                            <li key={i} data-testid={`imp-sanity-${i}`}>{w}</li>
                        ))}
                    </ul>
                    <div className="text-[10px] text-amber-800/80 italic pt-1">
                        Ако някой файл е класифициран грешно — сменете „Приложен тип" в таблицата с файловете и натиснете „Разпознай отново".
                    </div>
                </div>
            )}
        </div>
    );
}


const PROP_TYPE_LABELS = {
    apartment: "Апарт.",
    parking: "ПМ",
    garage: "Гараж",
    storage: "Склад",
    shop: "Магазин",
};

function ApplyDiffPanel({ diff, loading, onLoad }) {
    const [open, setOpen] = React.useState(false);
    return (
        <div className="rounded-lg border hairline bg-white p-4 space-y-3" data-testid="imp-diff-panel">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm font-semibold text-slate-900">Какво ще се промени?</div>
                <div className="text-xs text-slate-500">
                    Dry-run preview — не записва нищо в базата.
                </div>
                <div className="ml-auto">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { onLoad(); setOpen(true); }}
                        disabled={loading}
                        data-testid="imp-diff-load"
                    >
                        {loading ? "Изчисляване…" : (diff ? "Прекалкулирай" : "Покажи diff")}
                    </Button>
                </div>
            </div>

            {diff && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="imp-diff-summary">
                        <Card label="Нови имоти" value={diff.summary.create_properties} />
                        <Card label="Update имоти" value={diff.summary.update_properties} />
                        <Card label="Нови купувачи" value={diff.summary.create_buyers} />
                        <Card label="Update купувачи" value={diff.summary.update_buyers} />
                        <Card label="Пропуснати" value={diff.summary.skip_total} />
                    </div>
                    <button
                        className="text-xs text-slate-600 underline"
                        onClick={() => setOpen((v) => !v)}
                        data-testid="imp-diff-toggle"
                    >
                        {open ? "Скрий детайли" : "Покажи детайли"}
                    </button>
                    {open && (
                        <div className="space-y-4" data-testid="imp-diff-details">
                            <DiffSection
                                title={`Нови имоти (${diff.to_create.properties.length})`}
                                tone="emerald"
                            >
                                {diff.to_create.properties.length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">—</div>
                                ) : (
                                    <ul className="text-xs space-y-0.5">
                                        {diff.to_create.properties.map((p, i) => (
                                            <li key={i} className="flex gap-2 items-baseline">
                                                <span className="font-mono w-20">{p.code}</span>
                                                <span className="text-slate-500">{PROP_TYPE_LABELS[p.property_type] || p.property_type || "?"}</span>
                                                {p.area_total && <span className="text-slate-500">{p.area_total} м²</span>}
                                                {p.list_price && <span className="text-slate-500">{p.list_price} EUR</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DiffSection>
                            <DiffSection
                                title={`Update имоти (${diff.to_update.properties.length})`}
                                tone="amber"
                            >
                                {diff.to_update.properties.length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">—</div>
                                ) : (
                                    <ul className="text-xs space-y-1">
                                        {diff.to_update.properties.map((p, i) => (
                                            <li key={i}>
                                                <div className="flex gap-2 items-baseline">
                                                    <span className="font-mono w-20">{p.code}</span>
                                                    <span className="text-slate-500">{PROP_TYPE_LABELS[p.property_type] || p.property_type || "?"}</span>
                                                </div>
                                                <ul className="ml-6 text-[11px] text-slate-600">
                                                    {p.changed_fields.map((f, j) => (
                                                        <li key={j}>
                                                            <span className="font-mono">{f.field}:</span>{" "}
                                                            <span className="line-through text-rose-600">{String(f.from ?? "—")}</span>{" → "}
                                                            <span className="text-emerald-700">{String(f.to ?? "—")}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DiffSection>
                            <DiffSection
                                title={`Нови купувачи (${diff.to_create.buyers.length})`}
                                tone="emerald"
                            >
                                {diff.to_create.buyers.length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">—</div>
                                ) : (
                                    <ul className="text-xs space-y-0.5">
                                        {diff.to_create.buyers.map((b, i) => (
                                            <li key={i}>
                                                <strong>{b.name}</strong>
                                                {b.phone && <span className="text-slate-500"> · {b.phone}</span>}
                                                {b.email && <span className="text-slate-500"> · {b.email}</span>}
                                                {b.link_note && <span className="text-slate-500 italic"> · {b.link_note}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DiffSection>
                            <DiffSection
                                title={`Update купувачи (${diff.to_update.buyers.length})`}
                                tone="amber"
                            >
                                {diff.to_update.buyers.length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">—</div>
                                ) : (
                                    <ul className="text-xs space-y-1">
                                        {diff.to_update.buyers.map((b, i) => (
                                            <li key={i}>
                                                <strong>{b.name}</strong>
                                                <ul className="ml-4 text-[11px] text-slate-600">
                                                    {b.changed_fields.map((f, j) => (
                                                        <li key={j}>
                                                            <span className="font-mono">{f.field}:</span>{" "}
                                                            <span className="line-through text-rose-600">{String(f.from ?? "—")}</span>{" → "}
                                                            <span className="text-emerald-700">{String(f.to ?? "—")}</span>
                                                        </li>
                                                    ))}
                                                    {b.link_note && <li className="italic text-slate-500">{b.link_note}</li>}
                                                </ul>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DiffSection>
                            <DiffSection
                                title={`Пропуснати (${diff.to_skip.length})`}
                                tone="slate"
                            >
                                {diff.to_skip.length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">—</div>
                                ) : (
                                    <ul className="text-xs space-y-0.5 max-h-48 overflow-y-auto">
                                        {diff.to_skip.map((s, i) => (
                                            <li key={i}>
                                                <span className="font-mono w-16 inline-block">[{s.kind}]</span>
                                                {" "}{s.code || "—"}{" "}
                                                <span className="text-slate-500 italic">· {s.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DiffSection>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function DiffSection({ title, tone = "slate", children }) {
    const toneBorder = {
        emerald: "border-emerald-200 bg-emerald-50/40",
        amber: "border-amber-200 bg-amber-50/40",
        slate: "border-slate-200 bg-stone-50",
    }[tone];
    return (
        <div className={`rounded-md border ${toneBorder} p-3`}>
            <div className="text-xs font-semibold text-slate-800 mb-1.5">{title}</div>
            {children}
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

function UnitsFilterBar({ filter, totalVisible, totalAll, onClear }) {
    const hasFilter = !!(filter.type || filter.manualOnly);
    if (!hasFilter) return null;
    return (
        <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs"
            data-testid="imp-units-filter-bar"
        >
            <span className="text-slate-700 font-medium">Филтър:</span>
            {filter.type && (
                <span
                    className="inline-flex items-center rounded-full bg-white border border-slate-200 px-2 py-0.5 font-mono text-slate-700"
                    data-testid="imp-units-filter-type"
                >
                    Тип: {TYPE_LABELS[filter.type] || filter.type}
                </span>
            )}
            {filter.manualOnly && (
                <span
                    className="inline-flex items-center rounded-full bg-white border border-amber-300 px-2 py-0.5 text-amber-800"
                    data-testid="imp-units-filter-manual"
                >
                    Само за ръчен преглед
                </span>
            )}
            <span className="text-slate-500 ml-1">
                {totalVisible} / {totalAll}
            </span>
            <button
                type="button"
                className="ml-auto text-slate-600 hover:text-slate-900 underline"
                onClick={onClear}
                data-testid="imp-units-filter-clear"
            >
                Изчисти филтрите
            </button>
        </div>
    );
}

function UnitsTable({ units, onChange, disabled }) {
    if (units.length === 0) return <div className="text-sm text-slate-500" data-testid="imp-units-empty">Няма обекти за показване при текущите филтри.</div>;
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
                    {units.map((u, i) => {
                        const idx = u._idx ?? i;
                        return (
                        <tr key={idx} className="border-t hairline" data-testid={`imp-unit-${idx}`}>
                            <td className="p-2">
                                <input
                                    type="checkbox"
                                    checked={!!u.approved}
                                    disabled={disabled}
                                    onChange={(e) => onChange(idx, "approved", e.target.checked)}
                                    data-testid={`imp-unit-approve-${idx}`}
                                />
                            </td>
                            <td className="p-2">
                                <Input className="h-7 w-24" value={u.code || ""} disabled={disabled}
                                    onChange={(e) => onChange(idx, "code", e.target.value)} />
                            </td>
                            <td className="p-2">
                                <Select value={u.property_type || "apartment"} onValueChange={(v) => onChange(idx, "property_type", v)} disabled={disabled}>
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
                                    onChange={(e) => onChange(idx, "floor", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-14 ml-auto" type="number" value={u.rooms ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(idx, "rooms", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-20 ml-auto" type="number" step="0.01" value={u.area_total ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(idx, "area_total", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2 text-right">
                                <Input className="h-7 w-24 ml-auto" type="number" step="0.01" value={u.start_price_basis ?? ""} disabled={disabled}
                                    onChange={(e) => onChange(idx, "start_price_basis", e.target.value === "" ? null : Number(e.target.value))} />
                            </td>
                            <td className="p-2">
                                <Select value={u.status_guess || "available"} onValueChange={(v) => onChange(idx, "status_guess", v)} disabled={disabled}>
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
                        );
                    })}
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


function FloorPlanPagesTable({ pages, files, summary, onChange, disabled, sessionId, projectId }) {
    const fileById = React.useMemo(() => {
        const m = {};
        for (const f of files) m[f.id] = f;
        return m;
    }, [files]);

    const [applying, setApplying] = React.useState(false);
    const [applyReport, setApplyReport] = React.useState(null);

    const approvedCount = (pages || []).filter(
        (p) => p.review_status === "approved" && typeof p.floor === "number"
    ).length;

    const applyFloorPlans = async (dryRun = false) => {
        if (!sessionId) return;
        setApplying(true);
        try {
            // Винаги първо persist-ваме review payload, за да не се губят edits
            await api.patch(`/import-sessions/${sessionId}/review-payload`, {
                candidate_floor_plans: pages,
            });
            const endpoint = dryRun
                ? `/import-sessions/${sessionId}/floor-plans-diff`
                : `/import-sessions/${sessionId}/apply-floor-plans`;
            const resp = dryRun ? await api.get(endpoint) : await api.post(endpoint);
            setApplyReport({ ...resp.data, wasDryRun: dryRun });
            if (!dryRun) {
                const s = resp.data.summary || {};
                toast.success(
                    `Приложено: ${s.created || 0} създадени · ${s.updated || 0} обновени · ${s.skipped || 0} пропуснати`
                );
            }
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setApplying(false);
        }
    };

    if (!pages || pages.length === 0) {
        return (
            <div className="text-sm text-slate-500" data-testid="imp-floors-empty">
                Няма разпознати етажни страници. Качете архитектурен PDF и натиснете „Разпознай отново".
            </div>
        );
    }

    const floorOptions = ["__none__", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

    return (
        <div className="space-y-3" data-testid="imp-floors-panel">
            <div className="flex items-center gap-2 flex-wrap">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyFloorPlans(true)}
                    disabled={applying || approvedCount === 0 || disabled}
                    data-testid="imp-floors-dryrun"
                >
                    Преглед преди apply
                </Button>
                <Button
                    size="sm"
                    onClick={() => applyFloorPlans(false)}
                    disabled={applying || approvedCount === 0 || disabled}
                    data-testid="imp-floors-apply"
                >
                    {applying ? "Прилагане…" : `Приложи към Етажни схеми (${approvedCount})`}
                </Button>
                <div className="text-xs text-slate-500">
                    Записва само approved страници · manual mappings не се заместват
                </div>
                {projectId && (
                    <a
                        href={`/admin/floor-plans?project=${projectId}`}
                        className="ml-auto text-xs text-blue-600 hover:underline"
                        data-testid="imp-floors-goto-mapper"
                    >
                        Отвори „Етажни схеми" →
                    </a>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="imp-floors-summary">
                <Card label="Етажни страници" value={summary.floor_plan_pages_total ?? pages.length} />
                <Card label="Автоматично вързани" value={summary.auto_linked_pages ?? 0} />
                <Card label="Невързани страници" value={summary.unlinked_pages ?? 0} />
                <Card
                    label="Невързани units"
                    value={summary.unplaced_units ?? 0}
                    hint={(summary.unplaced_unit_codes || []).slice(0, 6).join(", ")}
                />
            </div>

            {applyReport && (
                <div
                    className="rounded-md border border-slate-200 bg-stone-50 p-3 text-xs space-y-2"
                    data-testid="imp-floors-report"
                >
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                            {applyReport.wasDryRun ? "Dry-run преглед" : "Резултат от apply"}
                        </span>
                        <span className="text-slate-500">
                            create: <strong className="text-emerald-700">{applyReport.summary.created}</strong>
                            {" · "}update: <strong className="text-amber-700">{applyReport.summary.updated}</strong>
                            {" · "}skip: <strong className="text-slate-700">{applyReport.summary.skipped}</strong>
                        </span>
                    </div>
                    <ul className="space-y-0.5 max-h-60 overflow-y-auto">
                        {applyReport.details.map((d, i) => (
                            <li key={i} className="flex gap-2 items-baseline">
                                <span className="font-mono w-14 text-slate-600">fl:{d.floor ?? "—"}</span>
                                <span
                                    className={
                                        d.action === "created" ? "text-emerald-700"
                                        : d.action === "updated" ? "text-amber-700"
                                        : "text-slate-500"
                                    }
                                >
                                    {d.action}
                                </span>
                                {d.reason && <span className="text-slate-500 italic">· {d.reason}</span>}
                                {d.matched_unit_codes && d.matched_unit_codes.length > 0 && (
                                    <span className="text-slate-600">· {d.matched_unit_codes.join(", ")}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="rounded-lg border hairline bg-white overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="p-2 text-left">✓</th>
                            <th className="p-2 text-left">Файл / стр.</th>
                            <th className="p-2 text-left">Етаж</th>
                            <th className="p-2 text-right">Увереност</th>
                            <th className="p-2 text-left">Matched codes</th>
                            <th className="p-2 text-left">Detected (+extra)</th>
                            <th className="p-2 text-left">Предупреждения</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pages.map((p, i) => {
                            const fname = fileById[p.source_file_id]?.original_name || p.source_file_id;
                            const matched = p.matched_unit_codes || [];
                            const unmatched = p.unmatched_detected_codes || [];
                            const approved = p.review_status === "approved";
                            return (
                                <tr key={i} className="border-t hairline" data-testid={`imp-floor-page-${i}`}>
                                    <td className="p-2">
                                        <input
                                            type="checkbox"
                                            checked={approved}
                                            disabled={disabled}
                                            onChange={(e) => onChange(i, "review_status", e.target.checked ? "approved" : "pending")}
                                            data-testid={`imp-floor-approve-${i}`}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <div className="font-mono text-[11px] text-slate-900">{fname}</div>
                                        <div className="text-[10px] text-slate-500">стр. {p.page_number}</div>
                                        {p.page_text_excerpt && (
                                            <div className="text-[10px] text-slate-400 truncate max-w-xs italic">
                                                {p.page_text_excerpt.slice(0, 60)}…
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        <Select
                                            value={p.floor == null ? "__none__" : String(p.floor)}
                                            onValueChange={(v) => onChange(i, "floor", v === "__none__" ? null : Number(v))}
                                            disabled={disabled}
                                        >
                                            <SelectTrigger className="h-7 w-20" data-testid={`imp-floor-select-${i}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {floorOptions.map((v) => (
                                                    <SelectItem key={v} value={v}>
                                                        {v === "__none__" ? "—" : v}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className={`p-2 text-right font-semibold ${confClass(p.floor_guess_confidence || 0)}`}>
                                        {confBadge(p.floor_guess_confidence || 0)}
                                    </td>
                                    <td className="p-2">
                                        {matched.length === 0 ? (
                                            <span className="text-slate-400 italic">—</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {matched.slice(0, 10).map((c) => (
                                                    <span key={c} className="inline-flex rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">
                                                        {c}
                                                    </span>
                                                ))}
                                                {matched.length > 10 && (
                                                    <span className="text-[10px] text-slate-500">+{matched.length - 10}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {unmatched.length === 0 ? (
                                            <span className="text-slate-400 italic">—</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {unmatched.slice(0, 8).map((c) => (
                                                    <span key={c} className="inline-flex rounded bg-stone-100 border border-stone-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                                        {c}
                                                    </span>
                                                ))}
                                                {unmatched.length > 8 && (
                                                    <span className="text-[10px] text-slate-500">+{unmatched.length - 8}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2 text-slate-500 text-[11px]">
                                        {(p.warnings || []).join(" · ") || "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="text-[11px] text-slate-500 italic">
                Тези данни са само преглед — няма да бъдат записани в Етажни планове без ръчно потвърждение от Admin → Етажни схеми.
            </div>
        </div>
    );
}
