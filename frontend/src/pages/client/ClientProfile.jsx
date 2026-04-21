import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

const PREFERRED_LABELS = {
    email: "Имейл",
    phone: "Телефон",
    viber: "Viber",
    any: "Няма значение",
};

export default function ClientProfile() {
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/profile");
            setProfile(data);
            setForm({
                name: data.name || "",
                phone: data.phone || "",
                preferred_contact: data.preferred_contact || "",
                client_note: data.client_note || "",
            });
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        }
    };

    useEffect(() => { load(); }, []);

    if (!profile || !form) {
        return <div className="text-slate-500" data-testid="profile-loading">Зареждане…</div>;
    }

    const set = (k) => (e) => {
        const v = e && e.target ? e.target.value : e;
        setForm((f) => ({ ...f, [k]: v }));
    };

    const submit = async () => {
        setSaving(true);
        try {
            const payload = {
                name: form.name || "",
                phone: form.phone || "",
                preferred_contact: form.preferred_contact || "",
                client_note: form.client_note || "",
            };
            const { data } = await api.put("/profile", payload);
            setProfile(data);
            toast.success("Профилът е обновен");
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setSaving(false);
        }
    };

    const complete = profile.completeness?.is_complete;
    const missing = profile.completeness?.missing || [];

    return (
        <div className="space-y-8 max-w-2xl" data-testid="client-profile">
            <div>
                <div className="overline mb-2">Моят профил</div>
                <h1 className="font-serif text-4xl text-slate-900">Профил</h1>
                <p className="text-sm text-slate-500 mt-2">
                    Допълнете контактните си данни — това помага на екипа да стигне до вас по най-удобния за вас начин.
                </p>
            </div>

            <div
                className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                    complete
                        ? "border-emerald-300 bg-emerald-50/70 text-emerald-900"
                        : "border-amber-300 bg-amber-50/70 text-amber-900"
                }`}
                data-testid="profile-completeness-banner"
            >
                {complete ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <div>
                    {complete ? (
                        <div><strong>Профилът е попълнен.</strong></div>
                    ) : (
                        <>
                            <div><strong>Профилът е непълен.</strong></div>
                            <div className="text-xs mt-0.5">
                                Липсва: {missing.map((m) => ({
                                    name: "име",
                                    phone: "телефон",
                                    preferred_contact: "предпочитан контакт",
                                }[m] || m)).join(", ")}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="rounded-xl border hairline bg-white p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label>Име</Label>
                        <Input value={form.name} onChange={set("name")} data-testid="profile-name" />
                    </div>
                    <div>
                        <Label>Имейл</Label>
                        <Input value={profile.email} disabled data-testid="profile-email" />
                        <div className="text-[11px] text-slate-400 mt-1">Имейлът не може да се променя в портала.</div>
                    </div>
                    <div>
                        <Label>Телефон</Label>
                        <Input value={form.phone} onChange={set("phone")} placeholder="+359 …" data-testid="profile-phone" />
                    </div>
                    <div>
                        <Label>Предпочитан контакт</Label>
                        <Select value={form.preferred_contact || ""} onValueChange={set("preferred_contact")}>
                            <SelectTrigger data-testid="profile-preferred">
                                <SelectValue placeholder="Изберете…" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(PREFERRED_LABELS).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <Label>Бележка от Вас</Label>
                    <Textarea
                        rows={3}
                        value={form.client_note}
                        onChange={set("client_note")}
                        placeholder="напр. Моля звънете след 18:00"
                        data-testid="profile-note"
                    />
                </div>

                <div className="flex justify-end">
                    <Button
                        onClick={submit}
                        disabled={saving}
                        data-testid="profile-save"
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        {saving ? "Запазване…" : "Запази"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
