import React from "react";
import { PROPERTY_STATUS } from "../../lib/constants";

export function StatusBadge({ status, className = "" }) {
    const key = status || "available";
    const s = PROPERTY_STATUS[key] || PROPERTY_STATUS.available;
    if (!s) return null;
    return (
        <span
            data-testid={`status-badge-${key}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text} ${s.border} ${className}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}
