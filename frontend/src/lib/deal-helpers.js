// Deal validation + calculation helpers (G.2)

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
    with_bank: "С банка",
    without_bank: "Без банка",
    combined: "Комбиниран",
};

export const SCHEME_PRESETS = {
    standard: "Стандартна (без банка) — 8 етапа",
    with_bank: "С банков кредит — 4 етапа (10/10/10/70)",
    custom: "Празна (admin pополва)",
};

export function calculateVatSplit(totalWithVat, vatRate = 20) {
    const total = Number(totalWithVat) || 0;
    const rate = Number(vatRate) || 0;
    if (rate <= 0) return { net: total, vat: 0 };
    const net = total / (1 + rate / 100);
    return { net: round2(net), vat: round2(total - net) };
}

export function round2(v) {
    return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
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

export function validatePaymentMode(mode, total, breakdown) {
    const errors = [];
    const warnings = [];
    const tol = 0.01;
    const t = Number(total) || 0;
    const bank = Number(breakdown?.bank_amount) || 0;
    const nonBank = Number(breakdown?.non_bank_amount) || 0;
    const invoice = Number(breakdown?.invoice_amount) || 0;
    const proforma = Number(breakdown?.proforma_amount) || 0;

    if (mode === "with_bank") {
        // entire amount via bank/invoice — no special checks needed beyond non-negative
    } else if (mode === "without_bank") {
        const sum = invoice + proforma;
        if (Math.abs(sum - t) > tol) {
            errors.push(`Фактура + проформа = ${round2(sum)}€ ≠ общо ${round2(t)}€`);
        }
    } else if (mode === "combined") {
        if (Math.abs(bank + nonBank - t) > tol) {
            errors.push(`По банка + без банка = ${round2(bank + nonBank)}€ ≠ общо ${round2(t)}€`);
        }
        if (Math.abs(invoice + proforma - nonBank) > tol) {
            errors.push(`Фактура + проформа = ${round2(invoice + proforma)}€ ≠ без банка ${round2(nonBank)}€`);
        }
    }
    if (bank < 0 || nonBank < 0 || invoice < 0 || proforma < 0) {
        errors.push("Сумите не могат да са отрицателни");
    }
    return { valid: errors.length === 0, errors, warnings };
}

export function validateScheduleSum(stages) {
    if (!stages || stages.length === 0) return { valid: true, sumPercent: 0, warning: null };
    const sumPercent = sumStagesPercent(stages);
    const isValid = Math.abs(sumPercent - 100) < 0.05;
    return {
        valid: isValid,
        sumPercent,
        warning: isValid ? null : `Сума на проценти = ${sumPercent.toFixed(1)}% (трябва 100%)`,
    };
}

export function bucketBasis(deal, bucket) {
    const pm = deal?.payment_mode || {};
    const total = Number(deal?.total_with_vat) || 0;
    if (bucket === "bank") {
        if (pm.mode === "with_bank") return total;
        if (pm.mode === "combined") return Number(pm.bank_amount) || 0;
        return 0;
    }
    if (pm.mode === "without_bank") return total;
    if (pm.mode === "combined") return Number(pm.non_bank_amount) || 0;
    return 0;
}

export function isBucketVisible(deal, bucket) {
    return bucketBasis(deal, bucket) > 0;
}
