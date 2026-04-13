@echo off
title LynkOS Backend Launcher
cd /d "%~dp0"

echo ============================================
echo  LynkOS - Backend Launcher
echo ============================================
echo.

rem ── Django / Daphne 起動（別ウィンドウ）────────────
echo [1/2] Django バックエンドを起動しています...
start "LynkOS Django" cmd /k "cd /d %~dp0backend && set DJANGO_DEBUG=true&& set DJANGO_ALLOWED_HOSTS=*&& set DJANGO_SECRET_KEY=local-start-backend&& call venv\Scripts\activate.bat && daphne -b 0.0.0.0 -p 8000 config.asgi:application"

rem Django が起動するまで少し待機
timeout /t 4 /nobreak > nul

rem ── Watchdog 起動（別ウィンドウ）──────────────────
echo [2/2] Watchdog を起動しています...
start "LynkOS Watchdog" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend_watchdog.ps1"

echo.
echo ============================================
echo  バックエンド + Watchdog が起動しました
echo
echo  Django  : http://127.0.0.1:8000
echo  Health  : http://127.0.0.1:8000/api/health/
echo
echo  このウィンドウは閉じても構いません。
echo ============================================
timeout /t 5 /nobreak > nul
