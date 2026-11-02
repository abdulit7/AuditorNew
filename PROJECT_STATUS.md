# PROJECT_STATUS.md

Last updated: 2026-11-01 · Branch: `claude/audit-and-mobile-desktop-split` (base `bf08154`)


## 0. Current state (read first)
- **Backend exists** (`server/`): MySQL 8 (Knex) / SQLite, JWT access + rotating httpOnly refresh cookie, per-device sessions, lockout, bcrypt, server-side RBAC + territory scoping, server-recomputed totals + GPS, private photo upload, idempotent report submit, activity log. 22 API tests pass (`npm test`).
- **Frontend is wired to the API**: real login (surface rules server-side), session restore on reload, every master collection persists (`useCollection`), reports + photos submitted through the API, seed data no longer shipped to browsers.
- **Web -> mobile form sync (owner's main requirement) works**: Audit Forms page has a settings editor (labels, show/hide, required, options, photo + GPS rules, turn form on/off); phones re-download config on foreground/online/5 min. Core qty fields are locked server-side. Verified end-to-end in a browser.
- Retail form no longer pre-fills invented answers (was 5/8/Good/20/Yes/"Everything is fine.").
- Deployment: `Dockerfile`, `docker-compose.yml` (MySQL 8 + app + Caddy HTTPS), `DEPLOY.md`. Prod bundle smoke-tested (headers, SPA, bootstrap admin, refuses SEED_DEMO). **Not run here:** MySQL itself and the Docker build (no daemon/MySQL in the sandbox) — smoke-test on the real host first.

## 1. Audit of the existing project (done)
Repo has 35 files, ~12.8k lines of TSX, single initial commit. `npm ci`, `tsc --noEmit` and `vite build` all pass at baseline (single 1 MB JS chunk).

### What exists and works
| Area | Status |
|---|---|
| Login (Web Portal / Mobile Browser toggle, role/surface rules, inactive check) | Works (client-side) |
| Dashboard: KPI cards, distributors by city, audits by auditor, shops by territory, GPS-match split | Works, looks good on desktop |
| Geography CRUD: cities, territories, locations, sub-locations, shops, cascading filters, coordinate picker | Works (in memory) |
| Distributors: setup/owner/CNIC, city+territory, group links, per-product Active/Inactive, detail view | Works (in memory) |
| Product groups A/B, products CRUD, delete/restore, Excel import modal (xlsx) | Works (in memory) |
| Users & Roles: web/mobile users, permissions matrix, territory/city/group assignment | Works (in memory) |
| Audit forms page, Distributor Product Audit form (multi-entry per product, live CTN/value calc, photos, drafts) | Works, GPS is fake (see below) |
| Retail Market Shop Audit form (city→sub-location, per-shop popup, ratings, photos, drafts) | Works, GPS falls back to fake |
| Audit Reports page (distributor + retail), filters | Works |
| Auditor scoping to assigned territories | Works |

### Data layer reality
- **No backend, no database, no API.** All data is React state seeded from `src/data/seedInfrastructure.ts` and **resets on refresh** (only audit drafts use `localStorage`).
- `express`, `@google/genai`, `dotenv` are installed but unused. `GEMINI_API_KEY` in `.env.example` is not used by any code.
- Therefore "preserve existing database/APIs" = preserve the in-memory model + types; a real persistence layer is still to be built (REMAINING_TASKS P1).

### Findings (bugs / risks)
| # | Severity | Finding | Where |
|---|---|---|---|
| F1 ✅ | **Critical** | Distributor audit GPS is **fabricated**: even when the device returns real coordinates they are replaced by `distributor.lat + 0.00012` (or `+0.0042`); on failure/denied it also fabricates. `simulateAtDistributorLocation` is hard-wired `true`, so every audit "matches". Radius hardcoded 150 m. | `DistributorProductAuditMobileForm.tsx` ~L209-270, ~L430-445; `AuditorMobilePWA.tsx` L108-111; `AuditFormsAndReportsPage.tsx` L262 |
| F2 ✅ | **Critical** | Retail shop audit falls back to `shop.lat + 0.00008` "accuracy 8 m" when GPS fails → fake "matched". | `RetailMarketShopAuditMobileForm.tsx` ~L443-470 |
| F3 ✅ | High | `handleMobileVerifyShopGPS` marks a shop "GPS Verified, ±6 m" **without reading the device**, and an auditor can overwrite master shop coordinates status (SRS: auditors must not modify registered coordinates). | `AuditorMobilePWA.tsx` L214-224 |
| F4 ✅ | High | Passwords stored/compared in plain text in the browser; login page **pre-fills admin credentials** (`abdul.rehman` / `Admin@2026`) and lists one-click demo accounts with passwords. | `LoginPage.tsx`, seed data |
| F5 ✅ | High | No persistence; every refresh loses all masters, users, submitted reports. | `App.tsx` |
| F6 ✅ | High | Mobile experience is a **440 px phone-frame mockup** (`border-2`, `min-h-[780px] max-h-[850px]`) nested inside a second app header; section tabs wrap into 3 rows; bottom action bar clipped at the fold on 390×844. | `AuditorMobilePWA.tsx` ~L344-400 |
| F7 ✅ | Medium | Mobile "Login Tester" form and "Active Auditor" selector (testing aids) live inside the production mobile component. | `AuditorMobilePWA.tsx` |
| F8 ✅ | Medium | `Math.random()` report codes (`AUD-DST-2026-###`) can collide. | both forms |
| F9 | Medium | No code-splitting (1 MB bundle); 2k-line single files (`GeographyPages`, `DistributorsPage`, forms). | build |
| F10 | Low | Unused deps (`@google/genai`, `express`, `dotenv`), duplicate `package copy.json`. | root |
| F12 ✅ | Critical | Product pick pre-filled fake audit values (see log). | `DistributorProductAuditMobileForm.tsx` `handlePickProduct` |
| F11 | Low | Map picker is a fake SVG grid, not a real map (acceptable offline; SRS wants a real map). | `StatusBadges.tsx` |

## 2. Baseline screenshots (before changes)
Desktop 1440×900: dashboard is clean and usable. Mobile 390×844: framed phone inside page, duplicate headers, wrapped tab pills, clipped bottom bar. No horizontal overflow on either.

## 3. Work log
- [x] Inspect repo, install, typecheck, build, baseline screenshots
- [x] CLAUDE.md, PROJECT_STATUS.md, REMAINING_TASKS.md created
- [x] **F1/F2/F3 fixed** — real device GPS only (`src/utils/geolocation.ts`); distributor audit shows live GPS banner (accuracy, Try again), fresh fix at submit, no fabricated fallback; retail audit blocks save + retry on GPS failure; fake "Verify Shop GPS" replaced by read-only distance check. Low accuracy (>100 m) or distance >150 m => `locationMatched=false` (flag for review). Verified in browser: granted => "±12 m" from the browser, denied => clear message + retry.
- [x] **F8** unique report codes (`makeReportCode`)
- [x] **F4 (partial)** login: demo accounts + prefilled admin creds only in `import.meta.env.DEV`; defaults to Mobile Browser on phones; 44 px inputs
- [x] **F6/F7** mobile shell rebuilt: `AuditorMobilePWA variant="fullscreen"` for real phone sessions (desktop "Auditor Mobile View" keeps `frame` preview). One compact app bar (safe-area), 4-tab bottom bar (Audit / Places / Distributors / Account), geography levels as ONE scrollable chip row, Account tab with logout, real `navigator.onLine` banner, dead login-tester removed. Verified 360×740, 390×844, 430×932: no horizontal overflow, bottom bar inside viewport.
- [x] **F12 (new, critical)** Distributor audit form auto-filled invented data on product pick (2 CTN / 6 box / dispatch 30/10/2026 / stacking Yes / remarks "Good Stock") and silently defaulted blanks. Now all fields start empty; qty, dispatch date and stacking are required; no silent defaults.
- [x] Full-precision CTN/value (display rounds only); product list is stacked cards on phones (table kept >= md); sticky totals + Submit bar once a product is added; step labels collapse on narrow screens.
- [x] E2E on 390×844: two batches of the same product (10 CTN+10 box, 5 CTN+6 box @ Rs.360, 12 box/CTN) => 10.83 + 5.50 = 16.33 CTN, Rs. 46,800 + 23,760 = Rs. 70,560; submit => report `AUD-DST-2026-…`.
- [x] Desktop regression: all 14 portal pages load, no overflow, no console errors; lint + build pass.

## 4. Test harness (Playwright)
Dev server: `npx vite --port=3000 --host=127.0.0.1 &`. Script pattern: launch chromium with `viewport {390×844}, isMobile, hasTouch, permissions ['geolocation'], geolocation {32.1877, 74.1945}`; open `http://127.0.0.1:3000`; click "Mobile Browser"; fill `#login-username`/`#login-password`; screenshot; assert `scrollWidth - clientWidth === 0`. Use `NODE_PATH=$(npm root -g)`.

## 5. Earlier separate scaffold (not part of this repo)
Before the repo was shared, a from-scratch Express/Prisma/MySQL backend + React client was started in `/home/claude/audit-app` (server: auth, RBAC, geography, distributors, products, audits, GPS/Haversine, reports; 11 passing unit tests). It lives only in the session sandbox. It is intended as the **reference for the P1 persistence layer**, not a replacement of this app.

## Update: custom forms, plans, analytics
Done and tested (28 API tests, desktop 1440x900 + mobile 390x844 Playwright flows, lint+build clean): custom form builder, generic mobile form runner, audit plans (create/start/checklist/skip/complete), manager Analytics & Review page with Excel export. Not yet done: plan editing (delete + recreate while Planned), offline outbox for custom submissions, custom-form rows on the Audit Reports page (they appear in Analytics → Review queue).

## Update: role/surface access
Managers/admins: full portal on web and on a phone. Auditors: forms + plans on web (centred column) and phone; Places/Distributors tabs follow role permissions (fresh-DB seed turns them off for the two auditor roles; existing databases keep their saved role settings). New per-user flag `canLoginFromWeb` (migration 003) + role surface Dual. 30 API tests; browser checks for auditor web/mobile and manager mobile/admin web: no overflow, no console errors.

## Update: maps + live location
Built and tested with Google Maps selected as provider. The sandbox cannot reach Google, so the real map rendering was NOT visually verified here (fallback list, pings, live list, privacy rule and banner were). Needs a real API key + HTTPS to verify tiles, pins, drawn routes and the Content-Security-Policy. Not done: click-on-map coordinate picker for entering distributor/shop locations (the existing picker is still the schematic one); background tracking when the phone screen is off (not possible in a browser).
