// Property status → badge styling + BG label (english keys)
export const PROPERTY_STATUS = {
    available: {
        label: "Свободен",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        dot: "bg-emerald-500",
    },
    reserved_zero_deposit: {
        label: "Резервиран · Капаро 0",
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        dot: "bg-amber-500",
    },
    reserved_paid_deposit: {
        label: "Резервиран · Капаро",
        bg: "bg-orange-50",
        text: "text-orange-700",
        border: "border-orange-200",
        dot: "bg-orange-500",
    },
    sold: {
        label: "Продаден",
        bg: "bg-slate-800",
        text: "text-white",
        border: "border-slate-800",
        dot: "bg-slate-300",
    },
    compensation: {
        label: "Обезщетение",
        bg: "bg-violet-50",
        text: "text-violet-700",
        border: "border-violet-200",
        dot: "bg-violet-500",
    },
    unavailable: {
        label: "Недостъпен",
        bg: "bg-rose-50",
        text: "text-rose-700",
        border: "border-rose-200",
        dot: "bg-rose-500",
    },
    hidden: {
        label: "Скрит (admin)",
        bg: "bg-stone-100",
        text: "text-stone-500",
        border: "border-stone-300",
        dot: "bg-stone-400",
    },
};

export const PROPERTY_TYPE_LABELS = {
    apartment: "Апартамент",
    garage: "Гараж",
    parking: "Паркомясто",
    yard_parking: "Дворно паркомясто",
    storage: "Склад",
    house: "Къща",
    shop: "Магазин",
};

export const PROPERTY_TYPE_FILTERS = [
    { value: "apartment", label: "Апартаменти" },
    { value: "shop", label: "Магазин" },
    { value: "parking", label: "Паркоместа", types: ["parking", "yard_parking"] },
    { value: "garage", label: "Гаражи" },
    { value: "storage", label: "Складове" },
];

export const matchesTypeFilter = (filter, propertyType) => {
    if (filter.types) return filter.types.includes(propertyType);
    return propertyType === filter.value;
};

// Statuses an admin can pick from in the property editor.
// "hidden" intentionally excluded — feature removed (legacy badges stay renderable).
export const EDITABLE_STATUSES = [
    "available",
    "reserved_zero_deposit",
    "reserved_paid_deposit",
    "sold",
    "compensation",
    "unavailable",
];

// Floor → kote label mapping for Хаджи Димитър (per-project config later).
export const FLOOR_INFO = {
    "-1": { label: "СУТЕРЕН", kote: "-3.48" },
    "0":  { label: "ПАРТЕР",  kote: "0.00"  },
    "1":  { label: "1 ЕТАЖ",  kote: "+3.40" },
    "2":  { label: "2 ЕТАЖ",  kote: "+6.29" },
    "3":  { label: "3 ЕТАЖ",  kote: "+9.18" },
    "4":  { label: "4 ЕТАЖ",  kote: "+12.07" },
    "5":  { label: "5 ЕТАЖ",  kote: "+14.96" },
    "6":  { label: "6 ЕТАЖ",  kote: "+17.85" },
    "7":  { label: "7 ЕТАЖ",  kote: "+20.74" },
};

export const floorLabel = (floor) => {
    const info = FLOOR_INFO[String(floor)];
    return info ? info.label : `Етаж ${floor}`;
};

export const floorKote = (floor) => {
    const info = FLOOR_INFO[String(floor)];
    return info ? info.kote : "—";
};

export const PROJECT_STATUS_LABELS = {
    planned: "Планиран",
    under_construction: "В строеж",
    completed: "Завършен",
};

export const RESERVATION_TYPE_LABELS = {
    zero_deposit: "Капаро 0",
    deposit: "Капаро",
    preliminary: "Предварителен договор",
};

export const RESERVATION_STATUS_LABELS = {
    active: "Активна",
    expired: "Изтекла",
    converted: "Преобразувана",
    cancelled: "Отменена",
};

export const ROLE_LABELS = {
    super_admin: "Супер администратор",
    admin: "Администратор",
    sales: "Продажби",
    accounting: "Счетоводство",
    project_manager: "Проект мениджър",
    client: "Клиент",
    broker: "Брокер",
};

// Icon name → lucide-react component mapping (used in nearby amenities)
// We import lazily in the component to avoid top-level circular imports.
