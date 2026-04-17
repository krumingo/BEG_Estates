import React from "react";
import { PROPERTY_STATUS } from "../../lib/constants";

export function StatusBadge({ status, className = "" }) {
    const s = PROPERTY_STATUS[status] || PROPERTY_STATUS.свободен;
    return (
        <span
            data-testid={`status-badge-${status}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text} ${s.border} ${className}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}
