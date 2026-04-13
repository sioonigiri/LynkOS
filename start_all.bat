@echo off
title LynkOS
cd /d "%~dp0"

rem -- LAN IPv4（スマホ・PWA 用 URL 表示）を自動取得 ----------
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$l = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }; $p = $l | Where-Object { $_.IPAddress -match '^(192\\.168|10\\.)' } | Sort-Object InterfaceMetric | Select-Object -First 1; if (-not $p) { $p = $l | Sort-Object InterfaceMetric | Select-Object -First 1 }; if ($p) { $p.IPAddress }"`) do set "LAN_IP=%%i"
if not defined LAN_IP (
  for /f "tokens=2 delims=: " %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set "LAN_IP=%%a"
    goto :gotip
  )
)
:gotip
if not defined LAN_IP set "LAN_IP=（ipconfig で IPv4 を確認）"

rem -- 受信 TCP 8000 を許可（管理者なら成功・失敗しても続行）----
netsh advfirewall firewall add rule name="LynkOS Django 8000" dir=in action=allow protocol=TCP localport=8000 profile=private,domain >nul 2>&1

echo ============================================
echo  LynkOS 起動中...
echo ============================================

rem -- 1. 既存の Django プロセスをクリーンアップ ─────
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING" 2^>nul') do (taskkill /PID %%a /F >nul 2>&1)
timeout /t 1 /nobreak > nul

rem -- 2. フロントエンドをビルド ──────────────────────
echo [1/2] フロントエンドをビルド中... (30秒ほどかかります)
cd frontend
call npm run build
if errorlevel 1 (
    echo.
    echo [エラー] ビルドに失敗しました。
    pause
    exit /b 1
)
cd ..
echo     ビルド完了

rem -- 3. Django 起動 ──────────────────────────────────
echo [2/2] Django を起動中...
start "LynkOS - Django" cmd /k "cd /d %~dp0backend && set DJANGO_DEBUG=true&& set DJANGO_ALLOWED_HOSTS=*&& set DJANGO_SECRET_KEY=local-start-all&& call venv\Scripts\activate.bat && daphne -b 0.0.0.0 -p 8000 config.asgi:application"

echo     起動を待機中...
:wait_django
timeout /t 2 /nobreak > nul
curl -s http://127.0.0.1:8000/api/health/ >nul 2>&1
if errorlevel 1 goto wait_django
echo     Django OK

rem -- 4. ブラウザを開く ───────────────────────────────
timeout /t 1 /nobreak > nul
start "" http://127.0.0.1:8000

echo.
echo ============================================
echo  起動完了！
echo.
echo  PC ブラウザ : http://127.0.0.1:8000
echo  スマホ/PWA : http://%LAN_IP%:8000
echo.
echo  ※ PC とスマホは同じ Wi-Fi にしてください。
echo  ※ iOS は Safari で開き「ホーム画面に追加」で PWA にできます。
echo  ※ iOS で「ローカルネットワーク」を許可（設定アプリ）
echo  ※ 接続できないときは上の IP が PC の ipconfig と一致するか確認
echo.
echo  ※コードを変更したら、もう一度 start_all.bat を
echo    実行してリビルドしてください。
echo.
echo  停止するときは「LynkOS - Django」ウィンドウを
echo  閉じてください。
echo ============================================
timeout /t 5 /nobreak > nul
