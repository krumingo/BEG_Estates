import React from "react";
import {
    AlertTriangle,
    Clock,
    Hourglass,
    MailOpen,
    CheckCircle2,
} from "lucide-react";
import { currency } from "../../lib/api";

/**
 * R.5 Част 4: Списък с алерти от dashboard endpoint-а.
 *
 * Подрежда ги по severity (high → medium → low), цветово кодира.
 * Ако няма алерти → показва "Всичко наред".
 *
 * Props:
 *   alerts: array от { type, severity, title, message, amount?, count? }
 *   isFinanceVisible: bool — ако false, скриваме €  суми в overdue алерта
 *   loading: bool
 */

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

const SEVERITY_STYLES = {
    high: {
        border: "border-red-200",
        bg: "bg-red-50",
        textTitle: "text-red-900",
        textMessage: "text-red-700",
        iconColor: "text-red-600",
    },
    medium: {
        border: "border-amber-200",
        bg: "bg-amber-50",
        textTitle: "text-amber-900",
        textMessage: "text-amber-700",
        iconColor: "text-amber-600",
    },
    low: {
        border: "border-stone-200",
        bg: "bg-stone-50",
        textTitle: "text-slate-900",
        textMessage: "text-slate-600",
        iconColor: "text-slate-500",
    },
};

const TYPE_ICONS = {
    overdue: AlertTriangle,
    expiring_reservations: Hourglass,
    long_standing: Clock,
    new_inquiries: MailOpen,
};

function AlertRow({ alert, isFinanceVisible }) {
    const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low;
    const Icon = TYPE_ICONS[alert.type] || AlertTriangle;
    const showAmount =
        alert.type === "overdue" && isFinanceVisible && (alert.amount || 0) > 0;

    return (
        <div
            className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-start gap-3`}
            data-testid={`alert-${alert.type}`}
        >
            <Icon
                className={`h-5 w-5 ${style.iconColor} shrink-0 mt-0.5`}
                strokeWidth={1.5}
            />
            <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${style.textTitle}`}>
                    {alert.title}
                </div>
                {alert.message && (
                    <div className={`text-xs mt-1 ${style.textMessage}`}>
                        {alert.message}
                    </div>
                )}
            </div>
            {showAmount && (
                <div className={`text-sm font-medium ${style.textTitle} shrink-0`}>
                    {currency(alert.amount)}
                </div>
            )}
        </div>
    );
}

export default function AlertsList({ alerts, isFinanceVisible = true, loading = false }) {
    if (loading) {
        return (
            <div className="space-y-2" data-testid="alerts-skeleton">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-stone-200 bg-white p-4 h-16 animate-pulse"
                    />
                ))}
            </div>
        );
    }

    if (!alerts || alerts.length === 0) {
        return (
            <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3"
                data-testid="alerts-empty"
            >
                <CheckCircle2
                    className="h-5 w-5 text-emerald-600 shrink-0"
                    strokeWidth={1.5}
                />
                <div className="text-sm font-medium text-emerald-900">
                    ✓ Всичко наред — няма проблеми за внимание
                </div>
            </div>
        );
    }

    // Sort by severity (high → medium → low)
    const sorted = [...alerts].sort(
        (a, b) =>
            (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99)
    );

    return (
        <div className="space-y-2" data-testid="alerts-list">
            {sorted.map((alert, idx) => (
                <AlertRow
                    key={`${alert.type}-${idx}`}
                    alert={alert}
                    isFinanceVisible={isFinanceVisible}
                />
            ))}
        </div>
    );
}
