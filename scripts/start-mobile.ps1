<#
.SYNOPSIS
  Start the Investoyard mobile app in Expo and show the QR to scan with Expo Go.

.DESCRIPTION
  Does the five checks that account for nearly every "the app is broken" report
  on this box BEFORE starting Metro, because each one fails in a way that looks
  like something else:

    1. apps/mobile/.env          - GITIGNORED. Without it the API host falls back
                                   to this machine's LAN IP or localhost, and the
                                   app reaches nothing. Looks like a dead API.
    2. shared-types / i18n dist  - mobile imports the COMPILED dist, not src.
                                   Editing src is not enough; a stale dist throws
                                   "undefined is not a function" on a brand-new
                                   export. Rebuilt here if src is newer.
    3. babel-preset-expo         - the postinstall junctions Expo packages and
                                   npm installs undo it. Metro then dies with
                                   "Cannot find module babel-preset-expo".
    4. the API                   - checked over loopback with the Host header
                                   IIS routes on. A downed Postgres or Redis
                                   surfaces here as a 503, not as a crash.
    5. the packager hostname     - what the PHONE will dial. Wrong value = the
                                   QR scans, then the bundle never downloads.

.PARAMETER PackagerHost
  The address the phone connects to. Defaults to the public IP, which is what
  works from mobile data. Pass the LAN address when the phone is on the same
  Wi-Fi as this box.

.PARAMETER Lan
  Shorthand for the LAN address of this machine, detected automatically.

.PARAMETER NoClear
  Keep Metro's cache. The default clears it, which is slower but is the first
  thing to try when a change does not appear on the phone.

.EXAMPLE
  .\scripts\start-mobile.ps1
.EXAMPLE
  .\scripts\start-mobile.ps1 -Lan
#>
[CmdletBinding()]
param(
  [string] $PackagerHost = '103.107.27.38',
  [switch] $Lan,
  [switch] $NoClear
)

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 on this box: no '&&', and no embedded double quotes in some
# contexts. Everything below sticks to that.
$Root   = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root 'apps\mobile'

function Say  ($m) { Write-Host $m }
function Good ($m) { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Bad  ($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }

Say ''
Say '==============================================================='
Say '  Investoyard mobile - Expo dev server'
Say '==============================================================='
Say ''

if (-not (Test-Path $Mobile)) {
  Bad "apps\mobile not found under $Root"
  exit 1
}

# --- 1. the API host the app is compiled against ---------------------------
Say '1. API host (.env)'
$EnvFile = Join-Path $Mobile '.env'
if (-not (Test-Path $EnvFile)) {
  Bad '.env is MISSING.'
  Say '       It is gitignored, so a fresh checkout has none. Without it the app'
  Say '       falls back to this machine LAN IP or localhost and reaches nothing,'
  Say '       which looks exactly like a dead API.'
  Say ''
  Say '       Fix:  copy apps\mobile\.env.example to apps\mobile\.env'
  exit 1
}
$ApiUrl = (Select-String -Path $EnvFile -Pattern '^\s*EXPO_PUBLIC_API_URL\s*=\s*(.+)$' |
           Select-Object -First 1).Matches.Groups[1].Value
if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
  Warn 'EXPO_PUBLIC_API_URL is not set - Expo will derive a LAN IP.'
  Warn 'Fine on this Wi-Fi, useless anywhere else.'
} else {
  Good "EXPO_PUBLIC_API_URL = $ApiUrl"
}

# --- 2. the workspace packages mobile actually imports ---------------------
Say ''
Say '2. shared packages (mobile imports dist/, not src/)'
foreach ($pkg in @('shared-types', 'i18n')) {
  $PkgDir = Join-Path $Root "packages\$pkg"
  $Src    = Join-Path $PkgDir 'src'
  $Dist   = Join-Path $PkgDir 'dist'
  if (-not (Test-Path $Src)) { Warn "packages\$pkg has no src - skipped"; continue }

  $NewestSrc = (Get-ChildItem -Path $Src -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
  $NewestDist = $null
  if (Test-Path $Dist) {
    $NewestDist = (Get-ChildItem -Path $Dist -Recurse -File -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
  }

  if ($null -eq $NewestDist -or $NewestSrc -gt $NewestDist) {
    Warn "packages\$pkg dist is stale or missing - building"
    Push-Location $PkgDir
    try {
      & npm run build 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { Bad "packages\$pkg build FAILED - run 'npm run build' there to see why"; Pop-Location; exit 1 }
      Good "packages\$pkg rebuilt"
    } finally { if ((Get-Location).Path -eq $PkgDir) { Pop-Location } }
  } else {
    Good "packages\$pkg dist is current"
  }
}

# --- 3. the junctions an npm install keeps undoing -------------------------
Say ''
Say '3. Expo package links'
# RESOLVABILITY, not a path. npm hoists this to the repo root in this
# workspace, so apps\mobile\node_modules\babel-preset-expo never exists and a
# path test blocks every start on a healthy tree - which is what the first
# version of this check did. Metro resolves the module; so do we.
function Test-Resolves ($module) {
  Push-Location $Mobile
  try {
    & node -e "require.resolve('$module')" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally { Pop-Location }
}

if (-not (Test-Resolves 'babel-preset-expo')) {
  Warn 'babel-preset-expo does not resolve - re-running scripts\link-expo-router.js'
  Push-Location $Root
  try {
    & node (Join-Path $Root 'scripts\link-expo-router.js') 2>&1 | Out-Null
  } finally { Pop-Location }
  if (Test-Resolves 'babel-preset-expo') { Good 'links restored' }
  else {
    Bad 'still unresolvable. Run: npm install --legacy-peer-deps  (from the repo root)'
    exit 1
  }
} else {
  Good 'babel-preset-expo resolves'
}

# --- 4. is the API actually answering? -------------------------------------
Say ''
Say '4. API health'
# Loopback with the Host header IIS routes on. The public name is NOT reachable
# from this box (NAT hairpinning), so curling it here proves nothing.
try {
  $H = @{ Host = 'newipoapi.finwave.co' }
  $R = Invoke-WebRequest -Uri 'http://127.0.0.1/api/health' -Headers $H -UseBasicParsing -TimeoutSec 8
  if ($R.StatusCode -eq 200) { Good 'API 200' }
  else { Warn "API returned $($R.StatusCode)" }
} catch {
  Warn 'API did not answer on 127.0.0.1.'
  Say  '       If the phone shows empty lists, start the services first:'
  Say  '         scripts\db.ps1 start     (portable Postgres, :5433)'
  Say  '         scripts\redis.ps1 start  (:6379)'
  Say  '       A downed DB surfaces in the app as empty data, not an error.'
}

# --- 5. what the phone will dial -------------------------------------------
Say ''
Say '5. Packager host'
if ($Lan) {
  $Detected = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
               Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
               Select-Object -First 1).IPAddress
  if ($Detected) { $PackagerHost = $Detected; Good "LAN address detected: $PackagerHost" }
  else { Warn "could not detect a LAN address - keeping $PackagerHost" }
}
Good "phone will connect to $PackagerHost"
Say  '       Same Wi-Fi as this machine?  use -Lan'
Say  '       Phone on mobile data?        keep the default (public IP)'

# VERIFIED, because the obvious grep says otherwise: this variable does NOT
# appear in node_modules/@expo/cli (the hoisted copy). The CLI actually in
# use is the NESTED node_modules/expo/node_modules/@expo/cli, whose
# UrlCreator.js reads it. Confirmed against the running server: the manifest
# came back with launchAsset.url = http://103.107.27.38:8081/... and not the
# LAN address. Check the manifest, not the package you expect it to be in.
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $PackagerHost
# The Expo tunnel is blocked from this network, so offline mode skips the
# login/tunnel attempt that would otherwise stall the start.
$env:EXPO_OFFLINE = '1'

Say ''
Say '==============================================================='
Say '  Starting Metro. Scan the QR below with Expo Go.'
Say ''
Say '  Expo Go must be the SDK 54 build (the Play Store one is).'
Say '  Press Ctrl+C in this window to stop the server.'
Say '==============================================================='
Say ''

Push-Location $Mobile
try {
  if ($NoClear) { & npx expo start }
  else          { & npx expo start --clear }
} finally {
  Pop-Location
}
