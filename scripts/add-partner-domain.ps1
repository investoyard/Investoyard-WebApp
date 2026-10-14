<#
.SYNOPSIS
  Bind a white-label partner's domain to the Investoyard site and get it a
  certificate, in one command.

.DESCRIPTION
  Five steps that are otherwise done by hand, in an order that matters:

    1. confirm DNS for the host actually reaches this server
    2. add the HTTP (port 80) binding        <- win-acme validates over this
    3. run win-acme                          <- issues the cert AND binds 443
    4. verify the HTTPS binding carries SNI
    5. remind you to set customDomain in admin

  THE ORDER IS THE WHOLE POINT. HTTP-01 validation fetches
  http://<host>/.well-known/acme-challenge/..., so the hostname has to be
  served on port 80 by THIS site before a certificate can exist. Run win-acme
  first and it fails with an error that reads like a DNS problem.

  Checked when this was written: none of the site's rewrite rules intercept
  /.well-known/ -- the four fallbacks are scoped to ^ipos/ ^apply/ ^print/
  ^news/ and html-no-cache is an outbound header rule. A broad rewrite is the
  usual reason win-acme fails on a static site, so re-check that if validation
  starts failing after a web.config change.

.PARAMETER Domain
  The partner's hostname, e.g. ipo.partner.com. Bare host -- no scheme, no path.
  (Named -Domain and not -Host because $Host is a reserved PowerShell variable.)

.PARAMETER Apply
  Actually make changes. Without it this reports what it would do.

.EXAMPLE
  .\add-partner-domain.ps1 -Domain ipo.partner.com
  .\add-partner-domain.ps1 -Domain ipo.partner.com -Apply

.NOTES
  MUST RUN ELEVATED -- IIS bindings and certificate installation both need it.
  That is also why this is a script you run rather than a button in admin.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Domain,
  [string] $SiteName = 'Investoyard',
  [string] $WacsPath = 'C:\win-acme\wacs.exe',
  [switch] $Apply
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "  $m" }
function Ok($m)  { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Bad($m) { Write-Host "  [fail] $m" -ForegroundColor Red }

$Domain = $Domain.Trim().ToLower() -replace '^[a-z]+://', '' -replace '/.*$', ''
Write-Host ""
Write-Host "Partner domain: $Domain" -ForegroundColor Cyan
$mode = if ($Apply) { 'APPLY' } else { 'dry run' }
Write-Host "Site: $SiteName   Mode: $mode"
Write-Host ""

# -- elevation --------------------------------------------------------------
# Checked BEFORE anything is changed, so a refusal costs nothing -- the same
# shape db.ps1 register uses.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $elevated) {
  Bad "Not elevated. IIS bindings and certificate install both require an administrator shell."
  exit 1
}
Ok "Running elevated."

Import-Module WebAdministration -ErrorAction Stop

# -- the site must exist, and we must not guess which one -------------------
# NOTE: on this box the pool named 'Investoyard' serves the STATIC site and
# 'InvestoyardAPI' serves the API. Binding a partner domain to the API would
# serve JSON to their customers.
$site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if (-not $site) {
  Bad "No IIS site named '$SiteName'. Available: $((Get-Website | Select-Object -ExpandProperty Name) -join ', ')"
  exit 1
}
Ok "Site '$SiteName' found (physical path: $($site.physicalPath))."

# -- 1. does DNS reach us? --------------------------------------------------
try {
  $resolved = (Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop |
               Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress) -join ', '
  if ($resolved) { Ok "DNS A record: $resolved" }
  else { Warn "No A record returned yet." }
} catch {
  Warn "DNS does not resolve yet ($($_.Exception.Message))."
  Warn "win-acme WILL FAIL until the partner's A record is live and propagated."
}

# -- 2. HTTP binding --------------------------------------------------------
$http = Get-WebBinding -Name $SiteName -Protocol http -ErrorAction SilentlyContinue |
        Where-Object { $_.bindingInformation -like "*:80:$Domain" }
if ($http) {
  Ok "HTTP binding already present."
} elseif ($Apply) {
  New-WebBinding -Name $SiteName -Protocol http -Port 80 -HostHeader $Domain
  Ok "HTTP binding added (*:80:$Domain)."
} else {
  Say "would add HTTP binding  *:80:$Domain"
}

# -- 3. win-acme ------------------------------------------------------------
if (-not (Test-Path $WacsPath)) {
  Bad "win-acme not found at $WacsPath. Install it or pass -WacsPath."
  Say "Download: https://www.win-acme.com/  (unzip to C:\win-acme)"
  if ($Apply) { exit 1 }
} elseif ($Apply) {
  Say "Running win-acme (HTTP-01 validation, IIS installation)..."
  # --installation iis makes win-acme create/refresh the HTTPS binding itself,
  # which is why the per-domain binding is barely extra work on top of TLS.
  & $WacsPath --target manual --host $Domain --siteid $site.Id `
              --validation filesystem --webroot $site.physicalPath `
              --installation iis --installationsiteid $site.Id `
              --accepttos --notaskscheduler:$false
  if ($LASTEXITCODE -ne 0) {
    Bad "win-acme exited $LASTEXITCODE. The certificate was not issued."
    Say "Most common causes: DNS not live yet, port 80 not reachable from the internet,"
    Say "or a rewrite rule swallowing /.well-known/acme-challenge/."
    exit 1
  }
  Ok "win-acme completed."
} else {
  Say "would run: $WacsPath --target manual --host $Domain --siteid $($site.Id) --installation iis"
}

# -- 4. HTTPS binding + SNI -------------------------------------------------
# SNI is not optional once a SECOND certificate shares port 443: without it the
# bindings collide and one partner gets another partner's certificate.
$https = Get-WebBinding -Name $SiteName -Protocol https -ErrorAction SilentlyContinue |
         Where-Object { $_.bindingInformation -like "*:443:$Domain" }
if ($https) {
  $sni = $https.sslFlags -band 1
  if ($sni) { Ok "HTTPS binding present with SNI enabled." }
  else {
    Warn "HTTPS binding present but SNI is OFF (sslFlags=$($https.sslFlags))."
    if ($Apply) {
      Set-WebBinding -Name $SiteName -BindingInformation $https.bindingInformation `
                     -PropertyName sslFlags -Value 1
      Ok "SNI enabled."
    } else { Say "would set sslFlags=1 on the HTTPS binding" }
  }
} elseif ($Apply) {
  Warn "No HTTPS binding found after win-acme -- check its output above."
} else {
  Say "would expect win-acme to create the HTTPS binding"
}

# -- 5. the step that is NOT on this server ---------------------------------
Write-Host ""
Write-Host "Remaining, in admin:" -ForegroundColor Cyan
Say "Set this partner's Custom domain to '$Domain' (Tenants -> the partner -> Branding & domain)."
Say "That is what makes the site render THEIR brand; until it is set the"
Say "domain serves the default Investoyard brand."
Say ""
Say "Then press 'Check domain' on that page to confirm all four layers."
if (-not $Apply) { Write-Host ""; Warn "Dry run - nothing was changed. Re-run with -Apply." }
Write-Host ""
