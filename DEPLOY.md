# LynkOS 本番デプロイ手順

## 構成の選び方

| 方式 | フロント | バックエンド | 備考 |
|------|----------|--------------|------|
| A. モノリス | Django が `frontend/dist` を配信 | 同一ホスト | 環境変数が少ない。`VITE_BACKEND_ORIGIN` は不要。 |
| B. 分割 | Vercel / Netlify | Render / Railway | フロントのビルド時に `VITE_BACKEND_ORIGIN` を API の HTTPS URL に設定。 |

いずれも **HTTPS**（WSS）が前提です。モバイル＋別ネットワークでは **TURN** が無いと接続できない場合があります（`VITE_ICE_SERVERS_JSON` で追加）。

## バックエンド必須環境変数（本番）

- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY` … 十分に長いランダム文字列
- `DJANGO_ALLOWED_HOSTS` … カンマ区切り（例: `lynkos.onrender.com`）
- `CORS_ALLOWED_ORIGINS` … **フロントが別ドメインのときのみ** カンマ区切りで設定。未設定なら CORS ミドルウェアは無効（モノリス同一オリジン向け）

詳細は `backend/.env.example` を参照。

## Render（モノリス例）

1. リポジトリを接続し、Root をリポジトリルートにする。
2. Build Command: `chmod +x scripts/render-build.sh && ./scripts/render-build.sh`
3. Start Command: `cd backend && daphne -b 0.0.0.0 -p $PORT config.asgi:application`
4. 上記の環境変数を設定。フロントを別ホストに置く場合だけ `CORS_ALLOWED_ORIGINS` にフロントの `https://...` を設定。
5. 参考: ルートの `render.yaml`。

初回はダッシュボードまたは SSH で `python manage.py migrate` を実行。

## Railway

`Procfile` の `web` コマンドを使用。ビルドでフロントを `npm run build` し、バックエンドで `collectstatic` する手順は Render と同様にカスタムビルドコマンドで指定。

## Netlify（フロントのみ・分割）

1. Base directory: `frontend`
2. Build: `npm run build`
3. Publish: `dist`
4. `frontend/netlify.toml` を利用可。
5. Site settings → Environment に `VITE_BACKEND_ORIGIN=https://（API の URL）` を設定してから再ビルド。

## Vercel（フロントのみ・分割）

1. Root Directory: `frontend`
2. Framework Preset: Vite
3. Environment Variables に `VITE_BACKEND_ORIGIN` を設定。

## WebRTC / TURN

既定で Google STUN が有効です。`VITE_ICE_SERVERS_JSON` に TURN 等を JSON 配列で渡すと、**既定 STUN に連結**されます。対称型 NAT 等では TURN が必要になることがあります。

## ローカル開発

- バックエンド: `DJANGO_DEBUG=true` と `DJANGO_ALLOWED_HOSTS`（例: `*` または `127.0.0.1`）を設定。`start_all.bat` / `start_backend.bat` は起動時に開発用の環境変数を付与します。
- フロント: `frontend/.env.development` の `VITE_DEV_PROXY_TARGET` で API をプロキシ（既定 `http://127.0.0.1:8000`）。`npm run dev` で Vite（既定ポートは `VITE_DEV_PORT` または 5173）。
