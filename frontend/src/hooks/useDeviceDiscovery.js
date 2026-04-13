import { useState, useEffect, useRef } from 'react'
import { API_BASE, WS_BASE } from '../lib/serverUrl'

/** フォールバック用ポーリング（1 秒未満） */
const POLL_MS = 800
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

export default function useDeviceDiscovery(overrideName = null) {
  const [devices,    setDevices]    = useState([])
  const [myDevice,   setMyDevice]   = useState(null)
  const [fetchError, setFetchError] = useState(false)
  const intervalRef = useRef(null)
  const pollBusyRef = useRef(false)
  const myIdRef = useRef('')
  const presenceWsRef = useRef(null)
  const presenceReconnectRef = useRef(null)
  const presenceBackoffRef = useRef(1500)

  useEffect(() => {
    const id       = generateDeviceId()
    myIdRef.current = id
    const platform = detectPlatform()
    const type     = detectDeviceType()
    const name     = overrideName ?? getDefaultDeviceName()
    const me       = { deviceId: id, name, type, platform }
    setMyDevice(me)

    const register = () =>
      fetch(`${API_BASE}/api/devices/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(me),
      })

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

    /** 登録完了後に一覧取得（GET が POST より先に終わる取りこぼしを減らす） */
    const tick = async () => {
      if (document.hidden || pollBusyRef.current) return
      pollBusyRef.current = true
      try {
        try {
          await register()
        } catch {
          /* 登録失敗でも一覧は試す */
        }
        await fetchDevices()
      } finally {
        pollBusyRef.current = false
      }
    }

    const connectPresenceWs = () => {
      if (presenceReconnectRef.current != null) {
        clearTimeout(presenceReconnectRef.current)
        presenceReconnectRef.current = null
      }
      try {
        presenceWsRef.current?.close()
      } catch (_) { /*  */ }
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
        presenceBackoffRef.current = 1500
      }

      ws.onmessage = () => {
        void fetchDevices()
      }

      ws.onerror = () => {
        try {
          ws.close()
        } catch (_) { /*  */ }
      }

      ws.onclose = () => {
        presenceWsRef.current = null
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

    tick()
    connectPresenceWs()
    intervalRef.current = window.setInterval(tick, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
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
      clearInterval(intervalRef.current)
      if (presenceReconnectRef.current != null) {
        clearTimeout(presenceReconnectRef.current)
        presenceReconnectRef.current = null
      }
      try {
        presenceWsRef.current?.close()
      } catch (_) { /*  */ }
      presenceWsRef.current = null
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [overrideName])

  return { devices, myDevice, fetchError }
}
