import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// Авто-refresh на access_token при 401.
// Не refresh-ваме за самите auth ендпойнти (за да няма безкраен цикъл).
let refreshPromise = null;
const isAuthEndpoint = (url = "") =>
    url.includes("/auth/refresh") ||
    url.includes("/auth/staff/login") ||
    url.includes("/auth/staff/verify-totp") ||
    url.includes("/auth/staff/setup-totp") ||
    url.includes("/auth/client/login") ||
    url.includes("/auth/client/forgot-password") ||
    url.includes("/auth/client/reset-password") ||
    url.includes("/auth/staff/forgot-password") ||
    url.includes("/auth/staff/reset-password") ||
    url.includes("/auth/logout");

api.interceptors.response.use(
    (r) => r,
    async (error) => {
        const original = error.config;
        const status = error.response?.status;
        if (status !== 401 || !original || original._retried || isAuthEndpoint(original.url || "")) {
            return Promise.reject(error);
        }
        original._retried = true;
        try {
            if (!refreshPromise) {
                refreshPromise = api.post("/auth/refresh").finally(() => {
                    refreshPromise = null;
                });
            }
            await refreshPromise;
            return api(original);
        } catch (e) {
            return Promise.reject(error);
        }
    }
);

export function formatApiError(detail) {
    if (detail == null) return "Нещо се обърка. Опитайте отново.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
            .filter(Boolean)
            .join(" ");
    }
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export const currency = (amount, cur = "EUR") => {
    if (amount == null) return "—";
    return new Intl.NumberFormat("bg-BG", {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 0,
    }).format(amount);
};

export const formatDate = (iso) => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("bg-BG", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return iso;
    }
};

export const daysRemaining = (iso) => {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
