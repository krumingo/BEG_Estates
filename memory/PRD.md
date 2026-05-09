# BEG Estates / EstateFlow — Product Requirements Document

**Last updated:** 2026-05-06 (iteration 10)
**Status:** Iteration 10 — Clients Unification Pack C (v1.0)

## Iterations
- **v0.1 (2026-04-17)** — initial scaffold, 3-zone layout, generic demo project "Яна"
- **v0.2 (2026-04-17)** — real project seed "BEG Estates / Хаджи Димитър", normalized status model, admin-only buyer layer
- **v0.3 (2026-04-18)** — admin projects/properties CRUD, reservation extend & convert-to-deposit, admin reserve-from-property dialog
- **v0.4 (2026-04-20)** — per-property finance/deal panel
- **v0.5 (2026-04-20)** — RZP pricing metrics & forecast margin
- **v0.6 (2026-04-21)** — client profile + contact completeness + flat client↔admin messaging
- **v0.7 (2026-04-21)** — admin floor-plan mapping + public clickable floor-plan overlay (REMOVED in v0.8)
- **v0.8 (2026-05-05)** — UI refactor: removed floor-plans entirely, merged inquiries into reservations (tabs), Smart Diff bulk import endpoint + UI, hadji dimitar 52 units canonicalised
- **v0.9 (2026-05-06)** — Brand Integration Pack B.1: 5 SVG logos + favicon, AdminSidebar / PublicHeader / StaffLogin / new PublicFooter wired up
# BEG Estates / EstateFlow — Product Requirements Document

**Last updated:** 2026-05-06 (iteration 11)
**Status:** Iteration 11 — Quote Builder Pack D (v1.1) ⭐ game-changer

## Iterations
- **v1.0 (2026-05-06)** — Clients Unification Pack C: unified `db.users(role=client)` as single clients directory, full CRUD endpoints, AdminClients UI rewrite, Brand fix "Building Express Group"
# BEG Estates / EstateFlow — Product Requirements Document

**Last updated:** 2026-05-09 (iteration 20)
**Status:** Iteration 20 — Refactoring R.3 (Pricing UI преместено в Имоти) (v1.5.6)

## Iterations
- **v1.5.6 (2026-05-09)** — **Refactoring R.3 — Pricing UI move**: Pricing Settings UI се мести от edit dialog на /admin/projects → нов toolbar бутон 'Площообразуване' (Settings icon, role-gated за super_admin) на /admin/properties. AdminProjects.jsx -12 реда, AdminProperties.jsx +35 реда. PricingSettingsTab компонентът остава непроменен. Тествано 100% pass от testing_agent_v3_fork (iteration_9.json) включително R.2 регресии (inline €/м², BulkApply, PropertiesSummary).
- **v1.5.5 (2026-05-09)** — Refactoring R.2 ЧАСТ 3 — PropertiesSummary footer
- **v1.5.4 (2026-05-09)** — Refactoring R.2 ЧАСТ 2 — Inline price edit + Bulk apply
- **v1.5.3 (2026-05-09)** — Refactoring R.1 — Dead Code Cleanup

## Iterations
- **v1.5 (2026-05-06)** — Deal Editor Full UI Pack G.2
- **v1.5.1 (2026-05-06)** — Terminology Redesign Pack G.2.1
- **v1.5.2 (2026-05-09)** — **Площообразуване Pack G.2.2A**: per-project pricing_settings (base_price_per_sqm, vat_rate, floor_corrections, type_overrides), Pricing Engine с priority resolution (manual → type → floor → base), bulk recalc endpoints (dry_run + apply) + preview-display-prices, PricingSettingsTab UI в редакция на проект (super_admin only)

## Iterations
- **v1.5 (2026-05-06)** — Deal Editor Full UI Pack G.2
- **v1.5.1 (2026-05-06)** — **Terminology Redesign Pack G.2.1**: with_bank→bank_loan ("Банков кредит"), without_bank→own_funds ("Лични средства"), bucket non_bank→own; both buckets now have invoice/proforma split; auto-suggest при въвеждане; schedule без editable % колона

## Iterations
- **v1.0 (2026-05-06)** — Clients Unification Pack C: unified `db.users(role=client)` as single clients directory
- **v1.1 (2026-05-06)** — Quote Builder Pack D: full quote lifecycle, reportlab PDF, AdminQuotes + QuoteEditor wizard
- **v1.2 (2026-05-06)** — Quote Schemes Pack E.1: structured payment schemes
- **v1.3 (2026-05-06)** — Sales Foundation Pack F.1+F.2 (DEPRECATED in G.1)
- **v1.4 (2026-05-06)** — Deal Foundation Pack G.1: replaced Sale model with per-client multi-property `Deal`
- **v1.5 (2026-05-06)** — **Deal Editor Full UI Pack G.2**: complete AdminDeals list, NewDealWizard, full DealEditor (header/items/payment-mode/schedules/tracking), legacy /api/sales removed

## Original problem statement
Modern web SaaS/CRM for selling new-construction real estate in Bulgaria.
Three zones: public site (project showcase), client portal (buyer self-service), admin backoffice.
Supports: apartments, garages, parking, storage, shops, houses.
Differentiator: "Капаро 0" (zero-deposit reservation) flow.

## User personas
- super_admin / admin — full access
- sales — projects, properties, reservations, clients
- accounting — payments & installments (future)
- project_manager — construction progress, updates (future)
- client — own properties, reservations, payments, documents
- broker — external partner access (future)

## Architecture
- **Backend:** FastAPI + MongoDB (motor), JWT httpOnly cookies, bcrypt, TOTP 2FA (pyotp), email OTP (dev_otp for scaffold), role-based guards
- **Frontend:** React 19 + Tailwind + shadcn/ui + sonner. Three layouts (public/client/admin). Cormorant Garamond + Manrope (Cyrillic-safe)
- **Collections (v0.2):** users, projects, buildings, properties, reservations, payment_plans, payment_installments, payments, documents, inquiries, audit_logs, status_history, project_updates, login_history, otp_codes, login_attempts, **buyers** (admin-only), **system_meta** (seed version)

## Status model (v0.2 — english keys, BG labels)
| key | label | semantics |
|---|---|---|
| available | Свободен | can be reserved |
| reserved_zero_deposit | Резервиран · Капаро 0 | zero-deposit hold (7 days) |
| reserved_paid_deposit | Резервиран · Капаро | paid deposit / predialiminary |
| sold | Продаден | owner assigned, contract signed |
| compensation | Обезщетение | compensation allocation (admin-only workflow) |
| unavailable | Недостъпен | temporarily not offered |
| hidden | Скрит | admin-only — never shown on public pages |

Zero-deposit reservation is allowed ONLY on `available` properties.

## Property schema (v0.2)
Core: `id, project_id, building_id, floor, code, property_type, rooms, area_pure, area_common, area_total, ideal_parts_area, raw_area, exposure, description, gallery, plan_url, status, linked_unit_ids, created_at`

**Pricing (all editable by admin):**
- `base_price` — seeded baseline (from PDF)
- `list_price` — what's shown publicly
- `negotiated_price` — admin-only, per-deal
- `reservation_price` — amount paid on reservation
- `final_contract_price` — signed contract price

**Admin-only (stripped on public endpoints):** `buyer_id, admin_notes, negotiated_price, source_ref, final_contract_price`

## Privacy rules
- Public API endpoints strip admin-only fields via `_public_property()` filter
- Properties with `status=hidden` are omitted from public list endpoints and return 404 on direct fetch
- Buyer names/contacts live in `buyers` collection, accessible only via `GET /api/buyers` (staff-only)
- Admin property detail includes buyer object; public detail excludes it

## Route map
### Public
`/` · `/projects` · `/projects/:id` · `/properties/:id` · `/contact` · `/login/staff` · `/login/client`

### Client portal (protected)
`/portal` (dashboard) · `/portal/reservations` · `/portal/payments` · `/portal/documents` · `/portal/updates`

### Admin (protected)
`/admin` · `/admin/projects` · `/admin/properties` · `/admin/reservations` · `/admin/clients` · `/admin/inquiries` · `/admin/audit`

## API endpoints
Auth: `/api/auth/staff/login`, `/api/auth/client/request-otp`, `/api/auth/client/verify-otp`, `/api/auth/2fa/setup`, `/api/auth/2fa/verify`, `/api/auth/me`, `/api/auth/logout`
Catalog: `/api/projects`, `/api/projects/{id}`, `/api/projects/{id}/properties`, `/api/properties/{id}`, `/api/property-statuses`, `POST /api/projects` (staff), `POST /api/properties` (staff), `PATCH /api/properties/{id}/status` (staff)
Buyers: `/api/buyers` (staff only)
Reservations: `/api/reservations`, `POST /api/reservations`, `POST /api/reservations/{id}/release`
Dashboards: `/api/dashboard/admin` (staff), `/api/dashboard/client` (client)
Clients / inquiries / audit: `/api/clients`, `/api/inquiries`, `/api/audit-logs`

## Seed (v0.2)
- **Project 1 (primary):** "BEG Estates / Хаджи Димитър" · Подуяне, София · УПИ XVI-432,433, кв.36 · in_construction · 35% · 4 nearby amenities (Kaufland, Park Gerena, 95 SU, transport)
  - 18 apartments (101-104, 201-204, 301-303, 401-402, 501-503, 601-602)
  - 1 shop (Магазин)
  - 6 parking (ПМ-07/08/12/13/14/15)
  - 1 garage (Г-1)
  - 3 storage (Склад 1/2/3)
  - Sample assignments: 301 sold → М. Георгиева; 102 paid deposit → Н. Костов; 401 compensation; 501 hidden; 202 zero-deposit → Ivan (client) + 3-installment payment plan
- **Project 2 (planned):** "Жилищна сграда Яна" · Манастирски ливади · status=planned, no inventory

Seed is gated by `system_meta.seed.version` tag so future schema changes force clean re-seed.

## Import-ready design
- `source_ref` field on every property links back to the source PDF row ("ПЛОЩООБРАЗУВАНЕ row: ап. 202")
- `_new_unit()` helper in seed.py centralizes construction — swapping placeholder values for real area/price values is a one-line change per row
- Project carries `source_files` list listing original PDFs
- Nearby amenities are structured data (icon + label + walk_time), easily extended from location screenshots
- Gallery / cover_image use URL strings — can be swapped to object-storage URLs when renders uploaded

## What's been implemented
### v0.1 (2026-04-17)
- Full 3-zone scaffold (public / client / admin), all routes & layouts
- JWT staff auth + TOTP 2FA scaffolding, email-OTP client login (dev_otp)
- Zero-deposit reservation flow with auto-expire
- Initial seed for Яна project (20 apts + 8 garages + 10 parking)
- **28/28 backend tests passing**

### v0.2 (2026-04-17)
- Normalized PropertyStatus enum (english keys, BG labels) + status_history tracking
- Extended pricing fields (base/list/negotiated/reservation/final)
- Admin-only `buyers` collection + assignment linking to properties
- Privacy filter on all public property endpoints
- Seed version gate → fresh HD seed + Яна demoted to planned
- New PropertyType: `shop`, `yard_parking`
- Public project page: gallery, nearby amenities (structured icons), construction-progress timeline
- Admin properties table: new columns (base/list price, buyer, admin notes, inline status select)
- **28/28 backend tests passing (iteration 2)**

### v0.3 (2026-04-18)
- JSON source-driven seed (`backend/data/hadzhi_dimitar_units.json`) — source of truth for HD inventory
- Admin Projects CRUD (create/edit via dialog, partial PATCH)
- Admin Properties CRUD (create/edit via dialog, partial PATCH, strict `code` uniqueness per project)
- Admin Reservation actions: extend expiry (+7d) & convert zero-deposit → deposit
- **Admin Reserve-from-Property dialog** — new button "Резервирай" on each available row (`/admin/properties`) opens a compact dialog for client + type (zero_deposit/deposit) + amount; `POST /api/reservations` hardened with validation (client must be role=client, property must be available, amount>0 for deposit, audit log entry)
- Fixed SyntaxError in `routes/reservations.py` (invalid embedded Bulgarian quotes in error detail string)

### v0.4 (2026-04-20)
- **Per-property finance/deal panel**. New tab "Сделка / Плащания" inside the admin property-edit dialog.
- Backend endpoints (`routes/projects.py`):
  - `GET /api/properties/{id}/finance-summary` — aggregates plan + installments + payments for one property; computes `paid_total`, `unpaid_total`, `remaining_total` (falls back to `final_contract_price - paid_total` only when no installments exist), `next_due_installment`, `next_1/2/3_due_sum`, `next_due_alert` (≤7d), `avg_price_rzp = final_contract_price / raw_area` **only when `raw_area > 0`** (never uses `area_total` as fallback)
  - `PUT /api/properties/{id}/finance-plan` — clean-replace of `payment_plans` + `payment_installments` for this property; also patches `properties.final_contract_price`, `properties.reservation_price` and optional `buyer_id`; audit `property_finance_plan_update`
  - `POST /api/properties/{id}/payments` — inserts payment record keyed by `property_id` + greedy mark-as-paid of oldest unpaid installments it fully covers (no partials in this package); audit `property_payment_recorded`
- New Pydantic models: `PropertyFinancePlanUpdate`, `PropertyInstallmentInput`, `PropertyPaymentCreate`
- Frontend `AdminProperties.jsx`: extracted `PropertyFormBody` + added `FinanceSection` with summary cards, upcoming 1/2/3 block, editable installments table, payment form + history

### v1.5.3 — R.1 Dead Code Cleanup (2026-05-09)
- **Frontend изтрити (9 файла):**
  - `pages/client/` (цяла директория — Dashboard, Reservations, Payments, Documents, Updates, Profile, Messages — 7 файла)
  - `pages/auth/ClientLogin.jsx`
  - `components/layout/ClientSidebar.jsx`
- **Frontend променени (5 файла):**
  - `App.js` — пренаписан без client/portal routes; запазени backwards-compat redirects (`/login/client` → `/login/staff`, `/portal/*` → `/`)
  - `components/common/ProtectedRoute.jsx` — пренаписан само за staff (gate `STAFF_ROLES`)
  - `components/layout/PublicHeader.jsx` — премахнат „Клиент" бутон + dead „Моят портал" бутон
  - `pages/auth/StaffLogin.jsx` — премахнат „Клиентски вход" линк
  - `pages/public/PropertyDetail.jsx` — `reserveZero()` пренасочва към `/contact?property=X&type=reservation` (вместо стария portal flow)
- **Backend изтрити (2 endpoints + 2 модела):**
  - `POST /api/auth/client/request-otp`
  - `POST /api/auth/client/verify-otp`
  - `models.ClientOtpRequest`, `models.ClientOtpVerify`
  - Premahnat import `generate_otp_code`
- **Запазено** (важно за бъдещи фийчъри):
  - `Role.CLIENT` в constants.py (ползва се в Quotes/Deals/Reservations)
  - 19 клиенти в `db.users(role=client)`
  - `/api/clients` admin endpoints
  - `db.otp_codes` колекция (празна, но remains за future TOTP/MFA)
- **Тестове:** 6/6 verification ✅ (staff login → 200, /api/clients → 200, /api/quotes → 200, client OTP → 404, backend imports clean, frontend webpack compiled successfully)
- **Резултат:** ~780+ реда мъртъв код премахнати; staff-only architecture; foundation за бъдещ public-only flow.

### v1.5.2 — G.2.2A Площообразуване (2026-05-09)
- **Backend pricing_models.py**: `FloorPriceCorrection`, `TypePriceOverride`, `ProjectPricingSettings`, `BulkRecalcRequest`, `BulkRecalcResultItem`, `BulkRecalcResult`.
- **Backend services/pricing_engine.py**: `resolve_price_per_sqm` (priority: `manual_override` → `type_override` → `floor_correction` → `base`), `calculate_list_price` (= ppm × area_total, **БЕЗ ДДС**), `calculate_display_price_with_vat` (= net × (1 + vat/100), за публичен display), `bulk_recalc_properties` (pure function), `hadzhi_dimitar_default_pricing` preset.
- **Backend endpoints (super_admin only)**:
  - `PUT /api/admin/projects/{id}` extended с `pricing_settings: Optional[dict]`
  - `POST /api/admin/projects/{id}/pricing/recalc` body `{dry_run, overwrite_overrides, only_codes, apply_to_types}` → `BulkRecalcResult`. Без settings → 400. На apply: audit log `pricing_bulk_recalc`.
  - `GET /api/admin/projects/{id}/pricing/preview-display-prices` → rows с `list_price` + `display_price_with_vat` + vat_rate.
- **Frontend `components/admin/PricingSettingsTab.jsx`**: Базови настройки (base/VAT) + table editor за floor_corrections + table editor за type_overrides + бутон „Default Хаджи Димитър" (HADZHI_DIMITAR_DEFAULTS preset) + бутон „Преглед на recalc" с dialog (counters Total/Updated/Skipped + table per имот: код/тип/стара/нова/Δ/source) + бутон „Приложи recalc". Интегрирана в `AdminProjects.jsx` edit dialog **САМО** при `mode==="edit" && editingId && isSuperAdmin`.
- **Бизнес правило**: list_price в DB е **винаги БЕЗ ДДС**. Display цена за публичен сайт = `list_price × (1 + vat_rate/100)`.
- **Тестове:** 14/14 backend + 100% frontend ✅ (`/app/test_reports/iteration_6.json`, `/app/backend/tests/test_pricing_g22a.py`)
- **Smoke test за pricing engine**: 7/7 преминати (Apt 101 → 173316€, Apt 501 → 343980€, Garage → 1212€/м², display_price ratio 1.20 ✓, manual override priority, empty settings handling, apartments игнорират type_override).

### v1.5.1 — G.2.1 Terminology Redesign (2026-05-06)
- **Backend model renames**: `DealPaymentMode.mode`: `with_bank`→`bank_loan`, `without_bank`→`own_funds`. Нови полета: `own_amount`, `bank_invoice_amount`, `bank_proforma_amount`, `own_invoice_amount`, `own_proforma_amount` (premahnati: `non_bank_amount`, `invoice_amount`, `proforma_amount`). Bucket: `non_bank`→`own`. Deal field `non_bank_stages`→`own_stages`.
- **Migration** (`migrations/rename_payment_terminology.py`, idempotent via marker в `_migrations`) — auto-мигрира 5 съществуващи deals с правилна renaming.
- **Нов endpoint** `POST /api/deals/{id}/suggest-distribution` (super_admin) — връща auto-filled breakdown при промяна на едно поле (напр. `bank_invoice=5000` при total=11584 → `bank_proforma=6584`).
- **PUT /api/deals/{id}** — backend сега recompute-ва `percent` от `amount/basis` на всички stages (amount = source of truth).
- **Frontend helpers** (`/app/frontend/src/lib/deal-helpers.js`): нови функции `suggestDistribution` (mirror на backend), `defaultBreakdownForMode`, `rescaleStagesByBasis`, `recomputeStagePercents`. `validatePaymentMode` покрива и двата invoice/proforma split-а.
- **Frontend DealEditor**:
  - PaymentModeSection redesigned — 3 секции (combined split / bank invoice-proforma / own invoice-proforma) + summary (По фактура / По проформа / Общо с ✓✗ indicator). Auto-suggest на blur (NumLabelInput с local state + onCommit pattern).
  - ScheduleSection: **премахната editable % колона**, само Сума с info text `(X% от basis)` под полето; `sum` показва total суми; validation warning ако sum ≠ basis.
  - Всички radio + testids обновени: `pm-radio-bank_loan` / `pm-radio-own_funds` / `pm-radio-combined`, `schedule-section-bank` / `schedule-section-own`, `stage-amount-{bucket}-{order}` (вместо `stage-percent-*`).
  - NewDealWizard radio values обновени.
- **Bug fix (testing agent)**: `/app/frontend/src/pages/admin/AdminDeals.jsx:179` използваше `non_bank_stages` — fixed to `own_stages` за правилен прогрес бар след миграцията.
- **Тестове:** 16/16 backend + 100% frontend ✅ (виж `/app/test_reports/iteration_5.json` и `/app/backend/tests/test_deals_g21.py`)

### v1.5 — G.2 Deal Editor Full UI (2026-05-06)
- **AdminDeals списък**: filter by status/client + search; counters Активни/Завършени/Отказани; progress bar (sumPaidAmount/total_with_vat); delete button за cancelled сделки с confirmation+reason
- **NewDealWizard (2 стъпки)**: Step 1 — клиент picker + multi-select имоти (само available, grouped by floor); Step 2 — inline agreed_price inputs (init=listprice) + payment_mode radio + auto-schedule checkbox. На "Create" → POST /deals + (если cb) POST /regenerate-schedule → redirect към editor.
- **Full DealEditor**: 4 секции — Header (status badge, source quote indicator, Save/Cancel buttons), Items table (inline price edit с live recalc + amber подсветка ако agreed > listprice), PaymentModeSection (mode-dependent visibility за invoice/proforma/bank/non_bank breakdown с live %), ScheduleSection per bucket (auto-regen, inline label/percent/date editing с auto-recalc на amount, drag-add stages, payment tracking via Mark/Unmark buttons), Summary (real/получени/очаквани) + notes.
- **PaymentMarkDialog**: date+amount+notes (prefilled). Click на платен етап → window.confirm → unmark (revert is_paid=false).
- **Cancel flow**: confirmation dialog → reason → POST /cancel → имотите се освобождават (status=available, buyer_id=null) + read-only режим.
- **Validation helpers** (`/app/frontend/src/lib/deal-helpers.js`): `calculateVatSplit`, `validatePaymentMode` (tolerance 0.01), `validateScheduleSum` (warn ако ≠ 100%), `bucketBasis`, `isBucketVisible`, `sumStagesAmount/Percent`, `sumPaidAmount`.
- **Cleanup на legacy** /api/sales: deregistered router, deleted `routes/sales.py`, `services/sale_calculations.py`, `migrations/auto_seed_sales.py`, removed sale lifecycle hooks от `routes/projects.py:402`, removed Sale models от `models.py`. `/api/sales/*` връща 404.
- **Тестове:** 17/17 backend + 100% frontend ✅ (виж `/app/test_reports/iteration_4.json` и `/app/backend/tests/test_deals_g2.py`)

### v1.4 — G.1 Deal Foundation (2026-05-06)
- **Скрапнат** legacy `Sale` модел и cleanup migration drop-ва: `db.sales` (12), `db.quotes` (2), `db.payment_plans` (2), `db.payment_installments` (6), `db.payments` (2). Marker doc в `db._migrations` гарантира идемпотентност. **52 имота + 19 клиенти запазени.**
- **Нов модел `Deal`** (per-клиент multi-property сделка): `DealItem`, `DealPaymentMode` (with_bank/without_bank/combined + invoice/proforma split), `DealPaymentStage` (bucket: bank|non_bank, is_paid, paid_date, paid_amount), статуси active/completed/cancelled, auto-инкремент D-YYYY-NNN
- **Backend endpoints (super_admin only):**
  - `GET /api/deals` (filter by status/client_id/project_id), `/by-client/{id}`, `/{id}`
  - `POST /api/deals` — multi-property, validates not-already-sold + not-in-active-deal, marks props sold + sets buyer_id
  - `PUT /api/deals/{id}` — items, payment_mode, stages, vat_rate, notes
  - `POST /api/deals/{id}/regenerate-schedule` — bucket=bank|non_bank|both, preset=standard|with_bank|custom, preserves paid stages
  - `PATCH /api/deals/{id}/stages/{order}/payment` — toggle is_paid + paid_date/amount/notes
  - `POST /api/deals/{id}/cancel` — releases properties (status=available, buyer_id=null)
  - `DELETE /api/deals/{id}` — only when status=cancelled
- **Quote→Deal converter:** `POST /api/quotes/{id}/convert-to-deal` (super_admin) — снимка на custom_price + discount → agreed_price, импортира payment_schedule в non_bank_stages
- **PUT `/api/admin/projects/{id}`** (super_admin) — приема `expense_estimate` (foundation/rough_construction/finishing/total/notes) + `total_rzp_area`
- **UI:**
  - Премахнат целият финансов панел от `/admin/properties` (no tabs, no FinanceSection, no SaleFinanceSection, no RZP block, no schedule plan, no Next 1/2/3). Само Основни данни.
  - Изтрит `frontend/src/components/admin/SaleFinanceSection.jsx`
  - Нов sidebar tab „Сделки / Плащания" — **видим само за super_admin**
  - Нови placeholder pages: `/admin/deals` (списък с реални данни) и `/admin/deals/new` + `/admin/deals/:id` (read-only viewer + G.2 placeholder)
  - QuoteEditor: бутонът „Преобразувай в Sale" → „Преобразувай в Сделка" с redirect към `/admin/deals/{id}`
- **Тестове:** 15/15 backend + frontend acceptance тестове ✅ (виж `/app/test_reports/iteration_3.json` и `/app/backend/tests/test_deals_g1.py`)

## Prioritized backlog
### P0 — next pack G.3
- **Financial Dashboard** — агрегирани финансови данни от Deal модела (приход, кеш-флоу, прогнозни маржове, по проект и общо); KPI карти, таблица с просрочени плащания, monthly burn-down

### P1 — backlog
- **Email Provider (Resend/SendGrid)** + auto-release scheduler за zero-deposit резервации
- **Pricing Engine** — coefficient by floor/exposure, отстъпки, payment plans
- **Contract Generator** — на базата на Deal payment_schedule

### P2 — future
- **„Моят интерес / Wishlist"** публичен flow за нерегистрирани клиенти
- **Real File/PDF Import** — автоматично парсване на чертежи
- Multi-language (EN), sales funnel reports, broker role UI, trusted devices

## Credentials (dev) — see `/app/memory/test_credentials.md`
- super_admin: admin@begestates.bg / BegEstates2026!Admin
- sales: sales@begestates.bg / BegEstates2026!Sales
- Client OTP: ivan.petrov@example.com (dev_otp returned in response)

## Known limitations
- OTP email sending is **MOCKED** (dev_otp in response)
- Legacy `/api/sales` endpoints still mounted (deprecated; UI no longer uses them) — will be removed in G.3
- DealEditor е read-only — пълен интерактивен редактор предстои в G.2
- Real project files (PDFs, renders, location photos) **NOT YET UPLOADED** — current seed uses realistic placeholder inventory matching the described naming/structure, ready to be swapped to real values in a single pass once files are available
