<#
  Daily origin-connection health check — the Cloudflare 522 watchdog.

  WHAT IT WATCHES. IIS/http.sys closes an idle keep-alive connection at
  `webLimits/connectionTimeout`; Cloudflare holds origin connections for reuse
  for 900 seconds. While IIS sits at its 120-second default it closes first, and
  every time Cloudflare then sends a request down one of those dead sockets the
  visitor gets a 522 — intermittent, on any page, with NOTHING in the site log
  because the request never arrived. Diagnosed 2026-10-12 from an operator
  report: the static and API logs both had the same gap across the error
  instant, and the identical URL served fine 19 seconds later.

  It is a SERVER-level fault, not an Investoyard one — six of the seven sites on
  this box are 98-100% Cloudflare-fronted and share one http.sys connection pool
  and one timeout. The fix is one elevated command:

      appcmd.exe set config /section:system.applicationHost/webLimits `
                 /connectionTimeout:00:20:00

  WHY A THRESHOLD OF 100 AND NOT A PERCENTAGE. The raw count tracks traffic and
  is useless as a trend on its own — measured over ten days it ran 75 to 1,547,
  with weekends at the bottom purely because the site is quieter. What makes an
  absolute number safe here is that the fix does not REDUCE idle closures, it
  very nearly ELIMINATES them: at 20 minutes Cloudflare always closes first, so
  IIS should log almost none. 100 sits far below every pre-fix day and far above
  a healthy post-fix one, so it cannot be tripped by a busy Tuesday.

  THE REGRESSION IT EXISTS TO CATCH is the setting being lost — an IIS repair, a
  config restore or a hand edit putting `connectionTimeout` back to 00:02:00.
  That is the same shape as watching for a WAS 5186 after the app-pool idle fix.

  Read-only: it reads logs and writes only its own two output files.
  Always exits 0 — a scheduled task that reports failure is noise.
#>

$ErrorActionPreference = 'Stop'

$OutDir    = 'C:\ProgramData\Investoyard'
$CsvPath   = Join-Path $OutDir 'origin-connection-health.csv'
$LogPath   = Join-Path $OutDir 'origin-connection-health.log'
$HttpErr   = 'C:\Windows\System32\LogFiles\HTTPERR'
$IisLogs   = 'C:\inetpub\logs\LogFiles'
$Threshold = 100

# http.sys stamps its log in UTC, so the day boundary must be UTC too.
$Day   = (Get-Date).ToUniversalTime().AddDays(-1)
$Stamp = $Day.ToString('yyyy-MM-dd')
$IisStamp = $Day.ToString('yyMMdd')

# Cloudflare's published IPv4 egress ranges, by leading octets. Matching on the
# prefix rather than a full CIDR test is deliberate: this only has to separate
# "Cloudflare" from "a scanner poking /owa/", and a wrong bucket changes a
# diagnostic breakdown, never the verdict.
$CfPrefix = '^(162\.158|172\.6[4-9]|172\.7[01]|108\.162|104\.1[6-9]|104\.2[0-7]|173\.245|103\.2[1-2]|103\.31|141\.101|190\.93|188\.114|197\.234|198\.41|131\.0| 1\.1\.1)\.'

function Write-Both([string]$Text) {
  Write-Output $Text
  Add-Content -Path $LogPath -Value $Text -Encoding utf8
}

try {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

  $errLines = @()
  if (Test-Path $HttpErr) {
    $errLines = Get-ChildItem -Path (Join-Path $HttpErr '*.log') -ErrorAction SilentlyContinue |
      ForEach-Object { Select-String -Path $_.FullName -Pattern "^$Stamp " -ErrorAction SilentlyContinue } |
      ForEach-Object { $_.Line }
  }

  # The reason is the third field from the end: "... <reason> <queue> TCP".
  $reasons = @{}
  $idleTotal = 0
  $idleCf    = 0
  foreach ($line in $errLines) {
    $f = $line -split '\s+'
    if ($f.Count -lt 4) { continue }
    $reason = $f[$f.Count - 3]
    if ($reasons.ContainsKey($reason)) { $reasons[$reason]++ } else { $reasons[$reason] = 1 }
    if ($reason -eq 'Timer_ConnectionIdle') {
      $idleTotal++
      if ($f[2] -match $CfPrefix) { $idleCf++ }
    }
  }

  # Requests served that day, so the count can be read as a rate when traffic
  # swings. Context only — the verdict does not depend on it.
  $requests = 0
  if (Test-Path $IisLogs) {
    $requests = (Get-ChildItem -Path $IisLogs -Filter "u_ex$IisStamp.log" -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object { (Select-String -Path $_.FullName -Pattern '^2026' -ErrorAction SilentlyContinue).Count } |
      Measure-Object -Sum).Sum
    if (-not $requests) { $requests = 0 }
  }

  $per1k  = if ($requests -gt 0) { [math]::Round($idleTotal * 1000 / $requests, 1) } else { 0 }
  $status = if ($idleTotal -le $Threshold) { 'OK' } else { 'HIGH' }

  # ONE ROW PER DAY, REPLACED NOT APPENDED. Running this by hand to check on it
  # is the obvious thing to do, and "StartWhenAvailable" also re-fires a run the
  # machine slept through — either way a blind append silently double-counts the
  # day and quietly ruins the trend the file exists to show.
  $header = 'date,idle_total,idle_cloudflare,requests,idle_per_1k,status'
  $row    = "{0},{1},{2},{3},{4},{5}" -f $Stamp, $idleTotal, $idleCf, $requests, $per1k, $status
  $rows   = @()
  if (Test-Path $CsvPath) {
    $rows = @(Get-Content $CsvPath | Where-Object { $_ -and $_ -ne $header -and -not $_.StartsWith("$Stamp,") })
  }
  Set-Content -Path $CsvPath -Value (@($header) + $rows + @($row)) -Encoding utf8

  $top = ($reasons.GetEnumerator() | Sort-Object Value -Descending |
          Select-Object -First 5 | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '  '

  Write-Both ''
  Write-Both "[$Stamp] origin connection check"
  Write-Both "  Timer_ConnectionIdle : $idleTotal  (Cloudflare $idleCf)"
  Write-Both "  requests served      : $requests   ->  $per1k per 1,000"
  Write-Both "  http.sys reasons     : $top"

  if ($status -eq 'OK') {
    Write-Both "  VERDICT: OK - at or under $Threshold. Cloudflare is closing first, as it should."
  } else {
    Write-Both "  VERDICT: HIGH - $idleTotal idle closures, over the $Threshold threshold."
    Write-Both "    IIS is closing keep-alive connections before Cloudflare does, which is"
    Write-Both "    what produces intermittent 522s on every Cloudflare-fronted site here."
    Write-Both "    Check the setting from an ELEVATED shell:"
    Write-Both "      appcmd.exe list config -section:system.applicationHost/webLimits"
    Write-Both "    It should read connectionTimeout=00:20:00; the IIS default 00:02:00 is the fault."
  }
}
catch {
  # Never fail the task over the watchdog itself.
  try { Add-Content -Path $LogPath -Value "[$Stamp] check FAILED: $($_.Exception.Message)" -Encoding utf8 } catch { }
  Write-Output "check failed: $($_.Exception.Message)"
}

exit 0
