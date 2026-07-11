# Portable Redis 5 control (for the BullMQ submission queue). Usage:
#   pwsh scripts/redis.ps1 start | stop | status
param([string]$cmd = 'status')

$root = Split-Path $PSScriptRoot -Parent
$bin  = Join-Path $root '.tools\redis\redis-server.exe'
$cli  = Join-Path $root '.tools\redis\redis-cli.exe'
$data = Join-Path $root '.redisdata'
$port = 6379

switch ($cmd) {
  'start' {
    if (-not (Test-Path $bin)) { Write-Host 'Portable Redis not found under .tools\redis'; break }
    New-Item -ItemType Directory -Force $data | Out-Null
    Start-Process -FilePath $bin -ArgumentList "--port $port --dir `"$data`" --save `"`" --appendonly no" -WindowStyle Hidden
    Start-Sleep 1
    Write-Host ("redis: " + (& $cli -p $port ping))
  }
  'stop'   { & $cli -p $port shutdown nosave 2>$null; Write-Host 'redis stopped' }
  default  {
    $ping = (& $cli -p $port ping 2>$null)
    Write-Host (if ($ping) { "redis up on :$port ($ping)" } else { "redis not running on :$port" })
  }
}
