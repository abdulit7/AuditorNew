# CLAUDE.md — AuditGrid (Auditor repo)

Instructions for any Claude session continuing this project. Read this first, then `PROJECT_STATUS.md` (where we are) and `REMAINING_TASKS.md` (what is next).

## What this app is
AuditGrid: distributor stock audit + retail shop audit platform for Pakistan field operations.
Two surfaces from one codebase:
- **Web Portal** (Windows desktop): administrators/managers manage geography, distributors, products, users/roles, audit forms and reports.
- **Mobile Browser** (auditors): field audits with GPS, quantities, photos.

Origin: generated with Google AI Studio. It now has a real backend: Express + Knex (MySQL 8 in production, SQLite for tests/dev), JWT sessions, server-side RBAC/territory scoping, server-driven audit forms. See `DEPLOY.md`.

## Golden rules (from the owner)
1. **Do not rebuild from scratch or remove working features.** Continue and complete the existing app.
2. Preserve existing login behaviour (Web vs Mobile sign-in modes, `userType` 'mobile' | 'web', `canLoginFromMobile`), roles, business logic and the existing report data shapes in `src/types/infrastructure.ts`.
3. Highest priority: two separately optimized experiences — mobile-first auditor UI and desktop management dashboard.
4. Test BOTH mobile (390×844) and desktop (1440×900) after every major change (see Testing).
5. Keep `CLAUDE.md`, `PROJECT_STATUS.md`, `REMAINING_TASKS.md` current at the end of each work block.
6. Use the UI/UX Pro Max skill for design decisions. Tokens (already used in the code): primary `#1E3A5F`, accent green `#16A34A`, background `#F8FAFC`, text `#0F172A`, muted `#475569`, border `#CBD5E1`, danger `#DC2626`, warning `#B45309`. Fonts: Inter-style sans + mono for codes/numbers. Min touch target 44px on mobile.

## Tech stack
Frontend: React 19, TypeScript, Vite 8, Tailwind CSS 4, lucide-react, `xlsx`, `motion`. Backend (`server/`): Express 4, Knex (+mysql2 / better-sqlite3), bcryptjs, jsonwebtoken, zod, helmet, multer. Tests: vitest + supertest.

## Commands
```
npm ci                 # install
npm run dev            # vite on :3000, proxies /api -> :3001
npm run server:dev     # API on :3001 (SQLite by default; SEED_DEMO=true for demo data)
npm test               # API tests (vitest)
npm run server:build   # bundle API -> dist-server/ ; npm start runs it
npm run lint           # tsc --noEmit  (must stay clean)
npm run build          # vite build    (must stay passing)
```

## Backend (server/)
- `app.ts` wiring (helmet/CSP, CORS, origin check, rate limits, static SPA), `config.ts` (env validation; refuses weak prod config), `schema.ts` (append-only migrations), `seed.ts` (system data always; demo data only if SEED_DEMO; first admin from BOOTSTRAP_ADMIN_*).
- `routes/auth.ts` login/refresh/logout/sessions/change-password; `collections.ts` generic scoped CRUD for geography/products/distributors; `routes/users.ts` users+roles (escalation guards); `routes/forms.ts` form config (web edits -> mobile); `routes/reports.ts` server-side recomputation of totals + GPS; `routes/photos.ts`; `routes/bootstrap.ts` one-call hydrate.
- Entities are stored as JSON documents (`data` column) with indexed scope columns, so the frontend types in `src/types/infrastructure.ts` are preserved exactly.
- Frontend: `src/api/client.ts` (token in memory, single-flight refresh), `src/api/useCollection.ts` (drop-in for useState that persists via API), `src/hooks/useFormConfig.ts`, `src/types/formConfig.ts`. Seed data (`data/seedInfrastructure.ts`) is **server-only**; never import it in client code.

## Architecture (src/)
- `App.tsx` — owns session + all collections (loaded from `/api/bootstrap`; each master collection persists via `useCollection`). Handles login, shell (sidebar/top bar), toast, and routing via `activePage` (no router lib).
- `types/infrastructure.ts` — every domain type. Hierarchy: City → Territory → Location → Sub-location → Shop; Distributor linked to Territory; ProductGroup (A/B) → Product.
- `components/auth/LoginPage.tsx` — Web Portal / Mobile Browser sign-in toggle.
- `components/overview/` dashboard; `geography/` (cities…shops CRUD, one 2.2k-line file); `distributors/`; `products/` (+Excel import modal); `users/` (users + roles/permissions); `forms/` (audit forms page + the two mobile audit forms); `reports/`; `mobile/AuditorMobilePWA.tsx` (auditor shell); `common/StatusBadges.tsx` (badges, formatPKR, map/coordinate picker).
- Auditor scoping: an auditor sees only `assignedTerritoryIds` / `assignedCityIds` (done in `AuditorMobilePWA`).
- Drafts of in-progress audits persist in `localStorage` (distributor + retail forms).

## Business rules to preserve
- Total CTNs = qtyInCtn + qtyInBox / boxesPerCtn; Stock value = (qtyInCtn × boxesPerCtn + qtyInBox) × pricePerBoxRs. Keep full precision; round only for display.
- Product master fields (boxes/CTN, unit/box, price) are locked on the audit form; auditor enters qty, dispatch date, stacking, remarks. Same product may have multiple entries.
- GPS compared to registered coordinates with Haversine (`calculateDistanceMeters`); mismatch flags for review, never auto-proves misconduct.
- Sign-in surfaces: by default web users sign in on Web and mobile users on Mobile. An administrator can open the other surface per user (`canLoginFromMobile` for web users, `canLoginFromWeb` for mobile users) or per role (role surface `Dual (Web + Mobile)`, or the matching surface). Enforced in `server/routes/auth.ts` (`surfaceAllowed`), at login and at every refresh.
- What a user sees depends on permissions, not on the surface: any `web.*` permission (managers/admins) = the full portal on desktop AND phone; no `web.*` permission (field auditors) = audit workspace (forms + plans + account) on both, with Places/Distributors tabs controlled by `mobile.territories.view` / `mobile.catalog.browse`. Server RBAC and territory scoping apply regardless.

## Testing (both surfaces, every major change)
1. `npm run lint && npm run build`.
2. Playwright (preinstalled; `NODE_PATH=$(npm root -g)`) screenshots at **390×844 (isMobile, touch)** and **1440×900**; check no horizontal overflow (`documentElement.scrollWidth - clientWidth == 0`) and no console errors. Helper pattern: see `PROJECT_STATUS.md` → "Test harness".
3. Start API with `SEED_DEMO=true` (see /tmp/up.sh pattern: `SEED_DEMO=true SQLITE_FILE=/tmp/agdata/ag.sqlite DATA_DIR=/tmp/agdata PORT=3001 npx tsx server/index.ts`) then vite. Demo logins: web admin `abdul.rehman` / `Admin@2026`; auditor `bilal.cheema` / `Aud@103` (mobile only). Demo data is refused in production.

## Known constraints
- The sandbox cannot reach external tile servers, Prisma binaries, or run MySQL/Docker daemon; tests use SQLite. The MySQL path (compose) must be smoke-tested on a real host.
- Do not commit `.env*` (only `.env.example`).
- Work on branch `claude/audit-and-mobile-desktop-split`; do not push to `main` without the owner's say-so.

## Custom forms, plans, analytics (added)
- **Custom forms**: managers (`web.forms.manage`) build forms in Audit Forms → "New form" (`CustomFormBuilder`). Target type is `distributor` | `subLocation` | `shop`. Definition lives in `form_configs.config`, metadata in `audit_forms.data` (`kind:'custom'`). Every auditor can use every active form; scope is by territory only. Submissions go to `audit_submissions` via `POST /api/submissions` (server validates answers, recomputes GPS). Codes `AUD-CUS-YYYY-NNNNN`. Forms with submissions cannot be deleted, only turned off; saved question keys are immutable.
- **Plans** (`server/routes/plans.ts`, `MobilePlans.tsx`): auditor picks date → form(s) → targets (distributor / area with optional shop subset / shop) → saves; "Start plan" shows a checklist; each item opens its form pre-targeted and the submit carries `planId`/`planItemId` so the item completes automatically. Skipping needs a reason.
- **Analytics & Review** (`routes/analytics.ts`, `components/analytics/`): `GET /api/analytics/summary` (managers only, territory-scoped) feeds KPIs, charts, auditor performance, stock, retail, per-field stats of custom forms, plan compliance, GPS exceptions, Excel export. Review queue approves/rejects/flags distributor, retail and custom audits (note required to reject/flag).
- Tests: `server/test/custom.test.ts` (28 API tests total).

## Maps and live location (added)
- `GOOGLE_MAPS_API_KEY` (server env) reaches the client through `/api/bootstrap` (`mapsApiKey`); `components/maps/GoogleMap.tsx` loads Google Maps and falls back to a list with Google Maps "Directions" links when there is no key. Manager page: `maps/MapLivePage.tsx` (nav "Map & Live Locations"). Review queue shows a registered-vs-actual location map. Mobile: plan map + Directions buttons.
- Tracking (`server/routes/tracking.ts`, `hooks/useLiveSharing.ts`): `POST /api/tracking/ping` is accepted ONLY while the auditor has a plan In Progress (server-enforced); `GET /api/tracking/live` and `/trail` are manager-only and territory-scoped. Never track the manager's preview frame (only `variant==='fullscreen'`). Tests: `server/test/custom.test.ts` (31 total).

## mobile-apk-test/ (Android test app, separate)
- Standalone auditor-only Capacitor project (own package.json, README). Its `src/` holds COPIES of the auditor screens from the main `src/` plus a native API client (`src/api/client.ts`: configurable server address, refresh token held by the app) and `NativeLogin`/`App.tsx`. Excluded from the main lint/build/Docker. Server support: opt-in `client:'native'` on login/refresh/logout (`server/routes/auth.ts`), mobile surface only; needs `CORS_ORIGINS=http://localhost,https://localhost`. When auditor screens change in the main app, re-copy them into `mobile-apk-test/src`.
