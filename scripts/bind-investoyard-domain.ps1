<#
.SYNOPSIS
  Bind investoyard.com + www.investoyard.com to the Investoyard static site,
  with a certificate, in one command.

.DESCRIPTION
  THE SITE MOVED FROM newipo.finwave.co TO investoyard.com ON 2026-10-15. This
  is the server half of that move. Run it BEFORE the web is rebuilt, and the
  reason is not tidiness:

    `npm run build` in apps/web IS the deploy -- it rewrites the live out/
    folder, and web.config ships inside it. That file carries a 301 from
    newipo.finwave.co to investoyard.com. So a build that lands before these
    bindings exist redirects every visitor to a host that does not answer.
    The site goes dark for everyone, on both domains.

  Order: this script -> verify -> rebuild the web -> verify both hosts.

  WHY THIS IS NOT add-partner-domain.ps1. That script ends by telling you to set
  the domain as a tenant's `customDomain`, which for our OWN host is exactly
  wrong -- AdminService.OUR_HOSTS refuses it, because a tenant matching the main
  site's host would take its branding and feature flags over for every visitor.
  This one also binds TWO hosts (apex + www) and prefers a certificate you
  already hold over issuing a new one. Different job, so a separate script.

.PARAMETER PfxPath
  A PKCS#12 bundle covering both hosts. Imported into LocalMachine\My if its
  thumbprint is not already there. You are prompted for the password; it is
  never written to disk, a log, or the console.

  Omit this if the certificate is already installed -- the script finds it by
  subject/SAN. Pass -UseWinAcme instead to issue a free auto-renewing one.

.PARAMETER UseWinAcme
  Issue via Let's Encrypt (win-acme) rather than importing a PFX. Worth
  preferring on this domain: investoyard.com resolves straight to this server
  with no proxy in front, so HTTP-01 validation reaches us, and win-acme renews
  itself -- a purchased bundle expires and needs a human who remembers.

.PARAMETER Apply
  Actually make changes. Without it, this reports what it would do and exits.

.EXAMPLE
  .\bind-investoyard-domain.ps1
  .\bind-investoyard-domain.ps1 -PfxPath D:\Investoyard\Investoyard_2026-27.pfx
  .\bind-investoyard-domain.ps1 -PfxPath D:\Investoyard\Investoyard_2026-27.pfx -Apply
  .\bind-investoyard-domain.ps1 -UseWinAcme -Apply

.NOTES
  MUST RUN ELEVATED. Elevation is checked before anything is touched, so a
  refusal costs nothing -- the same shape db.ps1 register uses.

  It only ever ADDS bindings. Nothing existing is modified or removed, so the
  finwave hosts keep serving throughout and can be retired on their own
  schedule, long after their 301 has been live.
#>
[CmdletBinding()]
param(
  [string]   $PfxPath,
  [switch]   $UseWinAcme,
  [string]   $SiteName = 'Investoyard',
  [string[]] $Hosts    = @('investoyard.com', 'www.investoyard.com'),
  [string]   $WacsPath = 'C:\win-acme\wacs.exe',
  [switch]   $Apply
)

$ErrorActionPreference = 'Stop'
function Say($m)  { Write-Host "  $m" }
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [fail] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "Bind the Investoyard domain" -ForegroundColor Cyan
Write-Host "Hosts: $($Hosts -join ', ')"
Write-Host "Site:  $SiteName   Mode: $(if ($Apply) { 'APPLY' } else { 'dry run' })"
Write-Host ""

# ---------------------------------------------------------------- elevation --
$principal = New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Bad "Not elevated. IIS bindings and certificate installation both require an administrator shell."
  Say "Open Windows PowerShell as administrator and run this again."
  exit 1
}
Ok "Running elevated."
Import-Module WebAdministration -ErrorAction Stop

# --------------------------------------------------------------- the site ----
# THE POOL NAMES ON THIS BOX ARE A TRAP: the pool called 'Investoyard' serves
# the STATIC site and 'InvestoyardAPI' serves the API. So the name alone is not
# enough confirmation -- binding our own domain to the API would serve JSON to
# every visitor. Confirm by PHYSICAL PATH, which cannot be coincidence.
$site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if (-not $site) {
  Bad "No IIS site named '$SiteName'."
  Say "Available: $((Get-Website | Select-Object -ExpandProperty Name) -join ', ')"
  exit 1
}
$expected = Join-Path $PSScriptRoot '..\apps\web\out'
$want = try { (Resolve-Path $expected -ErrorAction Stop).Path.TrimEnd('\') } catch { $null }
$got  = $site.physicalPath.TrimEnd('\')
if ($want -and $got -ieq $want) {
  Ok "Site '$SiteName' serves the static export ($got)."
} else {
  Bad "Site '$SiteName' does not serve the static export."
  Say "its physical path : $got"
  Say "expected          : $(if ($want) { $want } else { $expected + '  (does not exist -- has the web ever been built?)' })"
  Say "Binding the wrong site would serve the API, or nothing, on our own domain. Refusing."
  exit 1
}

# ------------------------------------------------- is a host already taken? --
# Across EVERY site, not just this one. Two sites claiming *:80:<host> is an
# http.sys conflict that stops the second site starting -- and the error it
# gives names a port, not the site that already holds it.
foreach ($h in $Hosts) {
  $clash = Get-Website | Where-Object { $_.Name -ne $SiteName } | ForEach-Object {
    $s = $_
    $s.Bindings.Collection | Where-Object { $_.bindingInformation -match ":(80|443):$([regex]::Escape($h))$" } |
      ForEach-Object { "$($s.Name) -> $($_.protocol) $($_.bindingInformation)" }
  }
  if ($clash) {
    Bad "'$h' is already bound to another site:"
    $clash | ForEach-Object { Say $_ }
    Say "Remove it there first, or this site will fail to start. Refusing."
    exit 1
  }
}
Ok "Neither host is bound to any other site."

# --------------------------------------------------------------------- DNS ---
foreach ($h in $Hosts) {
  try {
    $ips = (Resolve-DnsName -Name $h -Type A -Server 1.1.1.1 -ErrorAction Stop |
            Where-Object { $_.IPAddress }).IPAddress -join ', '
    if ($ips) { Ok "DNS $h -> $ips" } else { Warn "$h returned no A record." }
  } catch {
    Warn "$h does not resolve yet. win-acme WILL FAIL until it does."
  }
}
# NOTE: do not try to confirm reachability by curling the public IP from this
# box. It sits behind NAT at 192.168.46.88 and the public 103.107.27.38 is not
# bound locally, so the request fails on hairpinning and looks exactly like a
# dead origin. Verification at the end uses loopback with an explicit SNI name.

# ------------------------------------------------------------- certificate ---
$thumb = $null

# The SAN list as one flat string, or '' when the certificate has no SAN
# extension at all (subject CN only -- old, and browsers no longer accept it).
function Get-SanText($cert) {
  $ext = $cert.Extensions | Where-Object { $_.Oid.FriendlyName -eq 'Subject Alternative Name' }
  if (-not $ext) { return '' }
  ($ext | ForEach-Object { $_.Format($false) }) -join ' '
}

# Does this SAN text cover $name? A wildcard covers exactly ONE label, so
# *.investoyard.com covers www.investoyard.com and NOT the apex -- which is the
# single easiest thing to get wrong here, and it fails as a browser warning on
# every visit rather than as an error at bind time.
function Test-SanCovers([string] $san, [string] $name) {
  if ($san -match [regex]::Escape("DNS Name=$name")) { return $true }
  # An apex (two labels) can ONLY be covered by an exact SAN. Deriving a
  # wildcard from it gives '*.com', which is not a certificate anyone issues --
  # but testing for it anyway is the kind of loose check that eventually says
  # yes to something it should not.
  if (($name -split '\.').Count -lt 3) { return $false }
  $parent = $name -replace '^[^.]+\.', '*.'
  return [bool]($san -match [regex]::Escape("DNS Name=$parent"))
}

# Matches on the SAN list, not the subject CN: a multi-SAN or wildcard bundle
# legitimately carries a CN that is none of the hosts we are binding.
function Get-CertFor([string[]] $names) {
  Get-ChildItem Cert:\LocalMachine\My |
    Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
    Where-Object {
      $san = Get-SanText $_
      $missing = @($names | Where-Object { -not (Test-SanCovers $san $_) })
      $missing.Count -eq 0
    } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
}

if ($UseWinAcme) {
  if (-not (Test-Path $WacsPath)) {
    Bad "win-acme not found at $WacsPath."
    Say "Download from https://www.win-acme.com/ and unzip to C:\win-acme, or pass -WacsPath."
    exit 1
  }
  Say "Certificate will be issued by win-acme AFTER the HTTP bindings exist."
  Say "(HTTP-01 fetches http://<host>/.well-known/acme-challenge/... from THIS site,"
  Say " so the order is binding first, certificate second. Reversed, it fails with an"
  Say " error that reads like a DNS problem.)"
} elseif ($PfxPath) {
  if (-not (Test-Path $PfxPath)) { Bad "No such file: $PfxPath"; exit 1 }
  Say "Reading $PfxPath"
  $pw = Read-Host -Prompt '  PFX password' -AsSecureString
  try {
    if ($Apply) {
      $imported = Import-PfxCertificate -FilePath $PfxPath `
                    -CertStoreLocation Cert:\LocalMachine\My -Password $pw -Exportable:$false
      $thumb = $imported.Thumbprint
      Ok "Imported: $($imported.Subject)"
      Ok "Expires:  $($imported.NotAfter)"
    } else {
      # Read it without installing, so a dry run still proves the password and
      # the SAN coverage -- the two things that make the apply step fail.
      $probe = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
      $probe.Import($PfxPath, $pw, 'EphemeralKeySet')
      Say "would import: $($probe.Subject)"
      Say "expires:      $($probe.NotAfter)"
      $sanTxt = Get-SanText $probe
      Say "SANs:         $(if ($sanTxt) { $sanTxt } else { '(none -- subject CN only, which browsers no longer accept)' })"
      foreach ($h in $Hosts) {
        if (Test-SanCovers $sanTxt $h) { Ok "covers $h" }
        else { Bad "DOES NOT COVER $h -- binding it would give every visitor a certificate warning." }
      }
    }
  } finally { $pw = $null; [GC]::Collect() }
} else {
  $found = Get-CertFor $Hosts
  if ($found) {
    $thumb = $found.Thumbprint
    Ok "Certificate already installed: $($found.Subject)  (expires $($found.NotAfter))"
  } else {
    Bad "No installed certificate covers these hosts, and neither -PfxPath nor -UseWinAcme was given."
    Say "Installed with a private key:"
    Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.HasPrivateKey } |
      ForEach-Object { Say " - $($_.Subject)  (expires $($_.NotAfter))" }
    exit 1
  }
}

# ---------------------------------------------------------- HTTP bindings ----
# Needed even though the site is HTTPS-only in practice: the canonical-host
# rule in web.config is what upgrades a plain-HTTP request, and it can only run
# if IIS receives that request. Without a :80 binding the host falls through to
# the default site instead.
foreach ($h in $Hosts) {
  $b = Get-WebBinding -Name $SiteName -Protocol http -ErrorAction SilentlyContinue |
       Where-Object { $_.bindingInformation -eq "*:80:$h" }
  if ($b) { Ok "HTTP  *:80:$h already present." }
  elseif ($Apply) { New-WebBinding -Name $SiteName -Protocol http -Port 80 -HostHeader $h; Ok "HTTP  *:80:$h added." }
  else { Say "would add HTTP  *:80:$h" }
}

# ------------------------------------------------------------- win-acme ------
if ($UseWinAcme -and $Apply) {
  Say "Running win-acme for $($Hosts -join ', ') ..."
  & $WacsPath --target manual --host ($Hosts -join ',') --siteid $site.Id `
              --validation filesystem --webroot $site.physicalPath `
              --installation iis --installationsiteid $site.Id `
              --accepttos --notaskscheduler:$false
  if ($LASTEXITCODE -ne 0) {
    Bad "win-acme exited $LASTEXITCODE -- no certificate was issued."
    Say "Usual causes: DNS not propagated, port 80 not reachable from the internet, or a"
    Say "rewrite rule swallowing /.well-known/acme-challenge/. The canonical-host rule added"
    Say "on 2026-10-15 is the FIRST rule and matches (.*) -- check it excludes .well-known"
    Say "if validation fails here."
    exit 1
  }
  Ok "win-acme completed; it creates the HTTPS binding itself."
  $thumb = (Get-CertFor $Hosts).Thumbprint
}

# --------------------------------------------------------- HTTPS bindings ----
# SNI is mandatory, not a preference: a second certificate on port 443 collides
# with the *.finwave.co one already there, and without SNI one host would be
# served the other's certificate.
foreach ($h in $Hosts) {
  $b = Get-WebBinding -Name $SiteName -Protocol https -ErrorAction SilentlyContinue |
       Where-Object { $_.bindingInformation -eq "*:443:$h" }
  if (-not $b) {
    if ($Apply) {
      New-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $h -SslFlags 1
      $b = Get-WebBinding -Name $SiteName -Protocol https |
           Where-Object { $_.bindingInformation -eq "*:443:$h" }
      Ok "HTTPS *:443:$h added with SNI."
    } else { Say "would add HTTPS *:443:$h with SNI, carrying the certificate above"; continue }
  } else {
    Ok "HTTPS *:443:$h already present."
    if (-not ($b.sslFlags -band 1)) {
      if ($Apply) {
        Set-WebBinding -Name $SiteName -BindingInformation $b.bindingInformation -PropertyName sslFlags -Value 1
        Ok "SNI enabled on $h."
      } else { Warn "SNI is OFF on $h (sslFlags=$($b.sslFlags)); would enable it." }
    }
  }
  if ($Apply -and $b -and $thumb) {
    $b.AddSslCertificate($thumb, 'My')
    Ok "Certificate attached to $h."
  }
}

# ------------------------------------------------------------- verify --------
# Over LOOPBACK with an explicit SNI name, which exercises the real binding and
# the real certificate without leaving the box.
#
# THE DISCRIMINATOR IS THE RESPONSE SIZE, NOT THE STATUS CODE. An unbound host
# falls through to the IIS default site and answers 200 at about 700 bytes; the
# real home page is ~5.4 MB. That is exactly what made investoyard.com look
# served on 2026-10-15 when nothing was bound for it at all.
#
# AND 127.0.0.1 IS NOT ENOUGH ON ITS OWN. A binding made in IIS Manager with a
# specific IP selected is `192.168.46.88:443:<host>`, which loopback does NOT
# match -- so a perfectly healthy site answers http.sys's own 404 on 127.0.0.1
# while serving the internet fine. That cost a false "the site is down" reading
# on 2026-10-15, on all four hosts at once. Try every local address the site
# could be bound to, and treat the host as served if ANY of them answers.
#
# When every address 404s, the way to tell "stopped/unbound" from "bad content"
# is that http.sys answers before IIS: the request appears in
# C:\Windows\System32\LogFiles\HTTPERR as `404 NotFound` and in NO site log
# under C:\inetpub\logs\LogFiles. A content 404 is the other way round.
if ($Apply) {
  Write-Host ""
  Write-Host "Verifying:" -ForegroundColor Cyan

  $addrs = @('127.0.0.1') + @(
    Get-NetIPAddress -AddressFamily IPv4 -EA SilentlyContinue |
      Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -ExpandProperty IPAddress
  ) | Select-Object -Unique

  foreach ($h in $Hosts) {
    $served = $false
    foreach ($ip in $addrs) {
      $r = curl.exe -sk -o NUL --resolve "${h}:443:$ip" -m 20 -w "%{http_code} %{size_download}" "https://$h/" 2>$null
      if (-not $r) { continue }
      $code, $size = $r -split ' '
      if ([int]$size -gt 100000) { Ok "$h via $ip -> HTTP $code, $([int]$size) bytes (the real site)"; $served = $true; break }
      if ($code -eq '301' -or $code -eq '302') { Ok "$h via $ip -> HTTP $code redirect"; $served = $true; break }
    }
    if (-not $served) {
      Warn "$h answered on none of: $($addrs -join ', ')"
      Say "Check HTTPERR for '404 NotFound' on this host -- that means http.sys has no"
      Say "registered binding for it (site stopped, or the binding was replaced rather"
      Say "than added), and the request never reached IIS at all."
    }
  }

  # The certificate chain, which -k above deliberately ignored. A visitor sees
  # this even when the content is perfect.
  foreach ($h in $Hosts) {
    foreach ($ip in $addrs) {
      curl.exe -s -o NUL --resolve "${h}:443:$ip" -m 20 "https://$h/" 2>$null
      if ($LASTEXITCODE -eq 0) { Ok "$h -> certificate validates (via $ip)"; break }
      if ($ip -eq $addrs[-1]) { Warn "$h -> certificate did not validate on any address. A visitor may see a warning." }
    }
  }
}

Write-Host ""
if (-not $Apply) {
  Warn "Dry run -- nothing was changed. Re-run with -Apply."
  Write-Host ""
  exit 0
}
# The follow-up differs completely depending on WHOSE host was just bound, and
# handing a partner-domain operator the canonical-move checklist would be worse
# than saying nothing -- step 2 alone would have them rebuild for no reason.
$ourOwn = @($Hosts | Where-Object { $_ -eq 'investoyard.com' -or $_ -eq 'www.investoyard.com' }).Count -gt 0

Write-Host "Next, in order:" -ForegroundColor Cyan
Say "1. Confirm https://$($Hosts[0]) loads from OUTSIDE this box (not from here --"
Say "   NAT hairpinning makes a local request to the public IP look like a dead origin)."

if ($ourOwn) {
  Say "2. Only then rebuild the web: cd apps/web; npm run build"
  Say "   That build is what puts the new canonical on all ~2,600 pages."
  Say "3. Add investoyard.com to Google Search Console, then use Change of Address"
  Say "   from the previous domain. A redirect alone is a hint; Change of Address is"
  Say "   the declaration, and it is what carries the indexed IPO pages across."
  Say ""
  Say "Do NOT set investoyard.com as any tenant's custom domain -- OUR_HOSTS refuses"
  Say "it, and a tenant matching the main host would take the whole site's branding."
} else {
  Say "2. This looks like a WHITE-LABEL PARTNER host. Set it as that tenant's Custom"
  Say "   domain in admin (Tenants -> the partner -> Branding & domain), if it is not"
  Say "   set already. That one field does three things: it renders THEIR brand, it"
  Say "   adds their origin to the API's CORS allow-list from the database within a"
  Say "   minute, and it is what `Check domain` reports against."
  Say "3. NO REBUILD IS NEEDED. The static export is one set of HTML answering every"
  Say "   host; the partner branch is decided in the browser, not at build time."
  Say ""
  Say "Then confirm on their domain that OUR About/Terms/Privacy/Disclaimer do NOT"
  Say "appear -- an unpublished legal page must read 'not yet published', never ours."
}
Write-Host ""
