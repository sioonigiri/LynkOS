# LynkOS iOS

Phase A: 通信基盤（WebSocket + デバイス登録 + 接続デバッグ UI）

## 前提

- Xcode 15 以上（iOS 17+ SDK）
- iPhone 実機 + Mac を同一 Wi-Fi に接続
- Mac で Django を `0.0.0.0:8000` で起動

## 1. Django を LAN 公開で起動

```bash
cd backend
source .venv/bin/activate   # または Windows の Activate
export DJANGO_DEBUG=true
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

Mac の IPv4 を確認:

```bash
ipconfig getifaddr en0
# 例: 192.168.0.12
```

## 2. Xcode で開く

```bash
open ios/LynkOS.xcodeproj
```

1. **Signing & Capabilities** で Development Team を設定
2. 実機を接続して Run

## 3. アプリ利用（サーバー URL 入力は不要）

同一 Wi-Fi で Django を起動すると、iOS は Bonjour（`_lynkos-hub._tcp`）でシグナリングサーバーを自動検出します。

**デベロッパーモード**は DEBUG ビルドの設定にのみ表示されます。Release（App Store 配布版）では項目ごと非表示で、手動サーバー URL の上書きも無効です。

## 4. Phase A 完了条件

| 項目 | 確認方法 |
|------|----------|
| Presence WS | 接続状態が「接続済み」 |
| Inbox WS | 接続状態が「接続済み」 |
| HTTP 登録 | Django ログ / `GET /api/devices/` に iOS が表示 |
| Web 相互表示 | Mac ブラウザ（Web 版）の一覧に iPhone が出る |

### Web 版（Mac ブラウザ）を同じサーバーに接続

```bash
cd frontend
VITE_DEV_API_ORIGIN=http://192.168.x.x:8000 npm run dev
```

ブラウザで `http://localhost:5173` を開くと、Web 版も同じ Django に接続します。

## プロジェクト構成

```text
ios/
├── LynkOS.xcodeproj/     Xcode プロジェクト
├── LynkOS/               SwiftUI アプリ
│   ├── LynkOSApp.swift
│   ├── ContentView.swift
│   ├── ViewModels/
│   └── Views/
└── LynkOSCore/           共有 Swift Package
    └── Sources/LynkOSCore/
        ├── Config/           ServerConfig
        ├── Identity/         DeviceIdentity (Keychain)
        ├── Discovery/        DeviceRegistrationService
        ├── WebSocket/        Presence / Inbox / Signaling
        └── LynkOSConnectionHub.swift
```

## 次の Phase

- **Phase B**: デバイス一覧 UI の磨き込み（Phase A で基本表示済み）
- **Phase C**: 許可/拒否ダイアログ
- **Phase D/E**: WebRTC 転送
- **Phase G**: Share Extension

## トラブルシュート

### 接続できない / 再接続を繰り返す

**Django が LAN 上で見つからない**

- `daphne` 起動時に `[LynkOS/mDNS] Hub advertised: http://192.168.x.x:8000` が出ているか
- `pip install zeroconf` 済みか（`backend/requirements.txt`）
- デベロッパーモードで手動 URL を上書きしていないか

その他:

- Mac ファイアウォールで 8000 番を許可
- `daphne -b 0.0.0.0 -p 8000` で起動しているか（`127.0.0.1` バインドだけでは不可）
- iPhone: **設定 → プライバシーとセキュリティ → ローカルネットワーク → LynkOS** をオン
- サーバー URL は `http://` で始める（`ws://` でも自動変換されます）
- アプリ画面の「直近のエラー」に接続先 URL が表示されます

### Xcode がない / ビルドできない

フル Xcode（App Store 版）が必要です。Command Line Tools のみでは iOS アプリはビルドできません。

### ATS / ローカル HTTP

`Info.plist` に `NSAllowsLocalNetworking` を設定済みです。LAN 内の `http://192.168.x.x` への接続が可能です。
