/**
 * API / WebSocket のベース URL。
 *
 * VITE_BACKEND_ORIGIN（末尾スラッシュなし）を主に使用。
 * - 開発: 未設定なら相対パス（Vite プロキシ）／設定時はそのオリジンへ直結
 * - 本番: 未設定なら window.location.origin（Django が同一ホストで SPA を配信）
 *
 * 本番の分割デプロイではビルド時に VITE_BACKEND_ORIGIN を必ず指定すること。
 */

const { protocol, hostname, port } = window.location
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'

const configuredOrigin = String(import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '')

function apiBase() {
  if (configuredOrigin) return configuredOrigin
  if (import.meta.env.DEV) return ''
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
    const p = port ? `:${port}` : ''
    return `${wsProtocol}//${hostname}${p}`
  }
  if (configuredOrigin) return toWsOrigin(configuredOrigin)
  return sameOriginWsBase()
}

export const WS_BASE = wsBase()
