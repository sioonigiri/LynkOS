# LynkOS

同一 Wi-Fi 内のデバイス間で、AirDrop のようにファイルを送受信する **PWA（プログレッシブウェブアプリ）**。  
アカウント不要・WebRTC P2P 転送・Django はシグナリングとデバイス一覧のみ（ファイル中身はサーバーを経由しません）。

詳細な方針はリポジトリ直下の `concept.md` を参照してください。

### 接続のしかた（要約）

1. **双方**のブラウザで、近くのデバイス一覧から**お互い**を選ぶ。  
2. 表示される **短いセッション ID** を相手画面と照合し、「相手の ID と一致した」で確認する。  
3. 接続状態（シグナリング・ICE・データチャネル）がダイアログに表示され、準備ができたらファイル送信が有効になる。

---

## 起動方法（開発）

### バックエンド（Django + Daphne）

```powershell
cd backend
.\venv\Scripts\activate
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

### フロントエンド（Vite）

```powershell
cd frontend
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く（API / WS は `vite.config.js` のプロキシで :8000 に転送）。

### Windows 一括起動（本番ビルド + Django）

リポジトリ直下の `start_all.bat` を実行すると、フロントをビルドして Django が `http://localhost:8000` で配信します。

---

## PWA として使う

1. **PC とスマホを同じ Wi-Fi に接続**
2. PC の IPv4 を確認（`ipconfig` など）
3. スマホのブラウザで `http://<PCのIP>:8000`（または開発時は Vite の URL）を開く
4. **iOS Safari**: 共有 → **ホーム画面に追加**  
   **Android Chrome**: メニュー → **ホーム画面に追加** または **アプリをインストール**

> 本番（`npm run build` 後に Django から配信）では Service Worker が登録され、Chrome などでインストールしやすくなります。`npm run dev` では SW は無効です。

---

## 本番ビルド

```powershell
cd frontend
npm run build
```

生成物は `frontend/dist/`。Django から静的ファイルとして配信する構成を想定しています。

---

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React + Vite |
| P2P 転送 | WebRTC DataChannel |
| シグナリング | Django Channels (WebSocket) |
| クライアント形態 | PWA（ブラウザ） |
| バックエンド | Django + Daphne |

---

## ディレクトリ構成（概要）

```
LynkOS/
├── backend/          Django・Channels・デバイス API
├── frontend/
│   ├── public/       manifest.json・sw.js・アイコン
│   └── src/
└── start_all.bat     Windows 用まとめ起動
```
