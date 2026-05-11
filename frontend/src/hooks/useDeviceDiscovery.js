import { useState, useEffect, useRef } from 'react'
import { API_BASE, WS_BASE } from '../lib/serverUrl'
import { MAX_DEVICE_ICON_CHARS } from '../lib/deviceDisplay'

/** WebSocket 切断時のみ短い間隔で一覧を取りに行く */
const POLL_FALLBACK_MS = 3500
/** WS 接続中はサーバー側 TTL(45s) を踏まえた登録更新のみ（ターミナル・端末負荷を抑える） */
const HEARTBEAT_MS = 22_000
const PRESENCE_PATH = '/ws/presence/'

function generateDeviceId() {
  const stored = localStorage.getItem('lynkos-device-id')
  if (stored) return stored
  const id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  localStorage.setItem('lynkos-device-id', id)
  return id
}

function detectPlatform() {
  const ua    = navigator.userAgent
  const touch = navigator.maxTouchPoints > 1

  if (/iPhone/i.test(ua))                return 'iphone'
  if (/iPad/i.test(ua))                  return 'ipad'
  if (/Android/i.test(ua))              return 'android'
  if (/Macintosh/i.test(ua) && touch)   return 'ipad'
  if (/Macintosh|Mac OS/i.test(ua))     return 'mac'
  if (/Windows/i.test(ua))              return 'windows'
  if (touch)                             return 'iphone'
  return 'desktop'
}

function detectDeviceType() {
  const p = detectPlatform()
  return (p === 'iphone' || p === 'ipad' || p === 'android') ? 'mobile' : 'desktop'
}

function getDefaultDeviceName() {
  const stored = localStorage.getItem('lynkos-device-name')
  if (stored) return stored
  const p    = detectPlatform()
  const name = p === 'iphone'  ? 'iPhone'
             : p === 'ipad'    ? 'iPad'
             : p === 'android' ? 'Android'
             : p === 'mac'     ? 'Mac'
             : `PC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  localStorage.setItem('lynkos-device-name', name)
  return name
}

export default function useDeviceDiscovery(overrideName = null, profileRev = 0) {
  const [devices,    setDevices]    = useState([])
  const [myDevice,   setMyDevice]   = useState(null)
  const [fetchError, setFetchError] = useState(false)
  const intervalRef = useRef(null)
  const pollBusyRef = useRef(false)
  const myIdRef = useRef('')
  const presenceWsRef = useRef(null)
  const presenceReconnectRef = useRef(null)
  const presenceBackoffRef = useRef(1500)
  /** React 18 Strict Mode 二重マウントで古い WebSocket のコールバックを無効化 */
  const presenceEffectGenRef = useRef(0)

  useEffect(() => {
    const effectGen = ++presenceEffectGenRef.current
    const id       = generateDeviceId()
    myIdRef.current = id
    const platform = detectPlatform()
    const type     = detectDeviceType()
    const name     = overrideName ?? getDefaultDeviceName()
    const readStoredIconRaw = () => {
      try {
        const s = localStorage.getItem('lynkos-device-icon')
        if (typeof s !== 'string') return ''
        return s.trim()
      } catch {
        return ''
      }
    }

    const iconRaw = readStoredIconRaw()
    const me = {
      deviceId: id,
      name,
      type,
      platform,
      ...(iconRaw ? { icon: iconRaw } : {}),
    }
    setMyDevice(me)

    const normalizeIncomingDevice = (incoming) => {
      const deviceId = incoming.deviceId ?? incoming.id
      if (!deviceId) return null
      const row = {
        deviceId,
        name:     incoming.name ?? '不明なデバイス',
        type:     incoming.type ?? 'unknown',
        platform: incoming.platform ?? '',
      }
      if (incoming.icon) row.icon = incoming.icon
      return row
    }

    const sendDeviceInfo = (ws) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const raw = readStoredIconRaw()
      const nm =
        overrideName != null && String(overrideName).trim() !== ''
          ? String(overrideName).trim()
          : getDefaultDeviceName()
      const payloadIcon =
        raw && raw.length <= MAX_DEVICE_ICON_CHARS ? raw : ''
      const device = {
        deviceId: id,
        name:     nm,
        type,
        platform,
        ...(payloadIcon ? { icon: payloadIcon } : {}),
      }
      try {
        ws.send(JSON.stringify({ type: 'device-info', device }))
      } catch {
        /*  */
      }
    }

    const register = () => {
      const raw = readStoredIconRaw()
      const nm =
        overrideName != null && String(overrideName).trim() !== ''
          ? String(overrideName).trim()
          : getDefaultDeviceName()
      const payloadIcon =
        raw && raw.length <= MAX_DEVICE_ICON_CHARS ? raw : ''
      return fetch(`${API_BASE}/api/devices/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          deviceId: id,
          name:     nm,
          type,
          platform,
          ...(payloadIcon ? { icon: payloadIcon } : {}),
        }),
      })
    }

    const fetchDevices = () =>
      fetch(`${API_BASE}/api/devices/`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((list) => {
          setFetchError(false)
          setDevices(list.filter((d) => d.deviceId !== myIdRef.current))
        })
        .catch(() => {
          setFetchError(true)
        })

    const pollFull = async () => {
      if (document.hidden || pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        try {
          await register()
        } catch {
          /* 登録失敗でも一覧は試す */
        }
        sendDeviceInfo(presenceWsRef.current)
        await fetchDevices()
      } finally {
        pollBusyRef.current = false
      }
    }

    /** WS が生きているときは TTL 維持の POST のみ（一覧は WS の devices-changed で更新） */
    const heartbeatRegister = async () => {
      if (document.hidden || pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        try {
          await register()
        } catch {
          /*  */
        }
        sendDeviceInfo(presenceWsRef.current)
      } finally {
        pollBusyRef.current = false
      }
    }

    const restartPolling = () => {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      const wsUp = presenceWsRef.current?.readyState === WebSocket.OPEN
      const delay = wsUp ? HEARTBEAT_MS : POLL_FALLBACK_MS
      const runner = wsUp ? heartbeatRegister : pollFull
      intervalRef.current = window.setInterval(runner, delay)
    }

    const connectPresenceWs = () => {
      if (effectGen !== presenceEffectGenRef.current) return
      if (presenceReconnectRef.current != null) {
        clearTimeout(presenceReconnectRef.current)
        presenceReconnectRef.current = null
      }
      const prev = presenceWsRef.current
      if (prev) {
        try {
          prev.close()
        } catch (_) { /*  */ }
      }
      presenceWsRef.current = null
      const url = `${WS_BASE}${PRESENCE_PATH}`
      let ws
      try {
        ws = new WebSocket(url)
      } catch {
        presenceReconnectRef.current = window.setTimeout(
          connectPresenceWs,
          presenceBackoffRef.current
        )
        return
      }
      presenceWsRef.current = ws

      ws.onopen = () => {
        if (effectGen !== presenceEffectGenRef.current) {
          try {
            ws.close()
          } catch (_) { /*  */ }
          return
        }
        presenceBackoffRef.current = 1500
        restartPolling()
        sendDeviceInfo(ws)
        void fetchDevices()
      }

      ws.onmessage = (ev) => {
        if (effectGen !== presenceEffectGenRef.current) return
        try {
          const data = JSON.parse(ev.data)
          if (
            data?.type === 'device-info' &&
            data.device &&
            typeof data.device === 'object'
          ) {
            const row = normalizeIncomingDevice(data.device)
            if (!row || row.deviceId === myIdRef.current) {
              return
            }
            setDevices((prev) => {
              const i = prev.findIndex((d) => d.deviceId === row.deviceId)
              if (i === -1) {
                return [...prev, row].filter(
                  (d) => d.deviceId !== myIdRef.current
                )
              }
              const next = [...prev]
              next[i] = row
              return next
            })
            return
          }
        } catch {
          /* full refetch */
        }
        void fetchDevices()
      }

      ws.onerror = () => {
        try {
          ws.close()
        } catch (_) { /*  */ }
      }

      ws.onclose = () => {
        if (presenceWsRef.current === ws) presenceWsRef.current = null
        if (effectGen !== presenceEffectGenRef.current) return
        restartPolling()
        presenceBackoffRef.current = Math.min(
          Math.round(presenceBackoffRef.current * 1.6),
          12000
        )
        presenceReconnectRef.current = window.setTimeout(
          connectPresenceWs,
          presenceBackoffRef.current
        )
      }
    }

    void pollFull()
    connectPresenceWs()
    restartPolling()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollFull()
    }
    document.addEventListener('visibilitychange', onVisible)

    const onUnload = () => {
      const blob = new Blob(
        [JSON.stringify({ deviceId: id })],
        { type: 'application/json' }
      )
      const base = API_BASE || window.location.origin
      navigator.sendBeacon(`${base}/api/devices/delete/`, blob)
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      presenceEffectGenRef.current += 1
      clearInterval(intervalRef.current)
      if (presenceReconnectRef.current != null) {
        clearTimeout(presenceReconnectRef.current)
        presenceReconnectRef.current = null
      }
      const w = presenceWsRef.current
      presenceWsRef.current = null
      if (w && w.readyState === WebSocket.OPEN) {
        try {
          w.close()
        } catch (_) { /*  */ }
      }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [overrideName, profileRev])

  return { devices, myDevice, fetchError }
}
