import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Home, CalendarClock, Wallet, FileText, LogOut, Newspaper, User, MessageSquare } from "lucide-react";
import { useAuth } from "../../lib/auth";

const NAV = [
    { to: "/portal", label: "Моите имоти", icon: Home, end: true, id: "client-nav-home" },
    { to: "/portal/reservations", label: "Резервации", icon: CalendarClock, id: "client-nav-reservations" },
    { to: "/portal/payments", label: "Плащания", icon: Wallet, id: "client-nav-payments" },
    { to: "/portal/documents", label: "Документи", icon: FileText, id: "client-nav-documents" },
    { to: "/portal/updates", label: "Прогрес по проекта", icon: Newspaper, id: "client-nav-updates" },
    { to: "/portal/messages", label: "Кореспонденция", icon: MessageSquare, id: "client-nav-messages" },
    { to: "/portal/profile", label: "Профил", icon: User, id: "client-nav-profile" },
];

export default function ClientSidebar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    return (
        <aside
            data-testid="client-sidebar"
            className="hidden lg:flex fixed top-0 left-0 h-full w-64 flex-col border-r hairline bg-stone-50 z-40"
        >
            <div className="px-6 py-6 border-b hairline">
                <Link to="/portal" className="flex flex-col gap-0.5">
                    <span className="font-serif text-2xl text-slate-900 leading-none">BEG Estates</span>
                    <span className="overline">Клиентски портал</span>
                </Link>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {NAV.map(({ to, label, icon: Icon, end, id }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        data-testid={id}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition ${
                                isActive
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                            }`
                        }
                    >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                        {label}
                    </NavLink>
                ))}
            </nav>
            <div className="border-t hairline px-4 py-4">
                <div className="text-sm font-medium text-slate-900 truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 truncate mb-3">{user?.email}</div>
                <button
                    data-testid="client-logout"
                    onClick={async () => {
                        await logout();
                        navigate("/");
                    }}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
                >
                    <LogOut className="h-4 w-4" strokeWidth={1.75} /> Изход
                </button>
            </div>
        </aside>
    );
}
