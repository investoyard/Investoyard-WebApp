@echo off
REM Rasterise the Open Graph share card into apps/web/public/og-default.png.
REM
REM Why headless Edge and not Next's opengraph-image.tsx: Next 14's bundled
REM @vercel/og cannot be imported on Windows at all — it resolves its own font
REM with path.join over a file:// URL ("file:\D:\...") and throws Invalid URL,
REM which fails the static export. Edge ships with the OS, needs no install,
REM and renders the real brand fonts.
REM
REM Re-run after editing og-default.html. Commit the PNG.

setlocal
set HERE=%~dp0
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%EDGE%" (
  echo Could not find Edge or Chrome. Install one, or point EDGE at a Chromium binary.
  exit /b 1
)

"%EDGE%" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 ^
  --window-size=1200,630 ^
  --screenshot="%HERE%..\..\apps\web\public\og-default.png" ^
  "file:///%HERE:\=/%og-default.html"

echo Wrote apps/web/public/og-default.png
