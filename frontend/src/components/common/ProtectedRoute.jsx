import React from "react";
import { Navigate } from "react-router-dom";
import { STAFF_ROLES, useAuth } from "../../lib/auth";

export function ProtectedRoute({ children, allow }) {
    const { user, loading } = useAuth();
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
    return children;
}
