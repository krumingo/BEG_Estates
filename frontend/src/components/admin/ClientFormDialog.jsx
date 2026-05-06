import React, { useEffect, useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../ui/select";
import { api, formatApiError } from "../../lib/api";
import { toast } from "sonner";

export const CLIENT_TYPE_OPTIONS = [
    { value: "buyer", label: "Купувач" },
    { value: "investor", label: "Инвеститор" },
    { value: "company", label: "Фирма" },
    { value: "compensation", label: "Обезщетение" },
];

const EMPTY = {
    name: "", email: "", phone: "", egn: "", address: "", notes: "", client_type: "buyer",
};

/**
 * Reusable modal for creating/editing a client.
 * - mode: "create" | "edit"
 * - initial: full client object (for edit) or null
 * - onSaved(client): called after successful save
 */
export default function ClientFormDialog({ open, onOpenChange, mode, initial, onSaved }) {
    const [form, setForm] = useState(EMPTY);
    const [loading, setLoading] = useState(false);
    const [linked, setLinked] = useState(null); // { properties, reservations }
    const isEdit = mode === "edit";

    useEffect(() => {
        if (!open) return;
        if (isEdit && initial) {
            setForm({
                name: initial.name || "",
                email: initial.email || "",
                phone: initial.phone || "",
                egn: initial.egn || "",
                address: initial.address || "",
                notes: initial.notes || "",
                client_type: initial.client_type || "buyer",
            });
            // Load linked details
            api.get(`/clients/${initial.id}`).then((r) => {
                setLinked({
                    properties: r.data?.properties || [],
                    reservations: r.data?.reservations || [],
                });
            }).catch(() => setLinked(null));
        } else {
            setForm(EMPTY);
            setLinked(null);
        }
    }, [open, mode, initial, isEdit]);

    const set = (k) => (e) => {
        const v = e?.target ? e.target.value : e;
        setForm((s) => ({ ...s, [k]: v }));
    };

    const submit = async () => {
        const name = (form.name || "").trim();
        if (!name) {
            toast.error("Името е задължително");
            return;
        }
        setLoading(true);
        try {
            const body = {
                name,
                email: form.email?.trim() || null,
                phone: form.phone?.trim() || null,
                egn: form.egn?.trim() || null,
                address: form.address?.trim() || null,
                notes: form.notes?.trim() || null,
                client_type: form.client_type || "buyer",
            };
            const { data } = isEdit
                ? await api.put(`/clients/${initial.id}`, body)
                : await api.post("/clients", body);
            toast.success(isEdit ? "Клиентът е обновен" : "Клиентът е създаден");
            onOpenChange(false);
            onSaved?.(data);
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl" data-testid="client-form-dialog">
                <DialogHeader>
                    <DialogTitle className="font-serif text-2xl">
                        {isEdit ? "Редакция на клиент" : "Нов клиент"}
                    </DialogTitle>
                    <DialogDescription>
                        Името е задължително. Имейлът, телефонът и ЕГН са опционални.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div>
                        <Label>Име *</Label>
                        <Input value={form.name} onChange={set("name")} data-testid="client-form-name" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <Label>Email</Label>
                            <Input
                                type="email"
                                value={form.email}
                                onChange={set("email")}
                                placeholder="—"
                                data-testid="client-form-email"
                            />
                        </div>
                        <div>
                            <Label>Телефон</Label>
                            <Input
                                value={form.phone}
                                onChange={set("phone")}
                                placeholder="—"
                                data-testid="client-form-phone"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <Label>ЕГН</Label>
                            <Input
                                value={form.egn}
                                onChange={set("egn")}
                                placeholder="—"
                                data-testid="client-form-egn"
                            />
                        </div>
                        <div>
                            <Label>Тип</Label>
                            <Select value={form.client_type} onValueChange={set("client_type")}>
                                <SelectTrigger data-testid="client-form-type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CLIENT_TYPE_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label>Адрес</Label>
                        <Input
                            value={form.address}
                            onChange={set("address")}
                            placeholder="—"
                            data-testid="client-form-address"
                        />
                    </div>
                    <div>
                        <Label>Бележки</Label>
                        <Textarea
                            rows={3}
                            value={form.notes}
                            onChange={set("notes")}
                            placeholder="—"
                            data-testid="client-form-notes"
                        />
                    </div>

                    {isEdit && linked && (linked.properties.length > 0 || linked.reservations.length > 0) && (
                        <div className="rounded-md border hairline bg-stone-50 p-3" data-testid="client-form-linked">
                            <div className="overline mb-2">Свързани имоти</div>
                            {linked.properties.length === 0 && (
                                <div className="text-xs text-slate-500">Няма свързани имоти.</div>
                            )}
                            <ul className="text-sm text-slate-700 space-y-0.5">
                                {linked.properties.map((p) => (
                                    <li key={p.id}>
                                        {p.code}{p.project_name ? ` (${p.project_name})` : ""} —{" "}
                                        <span className="text-slate-500">{p.status}</span>
                                    </li>
                                ))}
                            </ul>
                            {linked.reservations.length > 0 && (
                                <>
                                    <div className="overline mt-3 mb-1">Резервации</div>
                                    <div className="text-sm text-slate-600">
                                        {linked.reservations.length} запис(а)
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        data-testid="client-form-cancel"
                    >
                        Отказ
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={loading}
                        className="bg-slate-900 text-white hover:bg-slate-800"
                        data-testid="client-form-save"
                    >
                        {loading ? "Запис…" : "Запази"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
