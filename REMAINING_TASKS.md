# REMAINING_TASKS.md

Ordered. Pick up from the first unchecked item. Update after every work block.

## Done (see PROJECT_STATUS §0, §3)
Real GPS only; no prefilled audit data (distributor + retail); unique report codes; full-screen mobile shell; backend + JWT sessions + RBAC; DB persistence; server-driven forms + web editor; photo compression + private upload; Docker/HTTPS deploy files; change-password UI.

## P0 — before going public
- [ ] Run `docker compose up` on the real server; smoke-test MySQL (migrations are portable Knex but only SQLite was executed here). Test backup + restore.
- [ ] Change/rotate all secrets; confirm HTTPS + cookie flags in the browser devtools.
- [ ] Offline outbox on mobile: queue submissions (with `clientRequestId`, already idempotent server-side) in IndexedDB and send when online. Today submit needs a connection; drafts are kept locally.
- [ ] Users page: "Sign out all devices" button (API `POST /api/users/:id/revoke-sessions` exists) and show active sessions on Account tab (`GET /api/auth/sessions` exists).
- [ ] Admin-configurable GPS radius is in the form editor (distributor); add a per-form audit of `activity_log` viewer page.

## P1 — Mobile polish (compare to design samples in chat)
- [ ] When a form is open on a phone, hide the shell app bar/bottom tabs (form's blue header becomes the bar) — currently two headers stack.
- [ ] Distributor form: map card ("Johar Town, Lahore" + View Map) using OSM tiles (CSP `img-src` must allow the tile host) + product dropdown thumbnails.
- [ ] Retail form: camera capture screen, "Shops in Block A (3)" table styling, "1 / 3 Shops Audited" bar, Audit Records page (desktop) per sample. Remove the "Back = submit" semantic (done: submit now happens on the Submit button).
- [ ] Searchable pickers for distributor/shop; unify palette (forms royal blue vs shell navy).
- [ ] PWA manifest + icons + service worker + update prompt; cache bootstrap for offline start.
- [ ] Dispatch Date as a real date option in form config (currently free text because legacy data is text).

## P1 — Desktop
- [ ] Reports: review workflow UI (Approve/Reject/Flag) — API `PATCH /api/reports/:kind/:id/review` exists; A4 print/PDF/Excel export.
- [ ] Table-first list pages (sort, filters, pagination); code-split pages (`React.lazy`, bundle ~1 MB).
- [ ] Split 2k-line files; real map in coordinate picker.

## P2
- [ ] Rate limiting is per process; move to proxy if running >1 app instance.
- [ ] Photos are on a local volume; move to object storage if multiple servers.
- [ ] Component/e2e tests (Playwright smoke for both viewports in CI).

## New backlog
- Edit a saved plan (server `PUT /plans/:id` exists; no UI).
- Show custom submissions on the Audit Reports page + per-submission print/export.
- Offline outbox for custom submissions and plans.
- Per-form auditor restrictions (currently every auditor may use every form).
- Dedicated permission key for custom audits (currently reuses mobile.audit.*).

- [ ] Smoke-test MySQL, the Docker image and the APK on a real host; check real OpenFreeMap tiles and the production CSP with a real network.
- [ ] Self-host PMTiles (Pakistan) for heavy production map use.
- [ ] Optional: a dedicated permission key for editing forms vs. building them; per-form auditor restrictions.
