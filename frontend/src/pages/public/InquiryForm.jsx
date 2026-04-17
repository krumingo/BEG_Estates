import React, { useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";

export default function InquiryForm({ projectId, propertyId }) {
    const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post("/inquiries", {
                ...form,
                project_id: projectId,
                property_id: propertyId,
            });
            toast.success("Благодарим! Ще се свържем с вас скоро.");
            setForm({ name: "", email: "", phone: "", message: "" });
        } catch (e) {
            toast.error(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    return (
        <form onSubmit={submit} className="space-y-4 rounded-xl border hairline p-6 bg-white" data-testid="inquiry-form">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="inq-name">Име</Label>
                    <Input id="inq-name" value={form.name} onChange={set("name")} required data-testid="inquiry-name" />
                </div>
                <div>
                    <Label htmlFor="inq-phone">Телефон</Label>
                    <Input id="inq-phone" value={form.phone} onChange={set("phone")} data-testid="inquiry-phone" />
                </div>
            </div>
            <div>
                <Label htmlFor="inq-email">Имейл</Label>
                <Input id="inq-email" type="email" value={form.email} onChange={set("email")} required data-testid="inquiry-email" />
            </div>
            <div>
                <Label htmlFor="inq-msg">Съобщение</Label>
                <Textarea id="inq-msg" value={form.message} onChange={set("message")} rows={4} required data-testid="inquiry-message" />
            </div>
            <Button type="submit" disabled={loading} data-testid="inquiry-submit" className="bg-slate-900 hover:bg-slate-800 text-white">
                {loading ? "Изпращане…" : "Изпрати запитване"}
            </Button>
        </form>
    );
}
