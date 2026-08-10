# Auto-starts the Investoyard infrastructure after a reboot.
# Registered as a Windows Scheduled Task ("Investoyard DB & Redis", At startup).
# Postgres and Redis are portable manual processes — without this, every reboot
# leaves the API returning 500s until someone starts them by hand.
$log = 'D:\Investoyard\.startup-services.log'
"[$(Get-Date -Format s)] boot: starting Postgres + Redis" | Out-File $log -Append -Encoding utf8
& powershell -NoProfile -ExecutionPolicy Bypass -File D:\Investoyard\scripts\db.ps1 start    *>> $log
& powershell -NoProfile -ExecutionPolicy Bypass -File D:\Investoyard\scripts\redis.ps1 start *>> $log
"[$(Get-Date -Format s)] done (API recovers on its next request once the DB is up)" | Out-File $log -Append -Encoding utf8
