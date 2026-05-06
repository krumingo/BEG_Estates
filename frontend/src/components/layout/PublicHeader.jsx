import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/button";

export default function PublicHeader({ dark = false }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const link = (to, label, testId) => (
        <NavLink
            key={to}
            to={to}
            end
            data-testid={testId}
            className={({ isActive }) =>
                `text-sm font-medium transition-opacity hover:opacity-100 ${
                    dark ? "text-white/80 hover:text-white" : "text-slate-700 hover:text-slate-900"
                } ${isActive ? "opacity-100" : "opacity-80"}`
            }
        >
            {label}
        </NavLink>
    );

    return (
        <header
            data-testid="public-header"
            className={`fixed top-0 inset-x-0 z-50 ${dark ? "glass-header-dark" : "glass-header"}`}
        >
            <div className="mx-auto max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
                <Link to="/" data-testid="brand-link" className="flex items-center">
                    <img
                        src={dark ? "/logos/beg_estates_dark.svg" : "/logos/beg_estates_main.svg"}
                        alt="BEG Estates"
                        className="h-9 w-auto"
                        data-testid="public-header-logo"
                    />
                </Link>

                <nav className="hidden md:flex items-center gap-8">
                    {link("/", "Начало", "nav-home")}
                    {link("/projects", "Проекти", "nav-projects")}
                    {link("/contact", "Контакт", "nav-contact")}
                </nav>

                <div className="flex items-center gap-2">
                    {user && user.role === "client" && (
                        <Button
                            size="sm"
                            variant={dark ? "secondary" : "outline"}
                            onClick={() => navigate("/portal")}
                            data-testid="header-goto-portal"
                        >
                            Моят портал
                        </Button>
                    )}
                    {user && user.role !== "client" && (
                        <Button
                            size="sm"
                            variant={dark ? "secondary" : "outline"}
                            onClick={() => navigate("/admin")}
                            data-testid="header-goto-admin"
                        >
                            Админ панел
                        </Button>
                    )}
                    {user ? (
                        <Button size="sm" variant="ghost" onClick={async () => { await logout(); navigate("/"); }} data-testid="header-logout">
                            Изход
                        </Button>
                    ) : (
                        <>
                            <Button size="sm" variant="ghost" onClick={() => navigate("/login/client")} data-testid="header-client-login">
                                Клиент
                            </Button>
                            <Button
                                size="sm"
                                className="bg-[#0A0A0A] text-white hover:bg-slate-800"
                                onClick={() => navigate("/login/staff")}
                                data-testid="header-staff-login"
                            >
                                Вход за екипа
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
