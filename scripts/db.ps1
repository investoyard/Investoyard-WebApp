# Portable PostgreSQL control for local dev (data in .pgdata, server on :5433).
#   powershell -File scripts\db.ps1 start|stop|status
param([string]$cmd = 'status')
$bin  = 'D:\Investoyard\.tools\pgsql\bin'
$data = 'D:\Investoyard\.pgdata'
switch ($cmd) {
  'start'  { & "$bin\pg_ctl.exe" -D $data -o "-p 5433" -l "$data\log.txt" -w start }
  'stop'   { & "$bin\pg_ctl.exe" -D $data -w stop }
  'status' { & "$bin\pg_ctl.exe" -D $data status }
  default  { 'usage: db.ps1 start|stop|status' }
}
