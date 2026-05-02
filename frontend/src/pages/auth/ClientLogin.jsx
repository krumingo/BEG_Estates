import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, formatApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toast } from "sonner";

export default function ClientLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { refresh } = useAuth();
    const navigate = useNavigate();
    const [search] = useSearchParams();
    const next = search.get("next") || "/portal";

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/auth/client/login", { email, password });
            await refresh();
            if (data.must_change_password) {
                toast.message("Първи вход — моля, задайте нова парола.");
                navigate("/portal/change-password");
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
            <div className="flex items-center justify-center p-8 lg:p-16 order-2 lg:order-1 bg-stone-50">
                <div className="w-full max-w-md">
                    <Mail className="h-6 w-6 text-slate-900 mb-6" strokeWidth={1.5} />
                    <h1 className="font-serif text-4xl text-slate-900 mb-2">Клиентски вход</h1>
                    <p className="text-sm text-slate-500 mb-8">
                        Влезте с вашия имейл и парола, получени от екипа на BEG Estates.
                    </p>

                    <form onSubmit={submit} className="space-y-4" data-testid="client-login-form">
                        <div>
                            <Label htmlFor="email">Имейл</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                data-testid="client-email"
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
                                data-testid="client-password"
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-red-600" data-testid="client-login-error">
                                {error}
                            </div>
                        )}
                        <Button
                            type="submit"
                            disabled={loading}
                            data-testid="client-login-submit"
                            className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                        >
                            {loading ? "Влизане…" : "Вход"}
                        </Button>
                    </form>

                    <div className="mt-6 text-sm">
                        <Link to="/forgot-password" className="text-slate-700 underline" data-testid="client-forgot-password-link">
                            Забравена парола?
                        </Link>
                    </div>

                    <div className="mt-8 text-xs text-slate-500">
                        Служител? <Link to="/login/staff" className="underline text-slate-900">Вход за екипа</Link>
                    </div>
                </div>
            </div>
            <div className="hidden lg:block relative overflow-hidden order-1 lg:order-2">
                <img
                    src="https://images.unsplash.com/photo-1758448511320-05d7d28f4298?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-bl from-black/50 via-black/10 to-black/60" />
                <div className="relative z-10 p-12 h-full flex flex-col justify-end text-white">
                    <div className="overline text-white/60 mb-2">Клиентски портал</div>
                    <div className="font-serif text-4xl leading-tight max-w-md">
                        Вашият имот. Вашите плащания. Без изненади.
                    </div>
                </div>
            </div>
        </div>
    );
}
