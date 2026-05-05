import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError, formatDate, daysRemaining } from "../../lib/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { RESERVATION_STATUS_LABELS, RESERVATION_TYPE_LABELS } from "../../lib/constants";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";

export default function AdminReservations() {
    const [items, setItems] = useState([]);
    const [inquiries, setInquiries] = useState([]);
    const [busyId, setBusyId] = useState(null);

    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") === "inquiries" ? "inquiries" : "reservations";
    const [activeTab, setActiveTab] = useState(initialTab);

    const onTabChange = (v) => {
        setActiveTab(v);
        const next = new URLSearchParams(searchParams);
        if (v === "inquiries") next.set("tab", "inquiries"); else next.delete("tab");
        setSearchParams(next, { replace: true });
    };

    const [convertDialog, setConvertDialog] = useState(false);
    const [convertTarget, setConvertTarget] = useState(null);
    const [convertAmount, setConvertAmount] = useState("");
    const [convertNotes, setConvertNotes] = useState("");
    const [saving, setSaving] = useState(false);

    const load = () => api.get("/reservations").then((r) => setItems(r.data)).catch(() => {});
    const loadInquiries = () => api.get("/inquiries").then((r) => setInquiries(r.data)).catch(() => {});
    useEffect(() => { load(); loadInquiries(); }, []);

    const release = async (id) => {
        setBusyId(id);
        try {
            await api.post(`/reservations/${id}/release`);
            toast.success("Резервацията е освободена");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setBusyId(null);
        }
    };

    const extend = async (id) => {
        setBusyId(id);
        try {
            await api.post(`/reservations/${id}/extend`, { days: 7 });
            toast.success("Резервацията е удължена с 7 дни");
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setBusyId(null);
        }
    };

    const openConvert = (r) => {
        setConvertTarget(r);
        setConvertAmount("");
        setConvertNotes("");
        setConvertDialog(true);
    };

    const submitConvert = async () => {
        const amount = Number(convertAmount);
        if (!amount || amount <= 0) {
            toast.error("Въведете валидна сума > 0");
            return;
        }
        setSaving(true);
        try {
            await api.post(`/reservations/${convertTarget.id}/convert-to-deposit`, {
                amount,
                notes: convertNotes || null,
            });
            toast.success("Маркирано като капаро");
            setConvertDialog(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="overline mb-2">Операции</div>
                <h1 className="font-serif text-4xl text-slate-900">Резервации & Запитвания</h1>
            </div>

            <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
                <TabsList className="grid grid-cols-2 w-full max-w-md" data-testid="reservations-tabs">
                    <TabsTrigger value="reservations" data-testid="tab-reservations">
                        Резервации
                        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 text-[11px] px-1.5 min-w-[18px] h-[18px]">
                            {items.length}
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="inquiries" data-testid="tab-inquiries">
                        Запитвания
                        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 text-[11px] px-1.5 min-w-[18px] h-[18px]">
                            {inquiries.length}
                        </span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="reservations" className="pt-6">
                    <div className="rounded-xl border hairline bg-white overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-medium">Имот</th>
                            <th className="text-left p-3 font-medium">Клиент</th>
                            <th className="text-left p-3 font-medium">Тип</th>
                            <th className="text-left p-3 font-medium">Имот-статус</th>
                            <th className="text-left p-3 font-medium">Резервация</th>
                            <th className="text-left p-3 font-medium">Валидна до</th>
                            <th className="text-right p-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((r) => {
                            const remaining = daysRemaining(r.expires_at);
                            const isActive = r.status === "active";
                            const isZero = r.reservation_type === "zero_deposit";
                            const busy = busyId === r.id;
                            return (
                                <tr key={r.id} className="border-t hairline align-middle" data-testid={`admin-reservation-${r.id}`}>
                                    <td className="p-3 font-mono font-medium">{r.property?.code}</td>
                                    <td className="p-3 text-slate-600">
                                        <div>{r.client?.name}</div>
                                        <div className="text-xs text-slate-400">{r.client?.email}</div>
                                    </td>
                                    <td className="p-3"><span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs bg-amber-50 text-amber-700 border-amber-200">{RESERVATION_TYPE_LABELS[r.reservation_type]}</span></td>
                                    <td className="p-3"><StatusBadge status={r.property?.status} /></td>
                                    <td className="p-3 text-slate-600">{RESERVATION_STATUS_LABELS[r.status]}</td>
                                    <td className="p-3 text-slate-600 whitespace-nowrap">
                                        {formatDate(r.expires_at)}
                                        {remaining != null && isActive ? ` · ${remaining}д.` : ""}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                            {isActive && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => extend(r.id)}
                                                    disabled={busy}
                                                    data-testid={`extend-reservation-${r.id}`}
                                                >
                                                    +7 дни
                                                </Button>
                                            )}
                                            {isActive && isZero && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openConvert(r)}
                                                    disabled={busy}
                                                    data-testid={`convert-reservation-${r.id}`}
                                                >
                                                    Маркирай капаро
                                                </Button>
                                            )}
                                            {isActive && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => release(r.id)}
                                                    disabled={busy}
                                                    data-testid={`release-reservation-${r.id}`}
                                                >
                                                    Освободи
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr><td className="p-5 text-sm text-slate-500" colSpan={7}>Няма резервации.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
                </TabsContent>

                <TabsContent value="inquiries" className="pt-6">
                    <div className="rounded-xl border hairline bg-white overflow-x-auto" data-testid="inquiries-table">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50 text-slate-600">
                                <tr>
                                    <th className="text-left p-3 font-medium">Име</th>
                                    <th className="text-left p-3 font-medium">Имейл</th>
                                    <th className="text-left p-3 font-medium">Телефон</th>
                                    <th className="text-left p-3 font-medium">Съобщение</th>
                                    <th className="text-left p-3 font-medium">Дата</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inquiries.map((i) => (
                                    <tr key={i.id} className="border-t hairline" data-testid={`inquiry-${i.id}`}>
                                        <td className="p-3 font-medium">{i.name}</td>
                                        <td className="p-3 text-slate-600">{i.email}</td>
                                        <td className="p-3 text-slate-600">{i.phone || "—"}</td>
                                        <td className="p-3 text-slate-600 max-w-md">{i.message}</td>
                                        <td className="p-3 text-slate-600">{formatDate(i.created_at)}</td>
                                    </tr>
                                ))}
                                {inquiries.length === 0 && (
                                    <tr><td className="p-5 text-sm text-slate-500" colSpan={5}>Няма запитвания.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>

            <Dialog open={convertDialog} onOpenChange={setConvertDialog}>
                <DialogContent className="max-w-md" data-testid="convert-deposit-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Маркирай капаро</DialogTitle>
                        <DialogDescription>
                            Zero-deposit резервация {convertTarget?.property?.code} за {convertTarget?.client?.name} ще стане капаро.
                            Имотът ще придобие статус „Резервиран · Капаро".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div>
                            <Label htmlFor="cv-amount">Сума на капарото (EUR) *</Label>
                            <Input
                                id="cv-amount"
                                type="number"
                                min="0"
                                step="0.01"
                                value={convertAmount}
                                onChange={(e) => setConvertAmount(e.target.value)}
                                data-testid="cv-amount"
                            />
                        </div>
                        <div>
                            <Label htmlFor="cv-notes">Бележки (optional)</Label>
                            <Textarea
                                id="cv-notes"
                                rows={3}
                                value={convertNotes}
                                onChange={(e) => setConvertNotes(e.target.value)}
                                data-testid="cv-notes"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertDialog(false)} disabled={saving} data-testid="cv-cancel">
                            Отказ
                        </Button>
                        <Button onClick={submitConvert} disabled={saving} data-testid="cv-save" className="bg-slate-900 hover:bg-slate-800 text-white">
                            {saving ? "Запазване…" : "Потвърди"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
