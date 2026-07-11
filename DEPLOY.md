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

## Quick recap
| Target | Command | Result |
|---|---|---|
| Website (permanent) | `vercel --prod` in `apps/web` | public `*.vercel.app` URL |
| Android app | `eas build -p android --profile preview` | installable APK + link |
| **Everything (one server)** | `docker compose -f docker-compose.prod.yml --env-file .env.deploy up -d --build` + §C step 3 | full live stack on :80 |
| Real data (managed) | host API+DB+Redis, set the two `*_API_URL` env vars | live everywhere |
