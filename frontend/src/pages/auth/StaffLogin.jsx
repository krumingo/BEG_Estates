import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, formatApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function StaffLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { refresh } = useAuth();
    const navigate = useNavigate();
    const [search] = useSearchParams();
    const next = search.get("next") || "/admin";

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/auth/staff/login", { email, password });
            await refresh();
            if (data.must_change_password) {
                navigate("/admin/change-password");
            } else {
                navigate(next);
            }
        } catch (e) {
            setError(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white">
            <div className="hidden lg:block relative overflow-hidden">
                <img
                    src="https://images.pexels.com/photos/16110999/pexels-photo-16110999.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=900"
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-black/70" />
                <div className="relative z-10 p-12 h-full flex flex-col justify-between text-white">
                    <Link to="/" className="font-serif text-3xl">BEG Estates</Link>
                    <div>
                        <div className="overline text-white/60 mb-2">EstateFlow Backoffice</div>
                        <div className="font-serif text-4xl leading-tight max-w-md">
                            Контрол върху всеки детайл от вашия проект.
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-center p-8 lg:p-16 bg-stone-50">
                <div className="w-full max-w-md">
                    <Lock className="h-6 w-6 text-slate-900 mb-6" strokeWidth={1.5} />
                    <h1 className="font-serif text-4xl text-slate-900 mb-2">Вход за екипа</h1>
                    <p className="text-sm text-slate-500 mb-8">
                        Въведете служебния си имейл и парола.
                    </p>

                    <form onSubmit={submit} className="space-y-4" data-testid="staff-login-form">
                        <div>
                            <Label htmlFor="email">Имейл</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                                data-testid="staff-email"
                            />
                        </div>
                        <div>
                            <Label htmlFor="password">Парола</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                data-testid="staff-password"
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-red-600" data-testid="staff-login-error">
                                {error}
                            </div>
                        )}
                        <Button
                            type="submit"
                            disabled={loading}
                            data-testid="staff-login-submit"
                            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {loading ? "Влизане…" : "Влез"}
                        </Button>
                    </form>

                    <div className="mt-6 text-sm">
                        <Link
                            to="/staff/forgot-password"
                            className="text-slate-700 underline"
                            data-testid="staff-forgot-password-link"
                        >
                            Забравена парола?
                        </Link>
                    </div>

                    <div className="mt-8 text-xs text-slate-500 space-y-1">
                        <div>
                            Клиент?{" "}
                            <Link to="/login/client" className="underline text-slate-900">
                                Клиентски вход
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
