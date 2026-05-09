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
        return <Navigate to="/login/staff" replace />;
    }
    if (allow === "staff" && !STAFF_ROLES.has(user.role)) {
        return <Navigate to="/" replace />;
    }
    return children;
}
