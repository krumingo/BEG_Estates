# BEG Estates / EstateFlow — PRD

> Modern web SaaS / CRM for selling new-construction real-estate. Single-builder
> deployment (Bulgarian market). Public marketing site + Client portal + Admin backoffice.

**Working name**: BEG Estates  ·  **Internal**: EstateFlow
**Primary user language**: Български (UI, errors, comments — all in Bulgarian)

---

## Original problem statement

Изграждане на модерен WEB SaaS/CRM за продажба на недвижими имоти ново строителство.
Системата включва:

- Публичен сайт (проекти, имоти, контакт, запитване).
- Клиентски портал (read-only — резервации, плащания, документи, кореспонденция).
- Админ панел с role-based auth, AI Import за PDF, etc.
- Резервации, privacy правила, AI асистенти за floor plans и PDF документи.
- Versioning & snapshots за всяка критична операция.

---

## Architecture

```
/app/
├── backend/
│   ├── auth/              # security.py (bcrypt, JWT, TOTP, policy), dependencies.py
│   ├── routes/            # auth_routes.py, projects.py, reservations.py,
│   │                      # imports.py, audit.py, profile.py, snapshots.py, dashboard.py
│   ├── services/          # document_import.py, snapshots.py
│   ├── scripts/           # migrate_customers_to_password.py
│   ├── tests/             # pytest regression
│   ├── seed.py
│   └── server.py
└── frontend/
    ├── src/
    │   ├── components/    # public/, layout/, common/, ui/ (shadcn)
    │   ├── lib/           # api.js (axios + 401 refresh), auth.jsx
    │   ├── pages/auth/    # ClientLogin, StaffLogin, ForgotPassword, ResetPassword, ChangePassword
    │   ├── pages/admin/   # ...AdminPasswordResets
    │   ├── pages/client/
    │   └── pages/public/
    └── ...
```

**Tech**: FastAPI + Motor (MongoDB) + React + Tailwind + Shadcn UI + lucide-react.
**Auth**: bcrypt (12) + PyJWT + pyotp. JWT в HttpOnly cookies. 2-step staff login (password → TOTP).

---

## Implemented features

### Auth & Security (2026-02 refactor)

- ✅ Класически email + password login за клиенти (без OTP)
- ✅ 2-step staff login: парола → TOTP (5-мин temp_token); 2FA задължително, не може да се изключва
- ✅ Forgot/reset password flow с admin-shared линкове (без email provider)
- ✅ Admin UI за pending password resets + ръчно задаване на парола (force_change)
- ✅ Brute-force lockout: 5 опита / 15 мин → 30 мин lockout (IP:email scope)
- ✅ Password policy: ≥8 символа, ≥1 буква, ≥1 цифра
- ✅ Audit log за всички auth събития (login_success, login_failure, password_reset_*, totp_*)
- ✅ Read-only клиентски портал — POST /api/reservations отхвърля role=client с 403
- ✅ Forced password change при first login (must_change_password) → ProtectedRoute redirect
- ✅ "Заяви интерес" inquiry modal вместо "Резервирай с капаро 0" на public property detail
- ✅ Migration script за legacy клиенти без password_hash → CSV с временни пароли
- ✅ **Admin CRUD за клиенти** (POST/PATCH/DELETE /api/admin/clients) — създаване с auto temp password reveal, edit, soft delete (super_admin/admin)
- ✅ **Унификация buyers ↔ clients** (PATCH 9.2): db.buyers легаси колекция мигрирана към db.users(role=client) с idempotent script `migrate_buyers_to_clients.py`. Endpoint `/buyers` сега връща unified списък. property.buyer_id сочи към user.id. Поддържа както стари imported buyers, така и нови admin-създадени клиенти в един и същ dropdown.

### Public status visibility & visual polish (PATCH 9.3 + 9.4)
- ✅ **PUBLIC_STATUS_MAPPING** в `constants.py`:
  - `reserved_zero_deposit` / `reserved_paid_deposit` → `reserved` (един бадж за публика, без да издава типа капаро)
  - `compensation` / `unavailable` → `sold` (маскиране)
  - `hidden` → пълно скриване
- ✅ `PUBLIC_STATUS_LABELS` + `PUBLIC_STATUS_VALUES` → 3 публични статуса: Свободен / Резервиран / Продаден
- ✅ `/property-statuses` endpoint връща 3 опции за public, 7 за staff
- ✅ Backend response transformation на ниво `_public_property`, `_public_unit` и `_public_stats`
- ✅ Status filter в `/projects/{id}/properties` mapped: `reserved` → raw pair, `sold` → raw triple, hidden скрит
- ✅ Стат каунтерите на проекта: Общо / Свободни / Резервирани / Продадени
- ✅ Frontend PROPERTY_STATUS добавен ключ `reserved` с amber-500 bg
- ✅ "Продаден" badge → `bg-slate-800 text-white` (силен contrast)
- ✅ "Обезщетение" badge → `bg-violet-600 text-white` (само в admin)
- ✅ PropertyCell в ProjectDetail: sold карти с grayscale/line-through; reserved → amber accent; available → vibrant
- ✅ FloorPlanSection: overlay-ите за available=emerald / reserved=amber / sold=slate-800
- ✅ `isAdminContext` prop за FloorPlanSection (бъдещо admin преюзване — compensation→violet)

### Public tab "Всички" (PATCH 9.5)
- ✅ Нов tab "Всички" (selected по подразбиране) в ProjectDetail
- ✅ Counter badges per tab: `Всички (N) · Апартаменти (X) · Магазин (Y) · ...`
- ✅ Auto-hide tab-ове с 0 обекта
- ✅ Групиране по етаж отгоре надолу (Етаж 6→1, Партер, Сутерен)
- ⚠️ **Open issue**: source data `hadzhi_dimitar_units.json` има само 29 обекта вместо очакваните 52 (липсват 13 ПМ, 1 гараж, 9 склада). Чакам решение от собственика — re-import / ръчно допълване / seed update.

### Smart Import protected fields (PATCH 13)
- ✅ **Защита от случайно презаписване** при re-import: обекти с купувач / не-free status / активна резервация запазват статус, buyer_id, reservation_id, deposit_amount и notes
- ✅ Neutral полета (`raw_area`, `list_price`, `area_total`, и т.н.) се обновяват винаги
- ✅ `exposure`/`description` — fill-if-empty (не overwrite-ват попълнени стойности)
- ✅ **Greenfield detection** — за нов проект (count==0) протекция не се прилага
- ✅ Разширен **`apply-diff` response**: `details.protected / free_updates / new_units / in_db_not_in_pdf` + summary
- ✅ **Warnings** за обекти в DB, които не са в PDF — не се трият автоматично
- ✅ **Per-property audit log entries**: `import_create / import_apply_neutral / import_apply_protected` с `changes` и `skipped_fields`
- ✅ **Buyer linking** също уважава protection: не пренасочва `buyer_id` на защитен обект към друг купувач
- ✅ Frontend UI: 4 цветно-групирани секции в preview (🔒 Защитени / ✏️ Стандартни / ➕ Нови / ⚠️ Внимание) с neutral_changes + skipped_fields visualization
- ✅ Регресия — 18/18 pytest passes; Hadji Dimitar и greenfield test PASS
  - `reserved_zero_deposit` / `reserved_paid_deposit` → `reserved` (един бадж за публика, без да издава типа капаро)
  - `compensation` / `unavailable` → `sold` (маскиране)
  - `hidden` → пълно скриване
- ✅ `PUBLIC_STATUS_LABELS` + `PUBLIC_STATUS_VALUES` → 3 публични статуса: Свободен / Резервиран / Продаден
- ✅ `/property-statuses` endpoint връща 3 опции за public, 7 за staff
- ✅ Backend response transformation на ниво `_public_property`, `_public_unit` и `_public_stats`
- ✅ Status filter в `/projects/{id}/properties` mapped: `reserved` → raw pair, `sold` → raw triple, hidden скрит
- ✅ Стат каунтерите на проекта: Общо / Свободни / Резервирани / Продадени
- ✅ Frontend PROPERTY_STATUS добавен ключ `reserved` с amber-500 bg
- ✅ "Продаден" badge → `bg-slate-800 text-white` (силен contrast)
- ✅ "Обезщетение" badge → `bg-violet-600 text-white` (само в admin)
- ✅ PropertyCell в ProjectDetail: sold карти с grayscale/line-through; reserved → amber accent; available → vibrant
- ✅ FloorPlanSection: overlay-ите за available=emerald / reserved=amber / sold=slate-800
- ✅ `isAdminContext` prop за FloorPlanSection (бъдещо admin преюзване — compensation→violet)

### Public site

- ✅ Home, Projects, Project detail, Property detail, Contact
- ✅ Floor plan section with click-to-zoom apartments
- ✅ Property detail apartment plan lightbox (PDF / image)
- ✅ Inquiry form (anonymous, persisted to /api/inquiries)

### Admin

- ✅ Projects/Properties CRUD with auto-slug Cyrillic transliteration
- ✅ Reservations management (zero deposit / paid deposit / convert / extend / release)
- ✅ Floor plans editor (interactive coords + safe-merge)
- ✅ AI Import pipeline за PDF (PyMuPDF + Regex), document type overrides, missing units, dry-run apply, bulk approve, manual review filters, auto floor assignment, multi-page PDF, apply-to-floor-plans с safe-merge
- ✅ Audit log + Versions/Snapshots
- ✅ Clients enriched list + correspondence
- ✅ Password resets management (нова страница)

### Client portal

- ✅ Dashboard, Reservations, Payments, Documents, Updates, Profile, Messages, Change Password (всичко read-only с изключение на messages + profile + password)

---

## Backlog / Roadmap

### P1
- **Pricing Engine**: автоматични цени с коефициенти по етаж/изложение, отстъпки, payment plans
- **Email Provider integration** (Resend/SendGrid) за password resets, OTP-style notifications, reservation events. *(Currently OFF per user request — admin manually shares reset links.)*
- **Auto-release scheduler** за изтекли zero-deposit резервации. *(Currently OFF per user request.)*

### P2
- "Моят интерес / Wishlist" — публичен flow за запазване на имоти
- Broker роля + комисионни tracking
- Change-requests flow
- Force TOTP rotation / disable за загубен телефон (super-admin endpoint)

### Refactoring (по желание)
- Изнасяне на оставащите routes от server.py
- Email/SMS templating engine

---

## Test credentials

See `/app/memory/test_credentials.md`.

## Auth guide

See `/app/docs/AUTH_GUIDE.md` (Bulgarian end-user guide).

## Changelog highlights

- **2026-02-05** — Auth refactor: removed OTP, added password+TOTP, password resets admin UI, read-only client portal, inquiry modal.
- **2026-02 (earlier session)** — Versions UI, AI Import enhancements, project slug auto-generate, floor plan section in PropertyDetail, lightbox.
