@echo off
rem Starts the Investoyard infrastructure (portable Postgres :5433 + Redis :6379).
rem Run after any reboot if the auto-start task didn't fire. Safe to run twice.
echo === Starting Postgres ===
echo (messages like "another server might be running" / "Permission denied on log.txt"
echo  just mean Postgres was ALREADY running - that is fine.)
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Investoyard\scripts\db.ps1" start
echo.
echo === Starting Redis ===
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Investoyard\scripts\redis.ps1" start
echo.
echo === Final check ===
powershell -NoProfile -Command "foreach ($p in @(@('Postgres',5433),@('Redis',6379))) { $ok = (Test-NetConnection 127.0.0.1 -Port $p[1] -WarningAction SilentlyContinue).TcpTestSucceeded; Write-Host ('{0,-9} (:{1})  {2}' -f $p[0], $p[1], $(if ($ok) {'UP'} else {'DOWN - check the output above'})) }"
echo.
echo Done. The API recovers on its next request once both show UP.
pause
