import { useEffect, useRef, useCallback } from 'react'
import { WS_BASE } from '../lib/serverUrl'

export function inboxWsPath(deviceId) {
  if (!deviceId) return ''
  return `${WS_BASE}/ws/inbox/${encodeURIComponent(deviceId)}/`
}

/**
 * 端末受信箱（transfer_request / transfer_accept / transfer_reject / transfer_cancel）
 */
export default function useInbox(deviceId, callbacks) {
  const cbRef = useRef(callbacks)
  useEffect(() => {
    cbRef.current = callbacks
  }, [callbacks])

  const wsRef = useRef(null)
  const pingTimerRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const backoffRef = useRef(1000)
  const sendRef = useRef(() => {})

  const clearTimers = () => {
    if (pingTimerRef.current != null) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }

  const sendInbox = useCallback((payload) => {
    const w = wsRef.current
    if (!w || w.readyState !== WebSocket.OPEN) return false
    try {
      w.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }, [])

  sendRef.current = sendInbox

  useEffect(() => {
    if (!deviceId) return undefined

    let stopped = false
    let ws

    const scheduleReconnect = () => {
      if (stopped) return
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        if (!stopped) connect()
      }, backoffRef.current)
      backoffRef.current = Math.min(Math.round(backoffRef.current * 1.5), 12_000)
    }

    const connect = () => {
      if (stopped) return
      clearTimers()
      try {
        wsRef.current?.close()
      } catch (_) { /*  */ }
      wsRef.current = null

      const url = inboxWsPath(deviceId)
      try {
        ws = new WebSocket(url)
      } catch {
        scheduleReconnect()
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        if (stopped) return
        backoffRef.current = 1500
        pingTimerRef.current = window.setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(JSON.stringify({ type: 'ping' }))
            } catch (_) { /*  */ }
          }
        }, 20_000)
      }

      ws.onmessage = (ev) => {
        if (stopped) return
        let msg
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'pong') return
        const c = cbRef.current
        if (msg.type === 'transfer_request') c.onTransferRequest?.(msg)
        else if (msg.type === 'transfer_accept') c.onTransferAccept?.(msg)
        else if (msg.type === 'transfer_reject') c.onTransferReject?.(msg)
        else if (msg.type === 'transfer_cancel') c.onTransferCancel?.(msg)
      }

      ws.onerror = () => {
        try {
          ws.close()
        } catch (_) { /*  */ }
      }

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        clearTimers()
        if (stopped) return
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      stopped = true
      clearTimers()
      try {
        wsRef.current?.close()
      } catch (_) { /*  */ }
      wsRef.current = null
    }
  }, [deviceId])

  return { sendInbox }
}
