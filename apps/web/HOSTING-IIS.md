# Hosting Investoyard web on IIS (design review)

Next.js is a **Node app**, so IIS can't execute it directly. The reliable way is:
**run the production Next server on a local port, and put IIS in front as a reverse proxy.**
This keeps every feature working (SSR, all routes, `?lang=`).

> Quick alternative without IIS: run the server (steps 1–2) and have your sir open
> `http://<SERVER-IP>:4300` directly on the LAN. IIS is only needed for a clean port-80 URL.

---

## Step 1 — Build the production app
Stop any `npm run dev` / preview server first (frees port 4300, avoids a corrupt `.next`).
```powershell
cd D:\Investoyard\apps\web
npm run build
```

## Step 2 — Start the production server (keep it running)
```powershell
npm run start      # serves on http://localhost:4300
```
Leave this window open for a quick demo. To keep it running without a terminal, use NSSM or PM2:
```powershell
npm i -g pm2
pm2 start "npm run start" --name investoyard-web
pm2 save
```

## Step 3 — Install the IIS proxy modules (one-time)
IIS needs two free Microsoft modules:
1. **URL Rewrite 2.1** — https://www.iis.net/downloads/microsoft/url-rewrite
2. **Application Request Routing (ARR) 3.0** — https://www.iis.net/downloads/microsoft/application-request-routing

After installing ARR: open **IIS Manager → (server node) → Application Request Routing Cache →
Server Proxy Settings → tick "Enable proxy" → Apply.**

## Step 4 — Create the IIS site
1. Make a folder, e.g. `C:\inetpub\investoyard`.
2. Put the `web.config` below in it (this is the proxy rule).
3. IIS Manager → **Sites → Add Website**
   - Site name: `investoyard`
   - Physical path: `C:\inetpub\investoyard`
   - Binding: http, port **80** (or 8080 if 80 is taken), host name blank.
4. Browse to `http://<SERVER-IP>/` — IIS forwards everything to the Next server on 4300.

### `web.config` (place in `C:\inetpub\investoyard`)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="NextJsReverseProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:4300/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering><requestLimits maxAllowedContentLength="52428800" /></requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

## Step 5 — Let your sir reach it
- Same network: share `http://<SERVER-IP>/` (find IP with `ipconfig`).
- Open the firewall port once if needed:
```powershell
New-NetFirewallRule -DisplayName "HTTP 80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

---

## Notes
- The site runs on **mock/seeded data** (the API isn't hosted yet) — perfect for a design review.
- If you change code, re-run **Step 1 + 2** (rebuild + restart). Never run `npm run build` while a
  dev/prod server is using the same `.next` folder — stop it first.
- For a public link instead of LAN (so your sir can view from anywhere), Vercel is one command —
  see `DEPLOY.md`. That needs your Vercel login.
