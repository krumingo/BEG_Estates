import React, { useEffect, useRef, useState } from "react";
import { Input } from "../ui/input";

/**
 * Helpers
 */
export function calculateWithVat(amount, vatRate = 20) {
    if (amount == null || amount === "" || isNaN(amount)) return null;
    const a = Number(amount);
    if (!a) return null;
    return Math.round(a * (1 + Number(vatRate) / 100) * 100) / 100;
}

export function calculatePricePerSqm(listPrice, area) {
    if (!listPrice || !area) return null;
    const a = Number(area);
    if (!a) return null;
    return Math.round((Number(listPrice) / a) * 100) / 100;
}

function formatPpm(value) {
    if (value == null || value === "") return "";
    const n = Number(value);
    if (isNaN(n)) return "";
    return new Intl.NumberFormat("bg-BG", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(n);
}

/**
 * InlinePriceCell — Excel-style редакция на цена/м².
 * При промяна изчислява нов list_price = ppm * area и извиква onSave(ppm, list_price).
 */
export const InlinePriceCell = ({
    value,
    area,
    onSave,
    testId,
    disabled = false,
    vatRate = 20, // запазено за бъдещо ползване (tooltip)
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const startEdit = () => {
        if (disabled) return;
        setDraft(value != null ? String(value) : "");
        setEditing(true);
    };

    const commit = async () => {
        if (saving) return;
        const trimmed = (draft || "").toString().replace(",", ".").trim();
        const newPpm = trimmed === "" ? null : Number(trimmed);
        if (trimmed !== "" && (isNaN(newPpm) || newPpm < 0)) {
            setEditing(false);
            return;
        }
        const oldPpm = value != null ? Number(value) : null;
        if (newPpm === oldPpm) {
            setEditing(false);
            return;
        }
        const newListPrice =
            newPpm != null && area
                ? Math.round(newPpm * Number(area) * 100) / 100
                : null;
        try {
            setSaving(true);
            await onSave(newPpm, newListPrice);
            setEditing(false);
        } catch (e) {
            // toast handled in parent
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => {
        setDraft(value != null ? String(value) : "");
        setEditing(false);
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            commit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
        }
    };

    if (editing) {
        return (
            <Input
                ref={inputRef}
                type="number"
                step="0.01"
                min="0"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={commit}
                disabled={saving}
                className="h-8 w-24 text-right tabular-nums px-2"
                data-testid={testId ? `${testId}-input` : undefined}
            />
        );
    }

    return (
        <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            data-testid={testId}
            title={
                disabled
                    ? "Нужна е площ F1+F2 за редакция"
                    : "Кликни за редакция"
            }
            className={`tabular-nums px-2 py-1 rounded transition ${
                disabled
                    ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-900 hover:bg-stone-100 cursor-pointer"
            }`}
        >
            {value != null ? `${formatPpm(value)} €/м²` : "—"}
        </button>
    );
};

export default InlinePriceCell;
