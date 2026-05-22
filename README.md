# LynkOS

AirDrop のように、
iPhone・Windows・PC 間でファイルを直接送受信できるクロスプラットフォーム共有システム。

LynkOS は、同一 Wi-Fi 内のデバイス同士を自動検出し、アカウント不要で高速な P2P ファイル転送を行う **PWA（プログレッシブウェブアプリ）** です。

* アカウント不要
* WebRTC による P2P 転送
* サーバーはシグナリングのみ
* ファイル本体はサーバー非経由
* iPhone / Windows / ブラウザ対応
* ホーム画面追加によるアプリ化対応

> AirDrop のような体験を、OS を超えて実現することを目的に開発しています。

詳細なコンセプトや設計思想については、リポジトリ直下の `concept.md` を参照してください。

---

# Features

* Nearby device discovery
* Cross-platform file sharing
* WebRTC DataChannel transfer
* WebSocket signaling
* Session ID verification
* PWA install support
* Serverless file transfer architecture

---

# How It Works

1. **双方**のブラウザで近くのデバイス一覧から**お互い**を選択
2. 表示される短い **Session ID** を相手画面と照合
3. 接続状態（Signaling / ICE / DataChannel）を確認
4. 接続完了後、ファイル送信が可能になります

---

# Architecture

```text
┌────────────┐        WebRTC P2P        ┌────────────┐
│   iPhone   │ ◀────────────────────▶ │  Windows   │
└────────────┘                          └────────────┘
         \                                /
          \                              /
           \      WebSocket Signaling   /
            ───────────────────────────
                    Django Channels
```

* ファイル本体は P2P 転送
* Django は接続仲介とデバイス一覧管理のみ
* サーバーはファイル内容を保持しません

---

# Tech Stack

| Role         | Technology                  |
| ------------ | --------------------------- |
| Frontend     | React + Vite                |
| P2P Transfer | WebRTC DataChannel          |
| Signaling    | Django Channels (WebSocket) |
| Backend      | Django + Daphne             |
| Client Type  | PWA (Browser App)           |

---

# Directory Structure

```text
LynkOS/
├── backend/          Django・Channels・Device API
├── frontend/
│   ├── public/       manifest.json・sw.js・icons
│   └── src/
├── scripts/
├── concept.md
└── start_all.bat
```

---

# Initial Setup (Backend)

仮想環境 `.venv` は Git に含まれません。
初回のみ `backend` ディレクトリで作成してください。

## Windows (PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## macOS / Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> Python 3.10 以上を推奨します。

---

# Development

## Backend (Django + Daphne)

### Windows

```powershell
cd backend
.\.venv\Scripts\activate
$env:DJANGO_DEBUG="true"
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

### macOS / Linux

```bash
cd backend
source .venv/bin/activate
export DJANGO_DEBUG=true
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

> `DJANGO_DEBUG=true` を付けることで LAN 内アクセス時の `DisallowedHost` エラーを回避できます。

---

## Frontend (Vite)

```bash
cd frontend
npm install
npm run dev
```

ブラウザで以下を開きます。

```text
http://localhost:5173
```

Vite は既定で `http://127.0.0.1:8000` に API / WebSocket をプロキシします。

---

# PWA Installation

1. PC とスマホを同じ Wi-Fi に接続
2. PC の IPv4 アドレスを確認
3. スマホから `http://<PCのIP>:8000` を開く

## iOS Safari

共有 → 「ホーム画面に追加」

## Android Chrome

メニュー → 「ホーム画面に追加」または「アプリをインストール」

---

# Production Build

```bash
cd frontend
npm run build
```

生成物は `frontend/dist/` に出力されます。

Django から静的ファイルとして配信する構成を想定しています。

---

# Deployment

* Frontend: Vercel
* Backend: Render

設定例は `DEPLOY.md` を参照してください。

---

# Vision

LynkOS は、OS に依存しないシームレスなファイル共有体験を目指しています。

AirDrop のような「近くにいるだけで送れる」体験を、
iPhone・Windows・Web の境界を越えて実現することが目標です。
