import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, formatApiError } from "../../lib/api";

/**
 * Reset password (от линк, който admin дава на клиента / служителя).
 * URL: /reset-password?token=...&role=client|admin|sales|...
 */
export default function ResetPassword() {
    const [search] = useSearchParams();
    const token = search.get("token") || "";
    const role = (search.get("role") || "client").toLowerCase();
    const isStaff = role !== "client";

    const [pw1, setPw1] = useState("");
    const [pw2, setPw2] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (pw1.length < 8) {
            setError("Паролата трябва да е поне 8 символа");
            return;
        }
        if (pw1 !== pw2) {
            setError("Паролите не съвпадат");
            return;
        }
        setLoading(true);
        try {
            const path = isStaff ? "/auth/staff/reset-password" : "/auth/client/reset-password";
            await api.post(path, { token, new_password: pw1 });
            setDone(true);
            setTimeout(() => navigate(isStaff ? "/login/staff" : "/login/client"), 2500);
        } catch (e) {
            setError(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
                <div className="w-full max-w-md bg-white rounded-2xl border hairline p-8 text-center" data-testid="reset-password-invalid">
                    <h1 className="font-serif text-2xl text-slate-900 mb-2">Невалиден линк</h1>
                    <p className="text-sm text-slate-500 mb-6">Линкът липсва или е повреден. Моля, поискайте нов.</p>
                    <Link to="/login/client" className="text-sm underline text-slate-900">Обратно към входа</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
            <div className="w-full max-w-md bg-white rounded-2xl border hairline p-8">
                {!done ? (
                    <>
                        <ShieldCheck className="h-6 w-6 text-slate-900 mb-6" strokeWidth={1.5} />
                        <h1 className="font-serif text-3xl text-slate-900 mb-2">Нова парола</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            Минимум 8 символа, поне 1 буква и 1 цифра.
                        </p>
                        <form onSubmit={submit} className="space-y-4" data-testid="reset-password-form">
                            <div>
                                <Label htmlFor="pw1">Нова парола</Label>
                                <Input
                                    id="pw1"
                                    type="password"
                                    value={pw1}
                                    onChange={(e) => setPw1(e.target.value)}
                                    required
                                    minLength={8}
                                    data-testid="reset-password-new"
                                />
                            </div>
                            <div>
                                <Label htmlFor="pw2">Повторете паролата</Label>
                                <Input
                                    id="pw2"
                                    type="password"
                                    value={pw2}
                                    onChange={(e) => setPw2(e.target.value)}
                                    required
                                    minLength={8}
                                    data-testid="reset-password-confirm"
                                />
                            </div>
                            {error && <div className="text-sm text-red-600" data-testid="reset-password-error">{error}</div>}
                            <Button
                                type="submit"
                                disabled={loading}
                                data-testid="reset-password-submit"
                                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {loading ? "Запазване…" : "Запази парола"}
                            </Button>
                        </form>
                    </>
                ) : (
                    <div className="text-center" data-testid="reset-password-success">
                        <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                        </div>
                        <h2 className="font-serif text-2xl text-slate-900 mb-2">Готово</h2>
                        <p className="text-sm text-slate-600">Паролата ви е сменена. Пренасочваме ви към входа…</p>
                    </div>
                )}
            </div>
        </div>
    );
}
