// Deal validation + calculation helpers (G.2.1 — bank_loan / own_funds terminology)

export const DEAL_STATUS_LABELS = {
    active: "Активна",
    completed: "Завършена",
    cancelled: "Отказана",
};

export const DEAL_STATUS_BADGE = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    completed: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

export const PAYMENT_MODE_LABELS = {
    bank_loan: "Банков кредит",
    own_funds: "Лични средства",
    combined: "Комбиниран",
};

export const SCHEME_PRESETS = {
    standard: "Стандартна (лични средства) — 8 етапа",
    with_bank: "С банков кредит — 4 етапа (10/10/10/70)",
    custom: "Празна (admin pополва)",
};

export function round2(v) {
    return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

export function calculateVatSplit(totalWithVat, vatRate = 20) {
    const total = Number(totalWithVat) || 0;
    const rate = Number(vatRate) || 0;
    if (rate <= 0) return { net: total, vat: 0 };
    const net = total / (1 + rate / 100);
    return { net: round2(net), vat: round2(total - net) };
}

export function sumStagesAmount(stages) {
    return round2((stages || []).reduce((acc, s) => acc + (Number(s?.amount) || 0), 0));
}

export function sumStagesPercent(stages) {
    return round2((stages || []).reduce((acc, s) => acc + (Number(s?.percent) || 0), 0));
}

export function sumPaidAmount(stages) {
    return round2(
        (stages || [])
            .filter((s) => s?.is_paid)
            .reduce((acc, s) => acc + (Number(s?.paid_amount) || Number(s?.amount) || 0), 0),
    );
}

/** Returns the "basis" for a bucket — the amount that all stages in that bucket should sum to. */
export function bucketBasis(deal, bucket) {
    const pm = deal?.payment_mode || {};
    const total = Number(deal?.total_with_vat) || 0;
    if (bucket === "bank") {
        if (pm.mode === "bank_loan") return total;
        if (pm.mode === "combined") return Number(pm.bank_amount) || 0;
        return 0;
    }
    // own
    if (pm.mode === "own_funds") return total;
    if (pm.mode === "combined") return Number(pm.own_amount) || 0;
    return 0;
}

export function isBucketVisible(deal, bucket) {
    return bucketBasis(deal, bucket) > 0;
}

/**
 * Returns warnings/errors for the current payment_mode breakdown.
 * Both invoice/proforma splits (bank + own) are now validated.
 */
export function validatePaymentMode(mode, total, breakdown) {
    const errors = [];
    const tol = 0.01;
    const t = Number(total) || 0;
    const bank = Number(breakdown?.bank_amount) || 0;
    const own = Number(breakdown?.own_amount) || 0;
    const bInv = Number(breakdown?.bank_invoice_amount) || 0;
    const bPro = Number(breakdown?.bank_proforma_amount) || 0;
    const oInv = Number(breakdown?.own_invoice_amount) || 0;
    const oPro = Number(breakdown?.own_proforma_amount) || 0;

    if (mode === "bank_loan") {
        if (Math.abs(bInv + bPro - t) > tol) {
            errors.push(`Фактура + Проформа = ${round2(bInv + bPro)}€ ≠ обща сума ${round2(t)}€`);
        }
    } else if (mode === "own_funds") {
        if (Math.abs(oInv + oPro - t) > tol) {
            errors.push(`Фактура + Проформа = ${round2(oInv + oPro)}€ ≠ обща сума ${round2(t)}€`);
        }
    } else if (mode === "combined") {
        if (Math.abs(bank + own - t) > tol) {
            errors.push(`Банков кредит + Лични средства = ${round2(bank + own)}€ ≠ обща сума ${round2(t)}€`);
        }
        if (bank > 0 && Math.abs(bInv + bPro - bank) > tol) {
            errors.push(`Банков кредит: Фактура + Проформа = ${round2(bInv + bPro)}€ ≠ ${round2(bank)}€`);
        }
        if (own > 0 && Math.abs(oInv + oPro - own) > tol) {
            errors.push(`Лични средства: Фактура + Проформа = ${round2(oInv + oPro)}€ ≠ ${round2(own)}€`);
        }
    }
    if (bank < 0 || own < 0 || bInv < 0 || bPro < 0 || oInv < 0 || oPro < 0) {
        errors.push("Сумите не могат да са отрицателни");
    }
    return { valid: errors.length === 0, errors };
}

export function validateScheduleSum(stages, basis) {
    if (!stages || stages.length === 0) return { valid: true, sum: 0, warning: null };
    const sum = sumStagesAmount(stages);
    if (basis == null || basis <= 0) return { valid: true, sum, warning: null };
    const isValid = Math.abs(sum - basis) < 0.05;
    return {
        valid: isValid,
        sum,
        warning: isValid ? null : `Сума на етапите = ${round2(sum)}€ (трябва ${round2(basis)}€)`,
    };
}

/**
 * Local auto-suggest: when a single field changes, returns a new breakdown
 * with related fields auto-filled (so admin doesn't have to compute the rest).
 *
 * Mirrors the server-side logic in POST /api/deals/{id}/suggest-distribution.
 */
export function suggestDistribution(mode, total, breakdown, changedField, newValue) {
    const next = { ...breakdown, [changedField]: Number(newValue) || 0 };
    const t = Number(total) || 0;
    const maxz = (x) => round2(Math.max(0, x));

    if (mode === "combined") {
        if (changedField === "bank_amount") {
            next.own_amount = maxz(t - newValue);
        } else if (changedField === "own_amount") {
            next.bank_amount = maxz(t - newValue);
        } else if (changedField === "bank_invoice_amount") {
            next.bank_proforma_amount = maxz((Number(next.bank_amount) || 0) - newValue);
        } else if (changedField === "bank_proforma_amount") {
            next.bank_invoice_amount = maxz((Number(next.bank_amount) || 0) - newValue);
        } else if (changedField === "own_invoice_amount") {
            next.own_proforma_amount = maxz((Number(next.own_amount) || 0) - newValue);
        } else if (changedField === "own_proforma_amount") {
            next.own_invoice_amount = maxz((Number(next.own_amount) || 0) - newValue);
        }
    } else if (mode === "bank_loan") {
        if (changedField === "bank_invoice_amount") {
            next.bank_proforma_amount = maxz(t - newValue);
        } else if (changedField === "bank_proforma_amount") {
            next.bank_invoice_amount = maxz(t - newValue);
        }
    } else if (mode === "own_funds") {
        if (changedField === "own_invoice_amount") {
            next.own_proforma_amount = maxz(t - newValue);
        } else if (changedField === "own_proforma_amount") {
            next.own_invoice_amount = maxz(t - newValue);
        }
    }
    return next;
}

/**
 * Build a default breakdown when payment_mode changes,
 * routing the entire `total` into the bucket the new mode requires.
 */
export function defaultBreakdownForMode(mode, total) {
    const t = round2(Number(total) || 0);
    const empty = {
        bank_amount: 0, own_amount: 0,
        bank_invoice_amount: 0, bank_proforma_amount: 0,
        own_invoice_amount: 0, own_proforma_amount: 0,
    };
    if (mode === "bank_loan") {
        return { ...empty, bank_amount: t, bank_invoice_amount: t };
    }
    if (mode === "own_funds") {
        return { ...empty, own_amount: t, own_invoice_amount: t };
    }
    // combined — split 50/50, all invoice
    const half = round2(t / 2);
    const other = round2(t - half);
    return {
        ...empty,
        bank_amount: half, bank_invoice_amount: half,
        own_amount: other, own_invoice_amount: other,
    };
}

/** Recompute amounts for a list of stages by keeping percent and applying new basis. */
export function rescaleStagesByBasis(stages, basis) {
    return (stages || []).map((s) => ({
        ...s,
        amount: round2((Number(s.percent) || 0) * (Number(basis) || 0) / 100),
    }));
}

/** Recompute percent for a list of stages from amount (when basis is known). */
export function recomputeStagePercents(stages, basis) {
    if (!basis || basis <= 0) return stages || [];
    return (stages || []).map((s) => ({
        ...s,
        percent: round2((Number(s.amount) || 0) * 100 / basis),
    }));
}
