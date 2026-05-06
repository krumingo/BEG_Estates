import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null=unknown, false=anon, object=logged
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
        } catch {
            setUser(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const logout = async () => {
        await api.post("/auth/logout");
        setUser(false);
    };

    return (
        <AuthContext.Provider value={{ user, setUser, loading, refresh, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

export const useIsSuperAdmin = () => {
    const { user } = useContext(AuthContext) || {};
    return user && user !== false && user.role === "super_admin";
};

export const STAFF_ROLES = new Set([
    "super_admin",
    "admin",
    "sales",
    "accounting",
    "project_manager",
    "broker",
]);
