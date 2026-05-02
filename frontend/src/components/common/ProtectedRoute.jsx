import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { STAFF_ROLES, useAuth } from "../../lib/auth";

export function ProtectedRoute({ children, allow }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-slate-500">
                Зареждане…
            </div>
        );
    }
    if (!user) {
        const target = allow === "client" ? "/login/client" : "/login/staff";
        return <Navigate to={target} replace />;
    }
    if (allow === "staff" && !STAFF_ROLES.has(user.role)) {
        return <Navigate to="/portal" replace />;
    }
    if (allow === "client" && user.role !== "client") {
        return <Navigate to="/admin" replace />;
    }
    // Forced password change — redirect-ваме всички вътрешни pages, освен самата страница за смяна.
    const isClientChange = location.pathname === "/portal/change-password";
    const isStaffChange = location.pathname === "/admin/change-password";
    if (user.must_change_password && !isClientChange && !isStaffChange) {
        return (
            <Navigate
                to={allow === "client" ? "/portal/change-password" : "/admin/change-password"}
                replace
            />
        );
    }
    return children;
}
