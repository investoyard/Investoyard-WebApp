# Deploying Investoyard (permanent links)

The temporary tunnel link is fine for a quick look, but for durable shareable links use these.
**Both require a one-time login to YOUR account** (Vercel / Expo) — they can't be done on your behalf.

## A. Website → Vercel (permanent public URL)

Gives `https://investoyard-xxx.vercel.app` (and you can attach investoyard.com later).

```
npm i -g vercel
cd "D:\Investoyard\apps\web"
vercel            # first run: opens browser to log in, then deploys a preview
vercel --prod     # production deployment → your public URL
```
Vercel auto-detects Next.js. In the Vercel project settings:
- **Root Directory:** `apps/web`
- **Environment variable:** `NEXT_PUBLIC_API_URL` = your API URL (once the API is hosted)

*(Until the API is hosted, the site falls back to mock data — same as now.)*

## B. Mobile → Expo EAS (installable Android APK)

Gives a downloadable `.apk` (and a link) you can install on any Android phone.

```
npm i -g eas-cli
cd "D:\Investoyard\apps\mobile"
eas login         # log in / create a free Expo account
eas build:configure
eas build -p android --profile preview   # builds in the cloud → returns an install link
```
- The **preview** profile (see `eas.json`) outputs an **APK** for internal distribution.
- For iOS / Play Store, use the **production** profile (needs Apple/Play developer accounts).
- Point the app at your API via `EXPO_PUBLIC_API_URL` in `eas.json` (currently the Android-emulator
  loopback `10.0.2.2`; change to your hosted API or LAN IP).

## C. Self-hosted full stack (Docker) — the turnkey option

One server with Docker runs everything: **web (nginx) + API + Postgres + Redis**. The web serves on
:80 and proxies `/api` to the API container (single origin — no CORS; the Host header flows through
so white-label domains resolve).

**1. Configure secrets**
```
cp deploy/.env.production.example .env.deploy    # then edit — passwords, JWT_SECRET, PII_VAULT_KEY
```

**2. Build & start**
```
docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d --build
```

**3. One-time database init** (order matters: schema → RLS role/policies → role password → seed)
```
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec api npx prisma db push
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec db  psql -U postgres -d investoyard -f /setup-rls.sql
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec db  psql -U postgres -d investoyard -c "ALTER ROLE investoyard_app WITH PASSWORD '<your APP_DB_PASSWORD>';"
docker compose -f docker-compose.prod.yml --env-file .env.deploy exec api npx prisma db seed
docker compose -f docker-compose.prod.yml --env-file .env.deploy restart api
```
Open `http://<server>/` — site + live API. Liveness probe for monitors: `GET /api/health`.

Notes:
- `prisma db push` uses `DIRECT_URL` (superuser) automatically; the app runs as `investoyard_app`
  (RLS-enforced, `NOBYPASSRLS`).
- Go-live env toggles (in `.env.deploy`): `SMS_PROVIDER` (real OTP SMS — disables the 123456 dev
  code), `KMS_KEY_ID` (PII vault via AWS KMS), `NSE_BASE_URL` + credentials in `/admin/rails-live`.
- Put TLS in front (Caddy/Traefik/ALB) and point white-label domains at the same web service.
- Mobile: set `EXPO_PUBLIC_API_URL=https://<your-domain>/api` in `eas.json`.

## D. Managed alternatives (no Docker)

- **Railway / Render / Fly.io** for the NestJS API + managed Postgres + managed Redis, or AWS (ap-south-1).
- Run `prisma db push`, `apps/api/prisma/setup-rls.sql`, and `npm run seed` against the hosted DB (same order as §C step 3).
- Set `NEXT_PUBLIC_API_URL` (web) and `EXPO_PUBLIC_API_URL` (mobile) to the hosted API URL.

## E. Database security (READ BEFORE GOING LIVE)

The **local dev** database uses `trust` auth — it accepts connections with **no password**
(that's why pgAdmin connects with a blank password locally). This is a dev-only convenience: the DB
listens on `localhost` only. **It must never be run this way in production.** Production closes every
one of these shortcuts, and the Docker pack in §C already enforces most of them.

**Checklist before go-live:**

1. **Strong, unique passwords** — set both in `.env.deploy` (never commit it):
   - `POSTGRES_PASSWORD` — the superuser (`postgres`), used only for migrations/admin.
   - `APP_DB_PASSWORD` — the app's runtime role (`investoyard_app`).

   The compose refuses to start if either is unset (`:?` guard). Password auth is **scram-sha-256**
   (the `postgres:16` image's default once a password is set) — not `trust`. After §C step 3's
   `ALTER ROLE … WITH PASSWORD`, no blank-password connection works.

2. **Keep the database off the public network.** In `docker-compose.prod.yml` the `db` service has
   **no published `ports:`** — only the `api` container reaches it over Docker's private network.
   Do **not** add a `ports:` mapping to `db` (or `redis`) on a public server. Verify with
   `docker compose ps` that only web `:80`/`:443` is exposed.

3. **Least privilege for the app.** The API connects as `investoyard_app` — a `NOSUPERUSER`,
   `NOBYPASSRLS` role. Row-Level Security keeps even that role from seeing across tenants without the
   per-request tenant context. `postgres` (superuser) is used only for `db push` / seed.

4. **TLS on the wire** — required when the DB is on a **separate host / managed provider**
   (AWS RDS, etc. enforce SSL): append `?sslmode=require` to `DATABASE_URL` / `DIRECT_URL`. Not
   needed for the single-box Docker setup where DB traffic never leaves the host.

5. **Admin access to the prod DB** — never open the DB port to the internet to use pgAdmin. Connect
   over an **SSH tunnel** to the server instead:
   ```
   ssh -L 5433:localhost:5432 user@your-server     # then point pgAdmin at localhost:5433
   ```
   (Map to `5432` inside the box if you temporarily publish the port on `127.0.0.1` only, or tunnel
   straight into the container's network.) Use the `POSTGRES_PASSWORD` you set.

6. **Also protect the rest** — `PII_VAULT_KEY`, `JWT_SECRET`, and Redis live in the same trust
   boundary. Set `RAIL_CALLBACK_AUTH=enabled` (signed exchange callbacks), keep `.env.deploy` off
   version control, and restrict who can `docker exec` into the host.

## F. Windows + IIS (static web + reverse-proxied API)

Host the static web export in **IIS** and reverse-proxy `/api` to the local Node API. The public
browse pages are a **build-time snapshot** of the DB; the dynamic pages (login, apply, **admin panel**)
call the API live via `/api`.

**Prerequisites (one-time):** install the IIS modules **URL Rewrite** and **Application Request
Routing (ARR)**, then enable proxying: IIS Manager → *(server node)* → *Application Request Routing
Cache* → *Server Proxy Settings* → tick **Enable proxy**.

1. **Run the data + API** (keep these running; make them Windows services for a real server):
   ```
   pwsh scripts/db.ps1 start          # Postgres :5433   (or your own Postgres)
   pwsh scripts/redis.ps1 start       # Redis :6379
   node apps/api/dist/main.js         # API :3000 (reads apps/api/.env: DATABASE_URL, REDIS_URL, …)
   ```
   Confirm: `curl http://localhost:3000/api/health` → `{"status":"ok",…}`.

2. **Configure the web build** — `apps/web/.env.production` (already present; not secret):
   ```
   NEXT_PUBLIC_API_URL=/api                    # browser → same origin, IIS proxies it
   API_INTERNAL_ORIGIN=http://localhost:3000   # build-time SSG fetches the live API
   ```

3. **Build the web with the API running** (so the static pages bake in real DB data):
   ```
   cd apps/web && npm run build       # outputs apps/web/out/ (incl. web.config with the /api proxy rule)
   ```

4. **Point the IIS site** at `apps/web/out`. Its `web.config` already contains the rewrite rule
   `^api/(.*)` → `http://localhost:3000/api/{R:1}` (needs ARR + URL Rewrite from the prerequisites).

5. Browse the site. The **admin panel, login and apply** work live against the DB immediately (they
   call `/api` at runtime). To refresh the **public browse pages** after catalog changes, rebuild:
   ```
   cd apps/web && rmdir /s /q .next\cache & npm run build     # re-snapshots the DB
   ```

Notes:
- Reverse proxy keeps the API on `localhost:3000` — **don't** bind the API or DB to a public address.
- Put HTTPS on the IIS site (a real cert) before exposing it; see §E for DB security.
- Mobile app: point `EXPO_PUBLIC_API_URL` at `https://<your-domain>/api`.

## Quick recap
| Target | Command | Result |
|---|---|---|
| Website (permanent) | `vercel --prod` in `apps/web` | public `*.vercel.app` URL |
| Android app | `eas build -p android --profile preview` | installable APK + link |
| **Everything (one server)** | `docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d --build` + §C step 3 | full live stack on :80 |
| Real data (managed) | host API+DB+Redis, set the two `*_API_URL` env vars | live everywhere |
