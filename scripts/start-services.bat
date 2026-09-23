@echo off
rem Starts the Investoyard infrastructure (Postgres :5433 + Redis :6379).
rem Safe to run twice.
rem
rem Once `db.ps1 register` has been run from an admin shell, Postgres is a
rem Windows service that starts on boot and this script is only the manual
rem path. db.ps1 handles both cases and clears a crashed server's leftovers.

echo === Postgres ===
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Investoyard\scripts\db.ps1" start
echo.
echo === Redis ===
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Investoyard\scripts\redis.ps1" start

echo.
echo === Final check ===
rem These CONNECT. The old check only probed whether :5433 was open, which is
rem the one thing that stays true after a crash - an orphaned backend keeps the
rem listening socket - so it reported UP for a database refusing every query.
"D:\Investoyard\.tools\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5433 -t 5
"D:\Investoyard\.tools\redis\redis-cli.exe" -p 6379 ping

echo.
echo Postgres must say "accepting connections" and Redis must say PONG.
echo Anything else means the API will keep returning 500 / 503.
echo.
echo If Postgres is not accepting connections, run:
echo     powershell -File D:\Investoyard\scripts\db.ps1 status
pause
