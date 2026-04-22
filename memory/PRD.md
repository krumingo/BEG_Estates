# BEG Estates / EstateFlow — PRD

## Problem statement
Модерен WEB SaaS/CRM за продажба на недвижими имоти — ново строителство. Публичен сайт, Клиентски портал и Админ панел с role-based auth. Включва резервации (zero-deposit и deposit), privacy правила, финансов панел по имот, кореспонденция, AI асистенти (floor plans & PDF import с human review), и строга Pre-change Snapshot / Versioning система с експорт в отделно хранилище.

**Primary language:** Bulgarian (цялото UI е на български).

## Core architecture
- **Backend**: FastAPI + MongoDB (Motor) + Pydantic v2 — routes/, services/, models.py
- **Frontend**: React + Tailwind + shadcn/ui
- **AI local pipeline**: OpenCV, PyMuPDF, Tesseract OCR (с bul език) — никакви външни API засега
- **Versioning**: Pre-change snapshot → export JSON.gz в `/app/exports/beg_estates_snapshots/...`; restore = нова версия, не destructive rollback
- **Auth**: Staff (email + password + 2FA), Client (email + OTP)

## Implemented (Feb 2026)
- Admin CRUD проекти/имоти с privacy rules (DONE)
- Резервации zero-deposit + deposit от имотния списък (DONE)
- Per-property финансов панел + RZP wallet + forecast margin (DONE)
- Client profile + чат кореспонденция (DONE)
- Floor plan mapping (backend + admin UI + public overlay) (DONE)
- AI contour detection за floor plans (OpenCV + OCR) (DONE)
- AI PDF import (класификация + extraction + human review) (DONE)
- Pre-change snapshots + versioning + local export + safe restore (DONE, backend + frontend UI завършен Feb 2026)

## Backlog (prioritized)

### P1
- **Email Provider & Scheduler** — Resend/SendGrid за system emails + auto-release на изтичащи zero-deposit резервации (next task)
- **Pricing Engine** — автоматични коефициенти (етаж, изложение, отстъпки) + auto payment plans

### P2
- Wishlist / „Моят интерес" публичен flow + lead генериране
- Broker роля + проследяване на комисионни
- Change-requests flow (клиентски заявки)

## Test credentials
Виж `/app/memory/test_credentials.md`.

## Key endpoints
- `GET /api/snapshots`, `GET /api/snapshots/{id}`, `POST /api/snapshots/{id}/restore-as-new-version`
- `POST /api/projects/{id}/floor-plans/{floor}/suggest-contours`
- `POST /api/import-sessions/{id}/analyze`
- Reservations, Properties, Projects, Profile, Messages routes

## Constraints / rules
- Pre-change snapshot failure ⇒ write операцията НЕ се изпълнява
- Restore винаги генерира нова версия (pre-restore snapshot + apply)
- AI никога не пише директно в DB — винаги review screen
- Privacy: публични ендпойнти никога не връщат buyer_id, цени, административни статуси
