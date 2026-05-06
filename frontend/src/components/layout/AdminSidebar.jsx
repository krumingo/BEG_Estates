import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    Building2,
    Home,
    CalendarClock,
    Users,
    FileText,
    Receipt,
    ClipboardList,
    LogOut,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { ROLE_LABELS } from "../../lib/constants";

const NAV = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, id: "admin-nav-dashboard" },
    { to: "/admin/projects", label: "Проекти", icon: Building2, id: "admin-nav-projects" },
    { to: "/admin/properties", label: "Имоти", icon: Home, id: "admin-nav-properties" },
    { to: "/admin/reservations", label: "Резервации & Запитвания", icon: CalendarClock, id: "admin-nav-reservations" },
    { to: "/admin/quotes", label: "Оферти", icon: FileText, id: "admin-nav-quotes" },
    { to: "/admin/clients", label: "Клиенти", icon: Users, id: "admin-nav-clients" },
    { to: "/admin/audit", label: "Audit log", icon: ClipboardList, id: "admin-nav-audit" },
];

export default function AdminSidebar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    return (
        <aside
            data-testid="admin-sidebar"
            className="hidden lg:flex fixed top-0 left-0 h-full w-64 flex-col border-r hairline bg-white z-40"
        >
            <div className="px-6 py-6 border-b hairline">
                <Link to="/admin" className="block" data-testid="admin-sidebar-brand">
                    <img
                        src="/logos/beg_estates_admin.svg"
                        alt="BEG Estates · EstateFlow Admin"
                        className="h-12 w-auto"
                        data-testid="admin-sidebar-logo"
                    />
                </Link>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`
                        }
                    >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                        {label}
                    </NavLink>
                ))}
            </nav>

            <div className="border-t hairline px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold">
                        {user?.name?.charAt(0) || "A"}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{user?.name}</div>
                        <div className="text-xs text-slate-500 truncate">
                            {ROLE_LABELS[user?.role] || user?.role}
                        </div>
                    </div>
                </div>
                <button
                    data-testid="admin-logout"
                    onClick={async () => {
                        await logout();
                        navigate("/");
                    }}
                    className="flex items-center gap-2 w-full text-sm text-slate-600 hover:text-slate-900"
                >
                    <LogOut className="h-4 w-4" strokeWidth={1.75} /> Изход
                </button>
            </div>
        </aside>
    );
}
