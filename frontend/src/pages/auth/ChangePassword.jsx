import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, formatApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toast } from "sonner";

/**
 * Промяна на парола (forced или доброволна).
 * mode = "client" | "staff" — определя кой endpoint и къде redirect-ваме след успех.
 */
export default function ChangePassword({ mode = "client" }) {
    const [current, setCurrent] = useState("");
    const [pw1, setPw1] = useState("");
    const [pw2, setPw2] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { user, refresh } = useAuth();
    const navigate = useNavigate();
    const isForced = !!user?.must_change_password;

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (pw1.length < 8) { setError("Минимум 8 символа"); return; }
        if (pw1 !== pw2) { setError("Паролите не съвпадат"); return; }
        setLoading(true);
        try {
            const path = mode === "staff"
                ? "/auth/staff/change-password"
                : "/auth/client/change-password";
            await api.post(path, { current_password: current, new_password: pw1 });
            await refresh();
            toast.success("Паролата е сменена");
            navigate(mode === "staff" ? "/admin" : "/portal");
        } catch (e) {
            setError(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto space-y-6">
            <div>
                <div className="overline mb-2">Сигурност</div>
                <h1 className="font-serif text-3xl text-slate-900">
                    {isForced ? "Задайте нова парола" : "Промяна на парола"}
                </h1>
                {isForced && (
                    <p className="text-sm text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2" data-testid="forced-change-banner">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>Задължителна смяна при първи вход — изберете лична парола, преди да продължите.</span>
                    </p>
                )}
            </div>

            <div className="rounded-2xl border hairline bg-white p-6">
                <KeyRound className="h-5 w-5 text-slate-700 mb-4" strokeWidth={1.5} />
                <form onSubmit={submit} className="space-y-4" data-testid="change-password-form">
                    <div>
                        <Label htmlFor="cur">Текуща парола</Label>
                        <Input
                            id="cur"
                            type="password"
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            required
                            data-testid="change-password-current"
                        />
                    </div>
                    <div>
                        <Label htmlFor="np1">Нова парола</Label>
                        <Input
                            id="np1"
                            type="password"
                            value={pw1}
                            onChange={(e) => setPw1(e.target.value)}
                            required
                            minLength={8}
                            data-testid="change-password-new"
                        />
                        <p className="text-xs text-slate-500 mt-1">Минимум 8 символа, поне 1 буква и 1 цифра.</p>
                    </div>
                    <div>
                        <Label htmlFor="np2">Повторете новата парола</Label>
                        <Input
                            id="np2"
                            type="password"
                            value={pw2}
                            onChange={(e) => setPw2(e.target.value)}
                            required
                            minLength={8}
                            data-testid="change-password-confirm"
                        />
                    </div>
                    {error && <div className="text-sm text-red-600" data-testid="change-password-error">{error}</div>}
                    <Button
                        type="submit"
                        disabled={loading}
                        data-testid="change-password-submit"
                        className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        {loading ? "Запазване…" : "Запази паролата"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
