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

### Public status visibility & visual polish (PATCH 9.3)

- ✅ **PUBLIC_STATUS_MAPPING** в `constants.py`: `compensation`/`unavailable` → `sold` (маскиране); `hidden` → пълно скриване.
- ✅ Backend response transformation на ниво `_public_property` и `_public_unit` — данните в DB остават непокътнати; само response се ремапва.
- ✅ Стат каунтерите на проекта обединяват compensation + unavailable + sold в "Продадени" за public; staff виждат raw split.
- ✅ "Продаден" badge пресилнен — `bg-slate-800 text-white` вместо слаб slate-100/500.
- ✅ "Обезщетение" badge → ярко лилаво `bg-violet-600 text-white` (само admin).
- ✅ PropertyCell — sold карти с `[filter:grayscale]`, отслабени надписи и `line-through` цена.
- ✅ FloorPlanSection — overlay-ите за sold вече са `bg-slate-800`, opacity-75; публично compensation се показва като sold; admin вижда отделни статуси.
- ✅ Filter dropdowns: public users не виждат "Обезщетение" опция.

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
