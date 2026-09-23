# Portable PostgreSQL control (data in .pgdata, server on :5433).
#
#   powershell -File scripts\db.ps1 start|stop|status|register|unregister
#
# Prefers the Windows SERVICE when one is registered, and falls back to pg_ctl
# when it isn't, so this keeps working either side of `register`.
#
# Why the service matters: started by pg_ctl from a console, Postgres sits in
# that console's process group, so a Ctrl+C delivered there kills backends. That
# happened three times on 2026-09-23 (exit 0xC000013A = STATUS_CONTROL_C_EXIT),
# once mid-build, and each crash left a ZOMBIE (see Clear-PgZombie below). A
# service has no console and cannot be signalled that way.
param([string]$cmd = 'status')

$bin  = 'D:\Investoyard\.tools\pgsql\bin'
$data = 'D:\Investoyard\.pgdata'
$log  = "$data\log.txt"
$svc  = 'investoyard-postgres'
$port = 5433

function Get-PgService { Get-Service -Name $svc -ErrorAction SilentlyContinue }

function Test-PgPort {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

# The authoritative "is it usable" test: it CONNECTS. Everything else here is
# circumstantial. In particular it is the only check that survives the service
# model - see Test-PgLive.
function Test-PgAccepting {
  & "$bin\pg_isready.exe" -h 127.0.0.1 -p $port -t 3 > $null 2>&1
  return $?
}

# pg_ctl exits non-zero when no postmaster owns the data directory - but ALSO
# when it cannot inspect the one that does. Under the service the postmaster
# runs as LocalSystem, and a standard user cannot open a handle to it, so this
# reports "no server running" for a perfectly healthy database. Useful only for
# the pg_ctl fallback path; never trust it on its own.
function Test-PgLive {
  & "$bin\pg_ctl.exe" -D $data status > $null 2>&1
  return $?
}

function Wait-PgReady([int]$seconds = 60) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-PgAccepting) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

# The crash signature: the postmaster is gone (pg_ctl says "no server running")
# but an orphaned backend inherited the listening socket AND the log file
# handle. pg_ctl then can't bind 5433 and can't open its log, and reports
# "another server might be running" + "Permission denied" - which reads like a
# healthy server to anyone who hasn't seen it before. Cleaning is safe ONLY in
# that exact combination, so all three conditions are required.
function Clear-PgZombie {
  # A zombie is by definition a server that does NOT accept connections. That
  # guard comes first and makes the rest safe: it is what stops this killing a
  # healthy service, whose postmaster Test-PgLive cannot see.
  if (Test-PgAccepting) { return $false }
  $procs = @(Get-Process postgres -ErrorAction SilentlyContinue)
  if ((Test-PgLive) -or $procs.Count -eq 0 -or -not (Test-PgPort)) { return $false }

  Write-Host "Zombie detected: no postmaster, but $($procs.Count) orphaned postgres process(es) still hold :$port." -ForegroundColor Yellow
  $procs | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  if (@(Get-Process postgres -ErrorAction SilentlyContinue).Count -gt 0) {
    Write-Host "Could not stop every postgres process - stopping here rather than guessing." -ForegroundColor Red
    return $false
  }
  if (Test-PgPort) {
    Write-Host "Processes are gone but :$port is still held - stopping here." -ForegroundColor Red
    return $false
  }
  # Only now is the lock file provably stale.
  if (Test-Path "$data\postmaster.pid") { Remove-Item "$data\postmaster.pid" -Force -ErrorAction SilentlyContinue }
  Write-Host "Zombie cleared. WAL replay will run on the next start - nothing committed is lost." -ForegroundColor Green
  return $true
}

function Show-Status {
  $s = Get-PgService
  if ($s) { Write-Host ("service  : {0} ({1}, {2})" -f $s.Name, $s.Status, $s.StartType) }
  else    { Write-Host "service  : not registered (pg_ctl mode - run 'db.ps1 register' from an ADMIN shell)" }
  if (Test-PgPort) { Write-Host "port $port  : listening" } else { Write-Host "port $port  : closed" }
  if (Test-PgAccepting) {
    Write-Host "postgres : accepting connections" -ForegroundColor Green
  } elseif (Test-PgPort) {
    Write-Host "ZOMBIE: :$port is held but nothing answers. Run 'db.ps1 start' - it clears this." -ForegroundColor Yellow
  } else {
    Write-Host "postgres : NOT running" -ForegroundColor Red
  }
}

switch ($cmd) {

  'start' {
    $s = Get-PgService
    if ($s) {
      if ($s.Status -eq 'Running') { Write-Host "Already running (service)."; Show-Status; break }
      Start-Service -Name $svc
      if (Wait-PgReady) { Write-Host "Postgres started (service)." -ForegroundColor Green }
      else { Write-Host "Service started but :$port never opened - check $log" -ForegroundColor Red }
      Show-Status
      break
    }
    if (Test-PgAccepting) { Write-Host "Already running (pg_ctl)."; Show-Status; break }
    Clear-PgZombie | Out-Null
    & "$bin\pg_ctl.exe" -D $data -o "-p $port" -l $log -w start
    Show-Status
  }

  'stop' {
    $s = Get-PgService
    if ($s) { Stop-Service -Name $svc -Force; Write-Host "Postgres stopped (service)."; break }
    & "$bin\pg_ctl.exe" -D $data -w stop
  }

  'status' { Show-Status }

  # Run from an ELEVATED shell - creating a service needs SeCreateServicePrivilege.
  # pg_ctl registers itself as the service binary and spawns postgres with a
  # RESTRICTED token, which is why LocalSystem is fine here: the server process
  # itself never holds administrator rights (Postgres refuses to run if it does).
  'register' {
    if (Get-PgService) { Write-Host "Service '$svc' already exists. Nothing to do."; Show-Status; break }
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      Write-Host "Needs an elevated shell. Right-click PowerShell -> Run as administrator, then re-run:" -ForegroundColor Red
      Write-Host "  powershell -File D:\Investoyard\scripts\db.ps1 register"
      break
    }
    # The data directory must be free before the service takes ownership of it.
    if (Test-PgAccepting) { Write-Host "Stopping the console-started server first..."; & "$bin\pg_ctl.exe" -D $data -w stop }
    Clear-PgZombie | Out-Null
    # -l matters: without it a SERVICE sends stderr to the Windows event log and
    # .pgdata\log.txt stops growing. That file is where every crash so far was
    # diagnosed from, so keep the server writing to it.
    & "$bin\pg_ctl.exe" register -N $svc -D $data -o "-p $port" -l $log -S auto
    if (-not $?) { Write-Host "register failed - see above." -ForegroundColor Red; break }
    if (-not (Get-PgService)) { Write-Host "pg_ctl reported success but no service '$svc' exists." -ForegroundColor Red; break }
    # Restart-on-failure, so a crash recovers without anyone watching.
    & sc.exe failure $svc reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
    Start-Service -Name $svc
    if (Wait-PgReady) {
      # pg_isready CONNECTS - a listening port alone has already fooled us once.
      & "$bin\pg_isready.exe" -h 127.0.0.1 -p $port -t 5
      Write-Host "Registered and started as service '$svc' (auto-start)." -ForegroundColor Green
    } else {
      Write-Host "Service registered but :$port never opened - check $log" -ForegroundColor Red
    }
    Show-Status
  }

  'unregister' {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      Write-Host "Needs an elevated shell." -ForegroundColor Red; break
    }
    if (-not (Get-PgService)) { Write-Host "No service '$svc' to remove."; break }
    Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
    & "$bin\pg_ctl.exe" unregister -N $svc
    Write-Host "Service removed. 'db.ps1 start' falls back to pg_ctl."
  }

  default { 'usage: db.ps1 start|stop|status|register|unregister' }
}
