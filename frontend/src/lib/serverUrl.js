/**
 * API / WebSocket のベース URL。
 *
 * - VITE_BACKEND_ORIGIN（末尾スラッシュなし）: 本番・ステージングで最優先
 * - 開発（import.meta.env.DEV）:
 *   - VITE_DEV_USE_PROXY=true のとき: API_BASE は '' → `/api/...` を Vite がプロキシ
 *   - それ以外（既定）: VITE_DEV_API_ORIGIN または http://127.0.0.1:8000 に直結（CORS は Django DEBUG 時に緩和）
 *
 * スマホから LAN IP で叩く場合は .env.development で
 * VITE_DEV_API_ORIGIN=http://192.168.x.x:8000 を指定。
 *
 * 本番の分割デプロイではビルド時に VITE_BACKEND_ORIGIN を指定すること。
 */

const { protocol, hostname, port } = window.location
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'

const configuredOrigin = String(import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '')

const devUseProxy =
  String(import.meta.env.VITE_DEV_USE_PROXY || '').toLowerCase() === 'true' ||
  import.meta.env.VITE_DEV_USE_PROXY === '1'

function defaultDevApiOrigin() {
  const fromEnv = String(import.meta.env.VITE_DEV_API_ORIGIN || '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = hostname.toLowerCase()
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `${protocol}//${hostname}:8000`
  }
  return 'http://127.0.0.1:8000'
}

const devApiOrigin = defaultDevApiOrigin()

function apiBase() {
  if (configuredOrigin) return configuredOrigin
  if (import.meta.env.DEV) {
    if (devUseProxy) return ''
    return devApiOrigin
  }
  return window.location.origin
}

export const API_BASE = apiBase()

function toWsOrigin(httpOrigin) {
  try {
    const u = new URL(httpOrigin)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}`
  } catch {
    return sameOriginWsBase()
  }
}

function sameOriginWsBase() {
  const p = port || ''
  const isDefaultHttps = protocol === 'https:' && (!p || p === '443')
  const isDefaultHttp = protocol === 'http:' && (!p || p === '80')
  if (isDefaultHttps || isDefaultHttp) {
    return `${wsProtocol}//${hostname}`
  }
  return `${wsProtocol}//${hostname}:${p}`
}

function wsBase() {
  if (import.meta.env.DEV) {
    if (configuredOrigin) return toWsOrigin(configuredOrigin)
    // API と同じオリジンに WS（runserver の Channels）
    if (API_BASE) return toWsOrigin(API_BASE)
    const p = port ? `:${port}` : ''
    return `${wsProtocol}//${hostname}${p}`
  }
  if (configuredOrigin) return toWsOrigin(configuredOrigin)
  return sameOriginWsBase()
}

export const WS_BASE = wsBase()
