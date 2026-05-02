import React, { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, formatApiError } from "../../lib/api";

/**
 * Универсален "Забравена парола" екран — работи за client и staff чрез проп `mode`.
 */
export default function ForgotPassword({ mode = "client" }) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const path = mode === "staff"
                ? "/auth/staff/forgot-password"
                : "/auth/client/forgot-password";
            await api.post(path, { email });
            setDone(true);
        } catch (e) {
            setError(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    const backTo = mode === "staff" ? "/login/staff" : "/login/client";

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
            <div className="w-full max-w-md bg-white rounded-2xl border hairline p-8">
                {!done ? (
                    <>
                        <KeyRound className="h-6 w-6 text-slate-900 mb-6" strokeWidth={1.5} />
                        <h1 className="font-serif text-3xl text-slate-900 mb-2">Забравена парола</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            Въведете имейла, с който влизате. Нашият екип ще ви изпрати личен линк за смяна.
                        </p>
                        <form onSubmit={submit} className="space-y-4" data-testid="forgot-password-form">
                            <div>
                                <Label htmlFor="email">Имейл</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    data-testid="forgot-password-email"
                                />
                            </div>
                            {error && <div className="text-sm text-red-600">{error}</div>}
                            <Button
                                type="submit"
                                disabled={loading}
                                data-testid="forgot-password-submit"
                                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {loading ? "Изпращане…" : "Изпрати заявка"}
                            </Button>
                        </form>
                    </>
                ) : (
                    <div className="text-center" data-testid="forgot-password-success">
                        <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                        </div>
                        <h2 className="font-serif text-2xl text-slate-900 mb-2">Заявката е приета</h2>
                        <p className="text-sm text-slate-600 mb-6">
                            Свържете се с нашия екип на телефон или WhatsApp, за да получите линк за смяна на паролата.
                            Линкът е валиден 1 час.
                        </p>
                        <Link to={backTo} className="text-sm underline text-slate-900">
                            Обратно към входа
                        </Link>
                    </div>
                )}
                {!done && (
                    <div className="mt-6 text-xs text-slate-500">
                        <Link to={backTo} className="underline text-slate-900">Обратно към входа</Link>
                    </div>
                )}
            </div>
        </div>
    );
}
