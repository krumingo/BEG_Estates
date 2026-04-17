# BEG Estates / EstateFlow — Product Requirements Document

**Date:** 2026-04-17
**Status:** Initial scaffold complete (v0.1)

## Original problem statement
Modern web SaaS/CRM for selling new-construction real estate in Bulgaria.
Three zones: public site (project showcase + sales), client portal (buyer self-service), admin backoffice (sales/accounting/project mgmt).
Supports: residential blocks, apartments, garages, parking spaces, storage, houses.
Key differentiator: "Капаро 0" (zero-deposit reservation) flow with auto-expiration.

## User personas
- **super_admin / admin** — full access, user management, audit
- **sales** — manage projects, properties, reservations, clients
- **accounting** — payments and installments (future)
- **project_manager** — construction progress, updates (future)
- **client** — view own properties, reservations, payments, documents
- **broker** — external partner access (future)

## Architecture
- **Backend:** FastAPI + MongoDB (motor). Modular routers. bcrypt passwords, JWT (httpOnly cookies + Bearer fallback), TOTP 2FA (pyotp) for staff, email OTP (dev-returned) for clients.
- **Frontend:** React 19 + Tailwind + shadcn/ui + sonner toasts. Three layouts: public / client portal / admin. Cormorant Garamond (headings) + Manrope (body, Cyrillic).
- **Data:** 16 collections incl. users, projects, buildings, properties, reservations, payment_plans, payment_installments, payments, documents, inquiries, audit_logs, project_updates, login_history, otp_codes, login_attempts.

## Core flows implemented
1. **Public browsing** — home → projects → project detail (floor selector, availability grid) → property detail.
2. **Inquiry form** (public) → saved + audit-logged.
3. **Staff login** — email + password + optional TOTP 2FA; brute-force lockout (5 fail / 15 min).
4. **Client login** — email → OTP request (dev_otp returned in scaffold) → verify.
5. **Zero-deposit reservation** — client on free property → status → резервиран_капаро_0, 7-day expiry, 2-per-client limit, auto-release on expire.
6. **Admin dashboard** — KPIs (free/reserved/sold/active zero-deposit/expiring soon/collected funds), recent reservations and inquiries.
7. **Admin CRUD** — properties (status change with audit), clients list, reservations list with release action, inquiries, audit log.
8. **Client portal** — my reservations with countdown, payment plan & installments, documents, progress.

## What's been implemented (2026-04-17)
- Full auth with role-based guards (STAFF_ROLES vs client)
- Complete public site: Home (hero/editorial), Projects listing, Project detail (floors + availability grid + map via OpenStreetMap), Property detail with zero-deposit reservation button
- Client portal layout + Dashboard, Reservations, Payments, Documents, Updates pages
- Admin panel layout + Dashboard, Projects, Properties (with inline status change), Reservations (with release), Clients, Inquiries, Audit log
- Seed data: Project "Жилищна сграда Яна", 20 apts + 8 garages + 10 parking, 1 sold, 1 active zero-deposit on A3-2 for client Иван Петров, 3-installment payment plan
- All backend endpoints tested: 28/28 passing (testing_agent_v3 iteration_1)
- CORS configured for preview + localhost

## Prioritized backlog
### P0 (next logical step)
- Admin CRUD for creating/editing projects and properties from UI (currently only listings + status)
- Payment plan creation UI for staff + mark installment paid
- Proper email provider (Resend/SendGrid) for OTP and reservation-expiry reminders
- Automatic scheduler for zero-deposit expiration emails (currently on-demand expire only)
- TOTP 2FA setup UI for staff (backend endpoints exist: /auth/2fa/setup + /auth/2fa/verify)

### P1
- Pricing engine: coefficient by floor/exposure, per-sqm pricing, discounts, promotions
- Contract/document upload (Object storage) + client signing flow
- Change requests & change offers flow
- Construction progress update publishing (admin posts with images)
- Broker role UI and commission tracking

### P2
- Multi-language (EN) interface
- Advanced reports: sales funnel, collection forecasts
- Client in-portal messaging with sales
- Trusted devices / login history UI
- Role-specific audit log filtering

## Credentials (dev)
- admin@begestates.bg / Admin123!
- sales@begestates.bg / Sales123!
- Client OTP: ivan.petrov@example.com (dev_otp returned in response)

## Known limitations of the scaffold
- OTP is returned in the API response (`dev_otp`) instead of being emailed — MOCKED (intentional, per user request)
- TOTP 2FA is optional on first staff login (bootstrap); system prompts to enable
- No scheduled job for reservation expiry yet — expiration is checked lazily on reads of `/reservations` and `/dashboard/admin`
- Payment plan logic is simplified (no discounts/coefficients)
