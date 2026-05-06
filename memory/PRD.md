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
- **v1.0 (2026-05-06)** — **Clients Unification Pack C**: unified `db.users(role=client)` as single clients directory (db.buyers DROPPED), full CRUD endpoints, AdminClients UI rewrite, Brand fix "Building Express Group"

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

## Prioritized backlog
### P0 — next iteration once real PDFs are attached
- **Real inventory import** from "ПЛОЩООБРАЗУВАНЕ - нанесени КУПУВАЧИ.pdf" — replace placeholder area/price values; map file-based buyer assignments to admin records
- **Real renders** from uploaded Enscape gallery → replace unsplash placeholders
- **Real location screenshots** (Kaufland, Park Gerena, school, transport) → replace icon-only amenities with cards carrying photos
- Architectural plan embed / link from "000 - NP165-SD-AR.pdf"

### P0 — functional
- Admin UI to create/edit projects, properties, buyers (currently read/status-change only)
- Payment plan CRUD + mark installment paid
- TOTP 2FA setup UI for staff
- Real email provider (Resend/SendGrid) for OTP + expiry reminders
- Background scheduler for zero-deposit auto-release notifications

### P1
- Pricing engine: coefficient by floor/exposure, per-sqm pricing, discounts, promotions
- Contract/document upload (Object storage) + client signing flow
- Change-requests & change-offers flow
- Broker role UI + commission tracking

### P2
- Multi-language (EN) interface
- Sales funnel reports, collection forecasts
- Client in-portal messaging with sales
- Trusted devices / login history UI

## Credentials (dev) — see `/app/memory/test_credentials.md`
- admin@begestates.bg / Admin123!
- sales@begestates.bg / Sales123!
- Client OTP: ivan.petrov@example.com (dev_otp returned in response)

## Known limitations
- OTP email sending is **MOCKED** (dev_otp in response)
- No scheduled job for reservation expiry (lazy check on reads)
- Pricing logic simplified (no discounts/coefficients yet)
- Real project files (PDFs, renders, location photos) **NOT YET UPLOADED** — current seed uses realistic placeholder inventory matching the described naming/structure, ready to be swapped to real values in a single pass once files are available
