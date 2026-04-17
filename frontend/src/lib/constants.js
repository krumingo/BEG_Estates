// Property status → badge styling + BG label
export const PROPERTY_STATUS = {
    свободен: {
        label: "Свободен",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        dot: "bg-emerald-500",
    },
    резервиран_капаро_0: {
        label: "Резервиран · Капаро 0",
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        dot: "bg-amber-500",
    },
    резервиран_с_капаро: {
        label: "Резервиран · Капаро",
        bg: "bg-orange-50",
        text: "text-orange-700",
        border: "border-orange-200",
        dot: "bg-orange-500",
    },
    предварителен_договор: {
        label: "Предварителен договор",
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        dot: "bg-blue-500",
    },
    продаден: {
        label: "Продаден",
        bg: "bg-slate-100",
        text: "text-slate-500",
        border: "border-slate-200",
        dot: "bg-slate-400",
    },
};

export const PROPERTY_TYPE_LABELS = {
    apartment: "Апартамент",
    garage: "Гараж",
    parking: "Паркомясто",
    storage: "Склад",
    house: "Къща",
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
