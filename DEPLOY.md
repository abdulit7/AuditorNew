# Deploying AuditGrid to the internet

One container serves the management web portal (desktop and phone browsers) **and** the API used by the auditor mobile app (same origin for the web portal), backed by MySQL 8. Every user signs in with their own credentials and gets their own session.

## Fastest public test (no domain, no open ports): Cloudflare Tunnel
```bash
cp .env.example .env     # fill JWT_ACCESS_SECRET, DB_PASSWORD, MYSQL_ROOT_PASSWORD, BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d --build db app
cloudflared tunnel --url http://localhost:3001      # prints an https://….trycloudflare.com URL
```
(Publish port 3001 locally by adding `ports: ["127.0.0.1:3001:3001"]` to the `app` service, or run `cloudflared` in the compose network.) The tunnel gives you HTTPS, which the secure session cookie requires.

## Production on a VPS with your own domain (automatic HTTPS)
1. Point an `A` record (e.g. `audit.yourcompany.pk`) at the server; open ports 80 and 443.
2. `cp .env.example .env` and set:
   - `DOMAIN`, `MYSQL_ROOT_PASSWORD`, `DB_PASSWORD`
   - `JWT_ACCESS_SECRET` → `openssl rand -base64 48`
   - `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` (12+ chars, upper+lower+digit) — creates the first administrator **once**, when the users table is empty.
3. `docker compose up -d --build` — Caddy obtains and renews the TLS certificate.
4. Sign in as the administrator, then create managers/auditors under **Users**, set up cities → shops, distributors and products. Change the bootstrap password from the Account page afterwards.

Production refuses to start if `JWT_ACCESS_SECRET` is weak/missing, `COOKIE_SECURE` is false, or `SEED_DEMO` is on.

## How security works
- **Passwords**: bcrypt (cost 12); policy enforced server-side; 5 wrong attempts lock the account for 15 min; identical error for unknown user vs wrong password.
- **Sessions**: each sign-in creates its own session row (per device). Access token = short-lived JWT (15 min, memory only). Refresh token = random, stored hashed, rotated on every use, delivered as an `httpOnly; Secure; SameSite=Strict` cookie. Re-use of an old refresh token revokes that session. Logout, password change, role/status change, or an admin "revoke sessions" ends sessions immediately (the server re-checks the session on every request).
- **Surface rules** (enforced on the server): mobile-only users cannot sign in on web; web users need `canLoginFromMobile` for mobile.
- **Authorization**: permissions come from the role; everyone except full administrators is limited to their assigned territories/cities/groups on **every** query and write. Managers cannot grant permissions they don't hold.
- **Data integrity**: audit totals, stock value and GPS distance are recomputed on the server from the product/distributor/shop master — the phone cannot dictate them. Retried submissions are idempotent.
- **Photos**: type verified from file bytes, size-capped, random server-side filenames, served only to the uploader and managers.
- **Transport/headers**: HTTPS + HSTS, strict CSP, rate limits, cross-origin write blocking, request size limits. The database is not exposed publicly.

## Operations
- **Backups**: `docker compose exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" auditgrid' > backup.sql` daily, plus the `uploads` volume (photos). Test a restore.
- **Update**: `git pull && docker compose up -d --build` (migrations run automatically at start).
- **Logs**: `docker compose logs -f app`. Security events (logins, failures, lockouts, form edits, exports) are in the `activity_log` table.
- **Scaling note**: rate limiting is per process; run one app container (fine for hundreds of auditors) or move limits to the proxy.

## Maps (pins, routes, live locations)
The default map is **MapLibre + OpenFreeMap** (no key); it falls back to OpenStreetMap tiles. Route lines go through `POST /api/routing/route` (OSRM, or OpenRouteService via `OPENROUTESERVICE_API_KEY`, kept on the server). Optional Google Maps: set `GOOGLE_MAPS_API_KEY`. Production refuses to start when MySQL is unreachable.

Optional Google Maps upgrade: in Google Cloud Console create a project, **enable billing**, enable **Maps JavaScript API**, create a key **restricted by HTTP referrer** (e.g. `https://audit.example.com/*`), set a budget alert, then put it in `.env` as `GOOGLE_MAPS_API_KEY=...` and restart. The server adds Google to the Content-Security-Policy only when a key is set. The mobile app needs location permission (and HTTPS for any browser-based GPS).

Live locations: an auditor's app shares its position only while one of their plans is **In Progress** (the server refuses positions otherwise). History is kept 30 days.
