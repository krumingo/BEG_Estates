import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, formatApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function StaffLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [step, setStep] = useState(1); // 1=password, 2=totp
    const [tempToken, setTempToken] = useState("");
    const [code, setCode] = useState("");
    const [setupRequired, setSetupRequired] = useState(false);
    const [setupData, setSetupData] = useState(null); // {secret, uri}
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { refresh } = useAuth();
    const navigate = useNavigate();
    const [search] = useSearchParams();
    const next = search.get("next") || "/admin";

    const submitPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/auth/staff/login", { email, password });
            setTempToken(data.temp_token);
            setSetupRequired(!!data.totp_setup_required);
            setStep(2);
            if (data.totp_setup_required) {
                // bootstrap TOTP secret
                const setup = await api.post("/auth/staff/setup-totp", { temp_token: data.temp_token, code: "" });
                setSetupData(setup.data);
            }
        } catch (e) {
            setError(formatApiError(e.response?.data?.detail));
        } finally {
            setLoading(false);
        }
    };

    const submitTotp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/auth/staff/verify-totp", { temp_token: tempToken, code });
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

    const otpauthUri = setupData?.uri || "";
    const qrSrc = otpauthUri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUri)}`
        : "";

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
                    {step === 1 && (
                        <>
                            <Lock className="h-6 w-6 text-slate-900 mb-6" strokeWidth={1.5} />
                            <h1 className="font-serif text-4xl text-slate-900 mb-2">Вход за екипа</h1>
                            <p className="text-sm text-slate-500 mb-8">Стъпка 1 от 2 — служебен имейл и парола.</p>

                            <form onSubmit={submitPassword} className="space-y-4" data-testid="staff-login-form">
                                <div>
                                    <Label htmlFor="email">Имейл</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
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
                                    {loading ? "Проверка…" : "Продължи"}
                                </Button>
                            </form>

                            <div className="mt-6 text-sm">
                                <Link to="/staff/forgot-password" className="text-slate-700 underline" data-testid="staff-forgot-password-link">
                                    Забравена парола?
                                </Link>
                            </div>

                            <div className="mt-8 text-xs text-slate-500 space-y-1">
                                <div>Клиент? <Link to="/login/client" className="underline text-slate-900">Клиентски вход</Link></div>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <ShieldCheck className="h-6 w-6 text-slate-900 mb-6" strokeWidth={1.5} />
                            <h1 className="font-serif text-4xl text-slate-900 mb-2">Двуфакторна автентикация</h1>
                            <p className="text-sm text-slate-500 mb-6">Стъпка 2 от 2 — въведете 6-цифрения код от вашето authenticator приложение.</p>

                            {setupRequired && setupData && (
                                <div className="rounded-lg border hairline bg-amber-50 p-4 mb-5 space-y-3" data-testid="staff-totp-setup">
                                    <div className="text-sm font-medium text-amber-900">
                                        Първи вход — настройте 2FA сега
                                    </div>
                                    <ol className="text-xs text-amber-900 space-y-1 list-decimal pl-5">
                                        <li>Сканирайте QR кода с Google Authenticator или Authy.</li>
                                        <li>Въведете 6-цифрения код, който приложението показва.</li>
                                        <li>Запазете тайния ключ на сигурно място.</li>
                                    </ol>
                                    {qrSrc && (
                                        <div className="flex items-start gap-3">
                                            <img
                                                src={qrSrc}
                                                alt="QR код за TOTP"
                                                width={150}
                                                height={150}
                                                className="rounded bg-white border hairline"
                                                data-testid="staff-totp-qr"
                                            />
                                            <div className="text-xs space-y-1.5">
                                                <div className="text-amber-900">Таен ключ (резервно):</div>
                                                <div className="font-mono bg-white px-2 py-1 rounded border text-slate-900 break-all" data-testid="staff-totp-secret">
                                                    {setupData.secret}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <form onSubmit={submitTotp} className="space-y-4" data-testid="staff-totp-form">
                                <div>
                                    <Label htmlFor="totp-code">6-цифрен код</Label>
                                    <Input
                                        id="totp-code"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                                        required
                                        autoFocus
                                        inputMode="numeric"
                                        placeholder="123456"
                                        data-testid="staff-totp-code"
                                        className="font-mono text-lg tracking-widest"
                                    />
                                </div>
                                {error && (
                                    <div className="text-sm text-red-600" data-testid="staff-totp-error">
                                        {error}
                                    </div>
                                )}
                                <Button
                                    type="submit"
                                    disabled={loading || code.length !== 6}
                                    data-testid="staff-totp-submit"
                                    className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white"
                                >
                                    {loading ? "Проверка…" : "Влез"}
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => { setStep(1); setCode(""); setError(""); }}
                                    className="text-xs text-slate-500 underline"
                                    data-testid="staff-totp-back"
                                >
                                    Върни се
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
