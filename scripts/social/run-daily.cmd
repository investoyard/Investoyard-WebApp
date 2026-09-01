@echo off
REM Investoyard — daily social beat generator.
REM
REM Writes a dated folder of DRAFTS to content/social/<date>/ and exits.
REM It never posts anything: a human approves and posts from the queue.
REM
REM Register (run once, as the operator):
REM   schtasks /Create /TN "Investoyard Social Beats" ^
REM     /TR "\"D:\Investoyard\scripts\social\run-daily.cmd\"" /SC DAILY /ST 08:15
REM
REM Exit code 1 means the compliance lint blocked at least one draft — the
REM index.md for that day lists which, and why.

setlocal
set HERE=%~dp0
if not exist "%HERE%..\..\content\social" mkdir "%HERE%..\..\content\social"
node "%HERE%social-beats.mjs" >> "%HERE%..\..\content\social\run.log" 2>&1
exit /b %ERRORLEVEL%
