@echo off
rem Double-click this to start the Expo dev server and get the QR to scan with
rem Expo Go. A .ps1 opens in Notepad on double-click, which is why this wrapper
rem exists - same reason start-services.bat does.
rem
rem The real work, and the reasoning behind each pre-flight check, is in
rem start-mobile.ps1. Run that directly for the options:
rem    -Lan       phone on the same Wi-Fi as this machine
rem    -NoClear   keep Metro's cache (faster, but try without it first when a
rem               change does not show up on the phone)

title Investoyard mobile - Expo

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mobile.ps1" %*

rem Metro exits when you press Ctrl+C. Hold the window open either way so a
rem start-up failure is readable instead of vanishing with the console.
echo.
echo ==============================================================
echo  Expo has stopped.
echo ==============================================================
pause
