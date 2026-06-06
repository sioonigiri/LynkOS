import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { WS_BASE } from '../lib/serverUrl'
import { getIceServers } from '../lib/webrtcIceServers'
import { logError, logConnectionFailure } from '../lib/logger'
import {
  INLINE_RECEIVE_MAX,
  rxAppendChunk,
  rxDeleteTransfer,
} from '../lib/receiveStorage'
import { iconForNetworkPayload } from '../lib/deviceDisplay'

const _dev = import.meta.env.DEV
const devLog = (...a) => {
  if (_dev) console.log(...a)
}
const devWarn = (...a) => {
  if (_dev) console.warn(...a)
}

const CHUNK_SIZE       = 64 * 1024
/** bufferedAmount がこれを超えたら送信をブロック（backpressure） */
const BUFFER_THRESHOLD = 16 * CHUNK_SIZE
/** やや下がるまで待つとパケット詰まりが減る（任意） */
const BUFFER_DRAIN_TARGET = 8 * CHUNK_SIZE

async function waitChannelDrain(channel) {
  while (channel.bufferedAmount > BUFFER_THRESHOLD) {
    await new Promise((r) => setTimeout(r, 8))
  }
  while (channel.bufferedAmount > BUFFER_DRAIN_TARGET) {
    await new Promise((r) => setTimeout(r, 4))
  }
}
// 短時間に peer-left / ICE failed が連続すると再接続が暴れるので短い遅延のみ
const RECONNECT_DEBOUNCE_MS = 280
/** ICE の一瞬の failed/disconnected で即再接続しない猶予（teardown 後は短くてよい） */
const ICE_RECOVER_MS = 650
// WS / シグナリングが通る前の連続失敗用（SDP 交換に成功したら下でリセットする）
const MAX_RECONNECT         = 24
const CONNECT_WATCHDOG_MS   = 9000
/** SDP 確定後 ICE/DC が進まないときのフォールバック */
const POST_SDP_ICE_STALL_MS = 6500
/** setRemoteDescription 直後に届く ICE を拾うための追い flush（1 回） */
const POST_REMOTE_FLUSH_DELAY_MS = 40
/** 送信側: 受信完了 ACK を待つ上限（受信側 IDB キューが空になるまで切断しない） */
const FILE_RECV_ACK_TIMEOUT_MS = 300_000
/** 転送中の一瞬の ICE disconnected を切断扱いにする猶予 */
const PEER_DISCONNECT_ABORT_MS = 550
/** DataChannel のみのオファー（メディアネゴ不要で軽量化） */
const OFFER_OPTIONS = {
  offerToReceiveAudio: false,
  offerToReceiveVideo: false,
}

function stripDataChannelHandlers(ch) {
  if (!ch) return
  ch.onopen = null
  ch.onclose = null
  ch.onmessage = null
}

function closeDataChannelSafe(ch) {
  if (!ch) return
  stripDataChannelHandlers(ch)
  try {
    ch.close()
  } catch (_) { /*  */ }
}

function stripPeerConnectionHandlers(pc) {
  if (!pc) return
  pc.oniceconnectionstatechange = null
  pc.onicegatheringstatechange = null
  pc.onsignalingstatechange = null
  pc.onconnectionstatechange = null
  pc.onicecandidate = null
  pc.ondatachannel = null
}

function closePeerConnectionSafe(pc) {
  if (!pc) return
  stripPeerConnectionHandlers(pc)
  try {
    pc.close()
  } catch (_) { /*  */ }
}

function stripWebSocketHandlers(ws) {
  if (!ws) return
  ws.onopen = null
  ws.onclose = null
  ws.onerror = null
  ws.onmessage = null
}

function closeWebSocketSafe(ws, code = 1000) {
  if (!ws) return
  stripWebSocketHandlers(ws)
  try {
    ws.close(code)
  } catch (_) { /*  */ }
}

/** 開発時: ICE / シグナリング状態を 1 行で追跡 */
function logIceSnapshot(sessionEpoch, pc, tag) {
  if (!_dev || !pc) return
  console.log(
    `[LynkOS/ICE #${sessionEpoch}] ${tag}`,
    `ice=${pc.iceConnectionState} gather=${pc.iceGatheringState} sig=${pc.signalingState} conn=${pc.connectionState}`
  )
}

export default function useWebRTC({
  targetDevice,
  /** 新しい接続試行のたびに呼ぶ */
  onConnectionReset,
  onProgress,
  onComplete,
  onReceiveRequest,
  /** 受信キュー UI: { queuedRequests, phase: 'idle'|'prompt'|'receiving' } */
  onInboundQueueChange,
  onReceive,   // 受信完了時: { id, name, size }
  onFailed,    // 再接続上限に達したとき
  onTransferAbort, // 転送中に相手切断などで中断したとき
}) {
  const [connectionState, setConnectionState] = useState('disconnected')
  /** PC + ICE + DataChannel がすべて有効なときのみ true（送信可否の唯一の基準） */
  const [transportReady, setTransportReady] = useState(false)
  /** UI 用: 接続確立までの内訳 */
  const [linkPhase, setLinkPhase] = useState('idle')
  /** ユーザー向け接続エラー（再接続上限・シグナリング失敗など） */
  const [connectionUserError, setConnectionUserError] = useState(null)

  const pcRef               = useRef(null)
  const wsRef               = useRef(null)
  const channelRef          = useRef(null)
  const makingOfferRef      = useRef(false)
  const ignoreOfferRef      = useRef(false)
  const politeRef           = useRef(false)
  const pendingCandidates   = useRef([])
  const reconnectCountRef   = useRef(0)
  const reconnectTimerRef   = useRef(null)
  const connectWatchdogRef  = useRef(null)
  const scheduleReconnectRef = useRef(null)
  const planAutoReconnectRef  = useRef(null)
  const recoverTimerRef     = useRef(null)
  const peerJoinOfferTimerRef = useRef(null)
  const wsPingTimerRef      = useRef(null)
  /** SDP stable 後、ICE/DC が開かないまま固まったときのフォールバック用 */
  const postSdpIceTimerRef  = useRef(null)
  /** ファイル送受信中は visibility / peer-left による再接続で DC を切らない */
  const transferBusyRef     = useRef(false)
  /** 受信キュー待ち・パイプライン占有中も再接続しない（iOS メモリ保護） */
  const inboundReceiveBusyRef = useRef(false)
  /** 送信ジョブを直列化（onmessage 奪い合いで 2 件目が拒否扱いになるのを防ぐ） */
  const sendChainRef = useRef(Promise.resolve())
  /** DataChannel 切断時の自動再接続を抑止（意図的同期切断） */
  const suppressAutoReconnectRef = useRef(false)
  const lastSyncDisconnectRef = useRef(0)
  const pcDisconnectedTimerRef = useRef(null)
  const handleSyncDisconnectRef = useRef((/** @type {boolean} */ _fromRemote) => {})
  const abortActiveTransferRef = useRef((/** @type {string} */ _reason) => {})
  const pcTransferAbortTimerRef = useRef(null)
  /** シグナリング／P2P セッション世代。fullReset のたびに進め、古い非同期ハンドラを無効化 */
  const signalingEpochRef = useRef(0)
  /** 許可後にのみ true — RTCPeerConnection を生成済み */
  const webrtcNegotiationStartedRef = useRef(false)
  const pendingOfferRef = useRef(null)
  /** connect() の二重入防止（複数 PC・競合 DC close の抑止） */
  const isConnectingRef = useRef(false)
  /** targetDevice の接続セッション世代（Strict Mode の二重 effect クリーンアップで誤 cleanup しない） */
  const linkSessionGenerationRef = useRef(0)
  /** transportReady 状態の同期（peer-left 等の非同期で state クロージャが古くなるのを防ぐ） */
  const transportReadyRef = useRef(false)
  /** 送信側: file-received-ack 待ち（onComplete / 切断を受信側のキュー消化後に合わせる） */
  const fileAckWaitersRef = useRef(new Map())

  const clearRecoverTimer = () => {
    if (recoverTimerRef.current != null) {
      clearTimeout(recoverTimerRef.current)
      recoverTimerRef.current = null
    }
  }
  const targetRef           = useRef(targetDevice)
  const connectParamsRef    = useRef(null)
  const connectRef          = useRef(null)
  const onReceiveRef        = useRef(onReceive)
  const onReceiveRequestRef = useRef(onReceiveRequest)
  const onInboundQueueChangeRef = useRef(onInboundQueueChange)
  const onFailedRef         = useRef(onFailed)
  const onTransferAbortRef  = useRef(onTransferAbort)
  const onConnectionResetRef = useRef(onConnectionReset)
  const refreshTransportRef  = useRef(() => {})

  useEffect(() => { transportReadyRef.current = transportReady }, [transportReady])
  useEffect(() => { targetRef.current  = targetDevice },  [targetDevice])
  useEffect(() => { onReceiveRef.current = onReceive },   [onReceive])
  useEffect(() => { onReceiveRequestRef.current = onReceiveRequest }, [onReceiveRequest])
  useEffect(() => { onInboundQueueChangeRef.current = onInboundQueueChange }, [onInboundQueueChange])
  useEffect(() => { onFailedRef.current  = onFailed },    [onFailed])
  useEffect(() => { onTransferAbortRef.current = onTransferAbort }, [onTransferAbort])
  useEffect(() => { onConnectionResetRef.current = onConnectionReset }, [onConnectionReset])

  const prevConnectionStateRef = useRef(null)
  useEffect(() => {
    const prev = prevConnectionStateRef.current
    prevConnectionStateRef.current = connectionState
    if (
      prev === 'connected' &&
      (connectionState === 'disconnected' ||
        connectionState === 'failed' ||
        connectionState === 'reconnecting')
    ) {
      /* 切断時 UI リセット用 */
    }
  }, [connectionState])

  // ──────────────────────────────────────────────
  // DataChannel セットアップ
  // ──────────────────────────────────────────────
  const setupChannel = useCallback((ch) => {
    channelRef.current = ch
    ch.binaryType = 'arraybuffer'

    const handleOpen = () => {
      if (channelRef.current !== ch) return
      devLog('[DC] open')
      clearRecoverTimer()
      clearTimeout(connectWatchdogRef.current)
      connectWatchdogRef.current = null
      if (postSdpIceTimerRef.current != null) {
        clearTimeout(postSdpIceTimerRef.current)
        postSdpIceTimerRef.current = null
      }
      reconnectCountRef.current = 0
      refreshTransportRef.current?.()
    }

    if (ch.readyState === 'open') {
      handleOpen()
    } else {
      ch.onopen = handleOpen
    }

    ch.onclose = () => {
      if (channelRef.current !== ch) return
      devLog('[DC] closed')
      if (transferBusyRef.current || inboundReceiveBusyRef.current) {
        abortActiveTransferRef.current?.('dc-closed')
        return
      }
      for (const [id, w] of [...fileAckWaitersRef.current.entries()]) {
        fileAckWaitersRef.current.delete(id)
        clearTimeout(w.t)
        w.reject(new Error('dc-closed'))
      }
      try {
        pendingInboundResolve?.(false)
      } catch (_) { /*  */ }
      pendingInboundResolve = null
      fileRequestQueue.length = 0
      inboundPipelineLocked = false
      inboundBatchExpected = 0
      inboundBatchCompleted = 0
      inboundPhase = 'idle'
      inboundReceiveBusyRef.current = false
      onInboundQueueChangeRef.current?.({ queuedRequests: 0, phase: 'idle' })
      transferBusyRef.current = false
      sendChainRef.current = Promise.resolve()
      setTransportReady(false)
      setLinkPhase('idle')
      const p = ch.peerConnection
      const allowReconnect =
        !suppressAutoReconnectRef.current &&
        p &&
        targetRef.current &&
        connectParamsRef.current
      setConnectionState('disconnected')
      if (!allowReconnect) {
        onConnectionResetRef.current?.()
      }
      if (allowReconnect) {
        planAutoReconnectRef.current?.(p)
      }
      suppressAutoReconnectRef.current = false
    }

    let meta         = null
    let receivedSize = 0
    /** 'idb' | 'fs' — バイナリは常に逐次 IDB または FileSystem Writable（RAM に全チャンク溜めない） */
    let receiveMode  = 'idb'
    let chunkSeq     = 0
    let diskWritable = null

    // ── 受信 file-request キュー（同時受信禁止・1 バッチ完了までロック）──
    const fileRequestQueue = []
    let inboundPipelineLocked = false
    let inboundBatchExpected = 0
    let inboundBatchCompleted = 0
    /** @type {'idle' | 'prompt' | 'receiving'} */
    let inboundPhase = 'idle'
    let pendingInboundResolve = null

    function emitInboundState() {
      onInboundQueueChangeRef.current?.({
        queuedRequests: fileRequestQueue.length,
        phase: inboundPhase,
      })
      inboundReceiveBusyRef.current =
        fileRequestQueue.length > 0 || inboundPipelineLocked
    }

    function finishInboundBatchOneFile() {
      if (inboundBatchExpected <= 0) return
      inboundBatchCompleted += 1
      if (inboundBatchCompleted < inboundBatchExpected) return
      inboundBatchExpected = 0
      inboundBatchCompleted = 0
      inboundPipelineLocked = false
      inboundPhase = 'idle'
      emitInboundState()
      processInboundFileRequestQueue()
    }

    function processInboundFileRequestQueue() {
      if (inboundPipelineLocked) return
      if (fileRequestQueue.length === 0) {
        emitInboundState()
        return
      }
      inboundPipelineLocked = true
      inboundPhase = 'prompt'
      const msg = fileRequestQueue.shift()
      emitInboundState()
      ;(async () => {
        try {
          const queuedBehind = fileRequestQueue.length
          let accepted = false
          if (msg.signalingPreApproved === true) {
            accepted = true
          } else {
            const cb = onReceiveRequestRef.current
            accepted = cb
              ? await new Promise((resolve) => {
                  pendingInboundResolve = resolve
                  cb({ ...msg, resolve, inboundQueuedBehind: queuedBehind })
                })
              : false
          }
          pendingInboundResolve = null
          if (!ch || ch.readyState !== 'open') {
            inboundPipelineLocked = false
            inboundPhase = 'idle'
            inboundBatchExpected = 0
            inboundBatchCompleted = 0
            emitInboundState()
            return
          }
          try {
            ch.send(JSON.stringify({ type: 'file-request-response', accepted }))
          } catch (_) { /*  */ }
          if (!accepted) {
            inboundPipelineLocked = false
            inboundPhase = 'idle'
            inboundBatchExpected = 0
            inboundBatchCompleted = 0
            emitInboundState()
            processInboundFileRequestQueue()
            return
          }
          const n = Array.isArray(msg.files) ? msg.files.length : 0
          if (n === 0) {
            inboundPipelineLocked = false
            inboundPhase = 'idle'
            emitInboundState()
            processInboundFileRequestQueue()
            return
          }
          inboundBatchExpected = n
          inboundBatchCompleted = 0
          inboundPhase = 'receiving'
          emitInboundState()
        } catch {
          pendingInboundResolve = null
          inboundPipelineLocked = false
          inboundPhase = 'idle'
          inboundBatchExpected = 0
          inboundBatchCompleted = 0
          emitInboundState()
          processInboundFileRequestQueue()
        }
      })()
    }

    let processQueue = Promise.resolve()
    const enqueue = (fn) => {
      processQueue = processQueue.then(fn).catch((err) => {
        logError('DC message queue', err)
      })
    }

    async function toArrayBuffer(data) {
      if (data instanceof ArrayBuffer) return data
      if (ArrayBuffer.isView(data)) {
        const v = data
        return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) return data.arrayBuffer()
      return null
    }

    ch.onmessage = (ev) => {
      enqueue(() => dispatch(ev))
    }

    async function dispatch(ev) {
      const { data } = ev
      if (typeof data === 'string') {
        let msg
        try { msg = JSON.parse(data) } catch { return }

        if (msg.type === 'file-received-ack') {
          const w = fileAckWaitersRef.current.get(msg.id)
          if (w) {
            fileAckWaitersRef.current.delete(msg.id)
            clearTimeout(w.t)
            w.resolve()
          }
          return
        }

        if (msg.type === 'file-request') {
          // 受信中でも必ずキューへ（reject しない）。processQueue が順に処理する。
          fileRequestQueue.push(msg)
          emitInboundState()
          processInboundFileRequestQueue()
          return
        }

        if (msg.type === 'file-meta') {
          transferBusyRef.current = true
          meta = msg
          receivedSize = 0
          chunkSeq = 0
          diskWritable = null
          receiveMode = 'idb'

          onProgress?.({
            id: msg.id,
            progress: 0,
            name: msg.name,
            size: msg.size,
            mimeType: msg.mime,
            direction: 'receiving',
          })

          const useFs =
            meta.size > INLINE_RECEIVE_MAX &&
            typeof window.showSaveFilePicker === 'function'
          if (useFs) {
            try {
              const handle = await window.showSaveFilePicker({
                suggestedName: meta.name,
              })
              diskWritable = await handle.createWritable()
              receiveMode = 'fs'
            } catch {
              receiveMode = 'idb'
            }
          }
          return
        }

        if (msg.type === 'file-end' && meta) {
          const saved = { ...meta }
          let recvOk = false
          try {
            if (receiveMode === 'fs' && diskWritable) {
              await diskWritable.close()
              diskWritable = null
              onReceiveRef.current?.({
                id:          saved.id,
                name:        saved.name,
                size:        saved.size,
                directSaved: true,
              })
            } else {
              let n = chunkSeq
              if (n === 0 && saved.size === 0) {
                await rxAppendChunk(saved.id, 0, new ArrayBuffer(0))
                n = 1
              }
              onReceiveRef.current?.({
                id:         saved.id,
                name:       saved.name,
                size:       saved.size,
                storageKey: saved.id,
                chunkCount: n,
                mimeType:   saved.mime,
              })
            }
            recvOk = true
          } catch (err) {
            logError('DC 受信完了処理失敗', err)
            onProgress?.({ id: saved.id, progress: 0, status: 'error' })
            rxDeleteTransfer(saved.id).catch(() => {})
            try {
              diskWritable?.close?.()
            } catch (_) { /*  */ }
            diskWritable = null
          } finally {
            transferBusyRef.current = false
          }

          if (recvOk && ch.readyState === 'open') {
            try {
              ch.send(JSON.stringify({ type: 'file-received-ack', id: saved.id }))
            } catch (_) { /*  */ }
          }

          meta = null
          receivedSize = 0
          chunkSeq = 0
          receiveMode = 'idb'
          finishInboundBatchOneFile()
        }
        return
      }

      if (!meta) return
      const ab = await toArrayBuffer(data)
      if (!ab) return

      if (receiveMode === 'fs' && diskWritable) {
        await diskWritable.write(new Uint8Array(ab))
      } else {
        await rxAppendChunk(meta.id, chunkSeq, ab)
        chunkSeq += 1
      }
      receivedSize += ab.byteLength
      const pct =
        meta.size > 0
          ? Math.min(99, Math.round((receivedSize / meta.size) * 100))
          : 0
      onProgress?.({ id: meta.id, progress: pct })
    }
  }, [onProgress])

  // ──────────────────────────────────────────────
  // fullReset: トランスポート完全破棄（冪等・複数回呼んでも安全）
  // ──────────────────────────────────────────────
  const fullReset = useCallback((opts = {}) => {
    const force = opts.force === true
    if (!force) {
      const pc = pcRef.current
      if (pc && pc.connectionState === 'connected') return
    }
    clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = null
    clearTimeout(connectWatchdogRef.current)
    connectWatchdogRef.current = null
    clearRecoverTimer()
    if (peerJoinOfferTimerRef.current != null) {
      clearTimeout(peerJoinOfferTimerRef.current)
      peerJoinOfferTimerRef.current = null
    }
    if (wsPingTimerRef.current != null) {
      clearInterval(wsPingTimerRef.current)
      wsPingTimerRef.current = null
    }
    if (postSdpIceTimerRef.current != null) {
      clearTimeout(postSdpIceTimerRef.current)
      postSdpIceTimerRef.current = null
    }
    if (pcDisconnectedTimerRef.current != null) {
      clearTimeout(pcDisconnectedTimerRef.current)
      pcDisconnectedTimerRef.current = null
    }

    for (const [, w] of [...fileAckWaitersRef.current.entries()]) {
      clearTimeout(w.t)
      w.reject(new Error('dc-closed'))
    }
    fileAckWaitersRef.current.clear()

    const ch = channelRef.current
    const pc = pcRef.current
    const ws = wsRef.current
    channelRef.current = null
    pcRef.current = null
    wsRef.current = null

    closeDataChannelSafe(ch)
    closePeerConnectionSafe(pc)
    closeWebSocketSafe(ws)

    pendingCandidates.current = []
    sendChainRef.current = Promise.resolve()
    refreshTransportRef.current = () => {}
    setTransportReady(false)
    webrtcNegotiationStartedRef.current = false
    pendingOfferRef.current = null
    // 古い WS メッセージ・ICE コールバックを無効化（await 越しの stale 処理防止）
    signalingEpochRef.current += 1
  }, [])

  // ──────────────────────────────────────────────
  // cleanup: fullReset + ルーム情報破棄（冪等）
  // ──────────────────────────────────────────────
  const cleanup = useCallback((silent = false) => {
    isConnectingRef.current = false
    fullReset({ force: true })
    connectParamsRef.current = null
    if (!silent) {
      setConnectionState('disconnected')
      setLinkPhase('idle')
      onConnectionResetRef.current?.()
    }
  }, [fullReset])

  const abortActiveTransfer = useCallback((reason) => {
    if (!transferBusyRef.current && !inboundReceiveBusyRef.current) return
    devLog('[transfer abort]', reason)
    if (pcTransferAbortTimerRef.current != null) {
      clearTimeout(pcTransferAbortTimerRef.current)
      pcTransferAbortTimerRef.current = null
    }
    for (const [id, w] of [...fileAckWaitersRef.current.entries()]) {
      fileAckWaitersRef.current.delete(id)
      clearTimeout(w.t)
      w.reject(new Error(reason))
    }
    transferBusyRef.current = false
    inboundReceiveBusyRef.current = false
    suppressAutoReconnectRef.current = true
    fullReset({ force: true })
    suppressAutoReconnectRef.current = false
    setTransportReady(false)
    setConnectionState('disconnected')
    setLinkPhase('idle')
    onTransferAbortRef.current?.(reason)
    onConnectionResetRef.current?.()
  }, [fullReset])

  useEffect(() => {
    abortActiveTransferRef.current = abortActiveTransfer
  }, [abortActiveTransfer])

  const scheduleTransferAbortOnPeerDisconnect = useCallback(() => {
    if (pcTransferAbortTimerRef.current != null) {
      clearTimeout(pcTransferAbortTimerRef.current)
    }
    pcTransferAbortTimerRef.current = window.setTimeout(() => {
      pcTransferAbortTimerRef.current = null
      if (!transferBusyRef.current && !inboundReceiveBusyRef.current) return
      abortActiveTransferRef.current?.('peer-disconnected')
    }, PEER_DISCONNECT_ABORT_MS)
  }, [])

  /**
   * シグナリングで disconnect を送り、P2P / WS を完全に捨てる。
   * ローカル側の ICE/PC 失敗時は即座に scheduleReconnect（古い PC を抱えたまま待たない）。
   */
  const handleSyncDisconnect = useCallback((fromRemote = false) => {
    const now = Date.now()
    if (now - lastSyncDisconnectRef.current < 400) return
    lastSyncDisconnectRef.current = now

    suppressAutoReconnectRef.current = true
    if (!fromRemote) {
      try {
        wsRef.current?.send(JSON.stringify({ type: 'disconnect' }))
      } catch (_) { /*  */ }
    }

    isConnectingRef.current = false
    fullReset({ force: true })

    suppressAutoReconnectRef.current = false

    if (fromRemote) {
      setConnectionState('disconnected')
      setLinkPhase('idle')
    } else if (targetRef.current && connectParamsRef.current) {
      setConnectionState('reconnecting')
      scheduleReconnectRef.current?.()
    }
  }, [fullReset])

  useEffect(() => {
    handleSyncDisconnectRef.current = handleSyncDisconnect
  }, [handleSyncDisconnect])

  // ──────────────────────────────────────────────
  // 再接続スケジューラ
  // ──────────────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (!connectParamsRef.current) return
    clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (!connectParamsRef.current || !targetRef.current) return
      if (transferBusyRef.current || inboundReceiveBusyRef.current) return
      if (channelRef.current?.readyState === 'open') return
      const rp = pcRef.current
      if (rp && rp.connectionState === 'connected') return
      if (reconnectCountRef.current >= MAX_RECONNECT) {
        setConnectionState('failed')
        const msg =
          '接続できませんでした。ネットワークやファイアウォールを確認し、しばらくしてから再試行してください。'
        setConnectionUserError(msg)
        logConnectionFailure('max reconnect', { room: connectParamsRef.current?.room })
        onFailedRef.current?.()
        return
      }
      reconnectCountRef.current += 1
      devLog(`[reconnect] ${reconnectCountRef.current}/${MAX_RECONNECT}`)
      clearRecoverTimer()
      isConnectingRef.current = false
      const { room, myId, targetId } = connectParamsRef.current
      // 待機中に残った WS/PC を捨ててから新セッションへ（connect 先頭でも fullReset するが冪等）
      fullReset({ force: true })
      connectRef.current?.(room, myId, targetId)
    }, RECONNECT_DEBOUNCE_MS)
  }, [fullReset])

  const planAutoReconnect = useCallback(
    (pc) => {
      if (!pc) return
      if (transferBusyRef.current || inboundReceiveBusyRef.current) return
      clearRecoverTimer()
      const epochWhenScheduled = signalingEpochRef.current
      recoverTimerRef.current = window.setTimeout(() => {
        recoverTimerRef.current = null
        if (signalingEpochRef.current !== epochWhenScheduled) return
        if (transferBusyRef.current || inboundReceiveBusyRef.current) return
        if (channelRef.current?.readyState === 'open') return

        // teardown 済みで pcRef が差し替わった: 古いタイマーが再接続を握りつぶしていたのを解消
        if (pcRef.current !== pc) {
          if (targetRef.current && connectParamsRef.current) {
            setConnectionState('reconnecting')
            scheduleReconnect()
          }
          return
        }

        const ice = pc.iceConnectionState
        const cs = pc.connectionState
        const p2pUp =
          cs === 'connected' && (ice === 'connected' || ice === 'completed')
        if (p2pUp) {
          refreshTransportRef.current?.()
          return
        }
        if (
          ice === 'checking' ||
          ice === 'new' ||
          cs === 'connecting' ||
          cs === 'new'
        ) {
          return
        }
        setConnectionState('reconnecting')
        scheduleReconnect()
      }, ICE_RECOVER_MS)
    },
    [scheduleReconnect]
  )

  scheduleReconnectRef.current = scheduleReconnect
  planAutoReconnectRef.current = planAutoReconnect

  // ──────────────────────────────────────────────
  // ICE 候補のフラッシュ
  // ──────────────────────────────────────────────
  const flushCandidates = useCallback(async (pc) => {
    if (pcRef.current !== pc) return
    const buf = pendingCandidates.current.splice(0)
    const withPayload = buf.filter((c) => c != null)
    const endMarks = buf.length - withPayload.length
    if (withPayload.length > 0) {
      await Promise.all(
        withPayload.map(async (c) => {
          if (pcRef.current !== pc) return
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c))
          } catch (e) {
            devWarn('[ICE flush err]', e)
          }
        })
      )
    }
    if (endMarks > 0 && pcRef.current === pc) {
      try {
        await pc.addIceCandidate(null)
      } catch (e) {
        devWarn('[ICE flush end]', e)
      }
    }
  }, [])

  // ──────────────────────────────────────────────
  // 接続開始
  // ──────────────────────────────────────────────
  const connect = useCallback((room, myId, targetId) => {
    if (isConnectingRef.current) {
      devWarn('[connect] skip: already connecting')
      return
    }
    if (
      pcRef.current &&
      pcRef.current.connectionState === 'connected' &&
      channelRef.current?.readyState === 'open'
    ) {
      devLog('[connect] skip: transport already ready')
      return
    }

    isConnectingRef.current = true
    try {
      fullReset({ force: true })
    } catch (e) {
      isConnectingRef.current = false
      throw e
    }

    const sessionEpoch = signalingEpochRef.current
    const linkT0 = typeof performance !== 'undefined' ? performance.now() : 0
    const linkStep = (label) => {
      if (!_dev) return
      const dt =
        typeof performance !== 'undefined' ? performance.now() - linkT0 : 0
      console.log(
        `[LynkOS/link #${sessionEpoch}] +${dt.toFixed(0)}ms`,
        label
      )
    }
    linkStep('connect: fullReset 済み')

    setConnectionState('connecting')
    setConnectionUserError(null)
    setLinkPhase('websocket')
    connectParamsRef.current  = { room, myId, targetId }
    pendingCandidates.current = []
    makingOfferRef.current    = false
    ignoreOfferRef.current    = false
    politeRef.current         = myId > targetId

    const wsUrl = `${WS_BASE}/ws/signal/${encodeURIComponent(room)}/`
    devLog(`[WS] 接続 → ${wsUrl}  polite=${politeRef.current}`)

    const runDelayedIceFlush = () => {
      window.setTimeout(() => {
        const live = pcRef.current
        if (signalingEpochRef.current !== sessionEpoch || !live) return
        void flushCandidates(live)
      }, POST_REMOTE_FLUSH_DELAY_MS)
    }

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    const beginPeerConnection = () => {
      if (webrtcNegotiationStartedRef.current) return
      if (signalingEpochRef.current !== sessionEpoch) return
      if (pcRef.current != null) {
        devWarn('[beginPeerConnection] skip: RTCPeerConnection already exists')
        return
      }
      webrtcNegotiationStartedRef.current = true
      linkStep('RTCPeerConnection 生成（シグナリング許可済み）')

      const pc = new RTCPeerConnection({
        iceServers:         getIceServers(),
        iceTransportPolicy: 'all',
        /** 0 だと offer/answer 確定前にホスト候補が SDP に載らず、trickle 競合で ICE が進まない端末がある */
        iceCandidatePoolSize: 10,
      })
      pcRef.current = pc

      let firstLocalIceSent = false
      const refreshTransport = () => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        const ch = channelRef.current
        if (!ch || ch.readyState !== 'open') {
          setTransportReady(false)
          return
        }
        if (ch.peerConnection != null && ch.peerConnection !== pc) {
          setTransportReady(false)
          return
        }
        const ice = pc.iceConnectionState
        const iceOk = ice === 'connected' || ice === 'completed'
        const pcs = pc.connectionState
        const pcOk = pcs === 'connected' || (pcs === 'connecting' && iceOk)
        const ok = iceOk && pcOk
        if (ok) {
          clearRecoverTimer()
          clearTimeout(connectWatchdogRef.current)
          connectWatchdogRef.current = null
          if (postSdpIceTimerRef.current != null) {
            clearTimeout(postSdpIceTimerRef.current)
            postSdpIceTimerRef.current = null
          }
          reconnectCountRef.current = 0
          setTransportReady(true)
          setConnectionState('connected')
          setLinkPhase('ready')
          linkStep('✓ 転送可能（ICE+PC+DataChannel 成立）')
        } else {
          setTransportReady(false)
        }
      }
      refreshTransportRef.current = refreshTransport

      const watchdogEpoch = sessionEpoch
      clearTimeout(connectWatchdogRef.current)
      connectWatchdogRef.current = setTimeout(() => {
        connectWatchdogRef.current = null
        if (signalingEpochRef.current !== watchdogEpoch) return
        const wpc = pcRef.current
        if (!wpc || wpc !== pc) return
        if (wpc.iceConnectionState !== 'failed' && wpc.connectionState !== 'failed') {
          return
        }
        if (transferBusyRef.current || inboundReceiveBusyRef.current) {
          abortActiveTransferRef.current?.('connect-watchdog')
          return
        }
        devWarn(`[LynkOS/ICE #${sessionEpoch}] watchdog: ICE/PC failed → 再接続`)
        clearRecoverTimer()
        setConnectionState('reconnecting')
        scheduleReconnect()
      }, CONNECT_WATCHDOG_MS)

      pc.oniceconnectionstatechange = () => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        const ice = pc.iceConnectionState
        logIceSnapshot(sessionEpoch, pc, `iceConnectionState → ${ice}`)
        if (ice === 'connected' || ice === 'completed') {
          clearRecoverTimer()
          if (channelRef.current?.readyState !== 'open') setLinkPhase('datachannel')
          refreshTransport()
        }
        if (ice === 'checking' || ice === 'disconnected') setLinkPhase('ice')
        if (ice === 'failed') {
          setTransportReady(false)
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            abortActiveTransferRef.current?.('ice-failed')
          } else {
            handleSyncDisconnectRef.current?.(false)
          }
        }
        if (ice === 'disconnected') {
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            scheduleTransferAbortOnPeerDisconnect()
          } else {
            refreshTransport()
          }
        }
      }
      pc.onicegatheringstatechange = () => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        logIceSnapshot(sessionEpoch, pc, `iceGatheringState → ${pc.iceGatheringState}`)
        if (pc.iceGatheringState === 'gathering') setLinkPhase('ice')
      }
      pc.onsignalingstatechange = () => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        const ss = pc.signalingState
        logIceSnapshot(sessionEpoch, pc, `signalingState → ${ss}`)
        if (ss === 'have-local-offer' || ss === 'have-remote-offer') setLinkPhase('sdp')

        if (ss === 'stable' && pc.localDescription && pc.remoteDescription) {
          setLinkPhase('ice')
          if (postSdpIceTimerRef.current != null) {
            clearTimeout(postSdpIceTimerRef.current)
          }
          const stallEpoch = sessionEpoch
          postSdpIceTimerRef.current = window.setTimeout(() => {
            postSdpIceTimerRef.current = null
            if (signalingEpochRef.current !== stallEpoch) return
            if (pcRef.current !== pc) return
            if (transferBusyRef.current || inboundReceiveBusyRef.current) return
            if (channelRef.current?.readyState === 'open') return
            const iceSt = pc.iceConnectionState
            if (iceSt === 'connected' || iceSt === 'completed') return
            devWarn(`[LynkOS/ICE #${sessionEpoch}] SDP 確定後も ICE/DC が進まない → 再接続`)
            /*
             * planAutoReconnect は ice=new / conn=new のとき早期 return し、
             * forever に再接続しない（ユーザー体感: 接続中のまま固まる）。
             */
            clearRecoverTimer()
            setConnectionState('reconnecting')
            scheduleReconnect()
          }, POST_SDP_ICE_STALL_MS)
        }
      }

      pc.onicecandidate = ({ candidate }) => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) return
        if (!firstLocalIceSent) {
          firstLocalIceSent = true
          linkStep('local ICE → シグナリングへ即送信（trickle）')
        }
        try {
          ws.send(JSON.stringify({
            type:       'ice-candidate',
            candidate:  candidate ? candidate.toJSON() : null,
          }))
        } catch (_) { /*  */ }
      }

      pc.onconnectionstatechange = () => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        const s = pc.connectionState
        logIceSnapshot(sessionEpoch, pc, `connectionState → ${s}`)
        if (s === 'connecting' && pc.signalingState === 'stable' && pc.remoteDescription) {
          setLinkPhase('ice')
        }
        if (s === 'connected') {
          clearRecoverTimer()
          clearTimeout(connectWatchdogRef.current)
          connectWatchdogRef.current = null
          if (pcDisconnectedTimerRef.current != null) {
            clearTimeout(pcDisconnectedTimerRef.current)
            pcDisconnectedTimerRef.current = null
          }
          if (pcTransferAbortTimerRef.current != null) {
            clearTimeout(pcTransferAbortTimerRef.current)
            pcTransferAbortTimerRef.current = null
          }
          refreshTransport()
        } else if (s === 'failed') {
          setTransportReady(false)
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            abortActiveTransferRef.current?.('pc-failed')
          } else {
            handleSyncDisconnectRef.current?.(false)
          }
        } else if (s === 'closed') {
          setTransportReady(false)
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            abortActiveTransferRef.current?.('pc-closed')
          } else {
            handleSyncDisconnectRef.current?.(false)
          }
        } else if (s === 'disconnected') {
          setTransportReady(false)
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            scheduleTransferAbortOnPeerDisconnect()
          } else if (pcDisconnectedTimerRef.current != null) {
            clearTimeout(pcDisconnectedTimerRef.current)
          } else {
            const discEpoch = sessionEpoch
            pcDisconnectedTimerRef.current = window.setTimeout(() => {
              pcDisconnectedTimerRef.current = null
              if (signalingEpochRef.current !== discEpoch) return
              if (pcRef.current !== pc) return
              if (pc.connectionState === 'connected') return
              handleSyncDisconnectRef.current?.(false)
            }, PEER_DISCONNECT_ABORT_MS)
          }
        }
      }

      if (!politeRef.current) {
        const ch = pc.createDataChannel('file-transfer', { ordered: true })
        setupChannel(ch)
      }
      pc.ondatachannel = ({ channel }) => setupChannel(channel)

      const sendOffer = async () => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc || wsRef.current !== ws) return
        if (pc.signalingState !== 'stable' || makingOfferRef.current) return
        if (ws.readyState !== WebSocket.OPEN) {
          devWarn('[offer] WebSocket が未オープン')
          return
        }
        try {
          makingOfferRef.current = true
          linkStep('createOffer 開始')
          const offer = await pc.createOffer(OFFER_OPTIONS)
          if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
          await pc.setLocalDescription(offer)
          if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
          linkStep('setLocalDescription(offer) 完了 → offer 送信')
          setLinkPhase('sdp')
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }))
          }
        } catch (e) {
          if (signalingEpochRef.current !== sessionEpoch) return
          logError('offer error', e)
          planAutoReconnect(pc)
        } finally {
          makingOfferRef.current = false
        }
      }

      const applyRemoteOffer = async (offerMsg) => {
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        const collision = makingOfferRef.current || pc.signalingState !== 'stable'
        ignoreOfferRef.current = !politeRef.current && collision
        if (ignoreOfferRef.current) return

        linkStep('remote offer 受信 → setRemoteDescription')
        await pc.setRemoteDescription(new RTCSessionDescription(offerMsg.sdp))
        if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws || pcRef.current !== pc) return
        setLinkPhase('sdp')
        linkStep('先行 ICE バッファ flush（並列）')
        await flushCandidates(pc)
        runDelayedIceFlush()
        if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws || pcRef.current !== pc) return
        linkStep('createAnswer')
        const answer = await pc.createAnswer()
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
        await pc.setLocalDescription(answer)
        if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
        linkStep('answer 送信')
        setLinkPhase('sdp')
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }))
        }
        reconnectCountRef.current = 0
        runDelayedIceFlush()
      }

      if (pendingOfferRef.current) {
        const po = pendingOfferRef.current
        pendingOfferRef.current = null
        void applyRemoteOffer(po).catch((e) => {
          if (signalingEpochRef.current !== sessionEpoch) return
          logError('pending offer 処理', e)
          planAutoReconnect(pc)
        })
      } else if (!politeRef.current) {
        queueMicrotask(() => {
          if (signalingEpochRef.current !== sessionEpoch) return
          void sendOffer()
        })
      }
    }

    ws.onopen = () => {
      if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
      linkStep('WebSocket open（シグナリング）')
      devLog(`[LynkOS/ICE #${sessionEpoch}] [WS] open`)
      setLinkPhase('signaling')
      if (wsPingTimerRef.current != null) clearInterval(wsPingTimerRef.current)
      wsPingTimerRef.current = window.setInterval(() => {
        if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }))
          } catch (_) { /*  */ }
        }
      }, 20000)
      beginPeerConnection()
      isConnectingRef.current = false
    }
    ws.onerror = () => {
      if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
      isConnectingRef.current = false
      logConnectionFailure('WebSocket signaling', wsUrl)
      setConnectionUserError((prev) =>
        prev ||
        '接続できませんでした。サーバーに届かない可能性があります（URL・HTTPS・ネットワークを確認してください）。'
      )
    }
    ws.onclose = (e) => {
      if (signalingEpochRef.current !== sessionEpoch) return
      isConnectingRef.current = false
      devLog(`[LynkOS/ICE #${sessionEpoch}] [WS] close code=`, e.code)
      if (wsPingTimerRef.current != null) {
        clearInterval(wsPingTimerRef.current)
        wsPingTimerRef.current = null
      }
      if (transferBusyRef.current || inboundReceiveBusyRef.current) {
        abortActiveTransferRef.current?.('signaling-closed')
        return
      }
      if (e.code !== 1000 && targetRef.current &&
          channelRef.current?.readyState !== 'open') {
        const pcLive = pcRef.current
        if (pcLive?.connectionState === 'connected') return
        const iceWc = pcLive?.iceConnectionState
        if (pcLive && (iceWc === 'connected' || iceWc === 'completed')) return
        if (pcLive) {
          planAutoReconnect(pcLive)
        } else if (!webrtcNegotiationStartedRef.current && connectParamsRef.current) {
          scheduleReconnect()
        }
      }
    }

    ws.onmessage = async (ev) => {
      if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
      let raw = ev.data
      if (typeof raw !== 'string') {
        try {
          if (raw instanceof Blob) raw = await raw.text()
          else if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw)
          else return
        } catch {
          return
        }
        if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
      }
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
      devLog(`[LynkOS/ICE #${sessionEpoch}] [SIG ←]`, msg.type)

      try {
        if (msg.type === 'pong') return

        if (msg.type === 'peer-joined') {
          const pcNow = pcRef.current
          const w = wsRef.current
          if (
            !politeRef.current &&
            pcNow &&
            w &&
            w.readyState === WebSocket.OPEN &&
            pcNow.signalingState === 'have-local-offer' &&
            pcNow.localDescription?.type === 'offer'
          ) {
            devLog(
              `[LynkOS/ICE #${sessionEpoch}] peer-joined → offer 再送（相手が入室）`
            )
            try {
              w.send(JSON.stringify({ type: 'offer', sdp: pcNow.localDescription }))
            } catch (_) {
              /*  */
            }
          }
          return
        }

        const pc = pcRef.current
        if (!pc) {
          if (msg.type === 'offer') {
            pendingOfferRef.current = msg
          }
          return
        }
        if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return

        if (msg.type === 'offer') {
          const collision = makingOfferRef.current || pc.signalingState !== 'stable'
          ignoreOfferRef.current = !politeRef.current && collision
          if (ignoreOfferRef.current) return

          linkStep('remote offer 受信 → setRemoteDescription')
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws || pcRef.current !== pc) return
          setLinkPhase('sdp')
          linkStep('先行 ICE バッファ flush（並列）')
          await flushCandidates(pc)
          runDelayedIceFlush()
          if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws || pcRef.current !== pc) return
          linkStep('createAnswer')
          const answer = await pc.createAnswer()
          if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
          await pc.setLocalDescription(answer)
          if (signalingEpochRef.current !== sessionEpoch || wsRef.current !== ws) return
          linkStep('answer 送信')
          setLinkPhase('sdp')
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }))
          }
          reconnectCountRef.current = 0
          runDelayedIceFlush()

        } else if (msg.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            linkStep('remote answer 受信 → setRemoteDescription')
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
            setLinkPhase('sdp')
            linkStep('先行 ICE flush（answer 後）')
            await flushCandidates(pc)
            runDelayedIceFlush()
            if (signalingEpochRef.current !== sessionEpoch) return
            reconnectCountRef.current = 0
          }

        } else if (msg.type === 'ice-candidate') {
          if (!Object.prototype.hasOwnProperty.call(msg, 'candidate')) return
          if (signalingEpochRef.current !== sessionEpoch || pcRef.current !== pc) return
          setLinkPhase('ice')
          const endOfCandidates = msg.candidate === null
          if (!pc.remoteDescription) {
            if (endOfCandidates) pendingCandidates.current.push(null)
            else if (msg.candidate) pendingCandidates.current.push(msg.candidate)
            return
          }
          try {
            const cand = endOfCandidates
              ? null
              : new RTCIceCandidate(msg.candidate)
            void pc.addIceCandidate(cand).catch((e) => {
              if (signalingEpochRef.current !== sessionEpoch) return
              if (!ignoreOfferRef.current) devWarn('[ICE add]', e)
            })
          } catch (e) {
            if (signalingEpochRef.current !== sessionEpoch) return
            if (!ignoreOfferRef.current) devWarn('[ICE add sync]', e)
          }

        } else if (msg.type === 'disconnect') {
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            abortActiveTransferRef.current?.('peer-disconnect')
          } else {
            handleSyncDisconnectRef.current?.(true)
          }
        } else if (msg.type === 'peer-left') {
          if (transferBusyRef.current || inboundReceiveBusyRef.current) {
            abortActiveTransferRef.current?.('peer-left')
            return
          }
          const ch = channelRef.current
          if (ch?.readyState === 'open' || ch?.readyState === 'connecting') return
          const pcLive = pcRef.current
          if (pcLive?.connectionState === 'connected') return
          const icePl = pcLive?.iceConnectionState
          if (pcLive && (icePl === 'connected' || icePl === 'completed')) return
          if (pcLive) {
            planAutoReconnect(pcLive)
          } else if (!webrtcNegotiationStartedRef.current) {
            scheduleReconnect()
          }
        }
      } catch (e) {
        if (signalingEpochRef.current !== sessionEpoch) return
        logError(`SIG メッセージ処理 (${msg?.type})`, e)
        const pcLive = pcRef.current
        if (pcLive) planAutoReconnect(pcLive)
        else if (connectParamsRef.current) scheduleReconnect()
      }
    }
  }, [fullReset, setupChannel, scheduleReconnect, flushCandidates, planAutoReconnect])

  useEffect(() => { connectRef.current = connect }, [connect])

  // targetDevice が変わったら接続（useLayoutEffect で accept 送信より先に WebRTC 開始できるよう同期）
  useLayoutEffect(() => {
    if (!targetDevice) {
      linkSessionGenerationRef.current += 1
      setConnectionUserError(null)
      cleanup()
      return undefined
    }
    const generation = ++linkSessionGenerationRef.current
    reconnectCountRef.current = 0
    const myId = localStorage.getItem('lynkos-device-id') ?? 'unknown'
    const room = [myId, targetDevice.deviceId].sort().join('_')
    connect(room, myId, targetDevice.deviceId)
    return () => {
      const g = generation
      queueMicrotask(() => {
        if (linkSessionGenerationRef.current !== g) return
        cleanup()
      })
    }
  }, [targetDevice]) // eslint-disable-line react-hooks/exhaustive-deps

  // ページがフォアグラウンドに戻ったとき（iOS Safariのバックグラウンド復帰など）に再接続
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!connectParamsRef.current || !targetRef.current) return
      if (isConnectingRef.current) return
      if (transferBusyRef.current || inboundReceiveBusyRef.current) return
      const rs = channelRef.current?.readyState
      if (rs === 'open' || rs === 'connecting') return
      const pcv = pcRef.current
      if (pcv?.connectionState === 'connected') return
      const icev = pcv?.iceConnectionState
      if (pcv && (icev === 'connected' || icev === 'completed')) return
      devLog('[visibility] フォアグラウンド復帰 → 再接続')
      reconnectCountRef.current = 0
      const { room, myId, targetId } = connectParamsRef.current
      connectRef.current?.(room, myId, targetId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // ──────────────────────────────────────────────
  // 手動再接続
  // ──────────────────────────────────────────────
  const reconnect = useCallback(() => {
    if (!connectParamsRef.current) return
    if (isConnectingRef.current) return
    const p = pcRef.current
    if (p && p.connectionState === 'connected') return
    reconnectCountRef.current = 0
    setConnectionUserError(null)
    const { room, myId, targetId } = connectParamsRef.current
    connect(room, myId, targetId)
  }, [connect])

  // ──────────────────────────────────────────────
  // ファイル送信（キューで直列化 — 受信側が忙しくても次の送信は待機し、reject しない）
  // ──────────────────────────────────────────────
  const sendFiles = useCallback((files, ids) => {
    const fileArr = Array.from(files)
    const idList = [...ids]
    sendChainRef.current = sendChainRef.current.catch(() => {}).then(async () => {
      const channel = channelRef.current
      const pcLive = pcRef.current
      if (!channel || channel.readyState !== 'open' || !pcLive) {
        idList.forEach((id) => onProgress?.({ id, progress: 0, status: 'error' }))
        return
      }
      const ice = pcLive.iceConnectionState
      const iceOk = ice === 'connected' || ice === 'completed'
      const pcs = pcLive.connectionState
      const pcOk = pcs === 'connected' || (pcs === 'connecting' && iceOk)
      if (!iceOk || !pcOk) {
        idList.forEach((id) => onProgress?.({ id, progress: 0, status: 'error' }))
        return
      }
      transferBusyRef.current = true
      const myName  = localStorage.getItem('lynkos-device-name') ?? 'このデバイス'
      const myType  = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      let rawIcon = ''
      try {
        rawIcon = localStorage.getItem('lynkos-device-icon') ?? ''
      } catch {
        rawIcon = ''
      }
      const senderIcon = iconForNetworkPayload(rawIcon)

      channel.send(JSON.stringify({
        type:                  'file-request',
        signalingPreApproved: true,
        senderName:            myName,
        senderType:            myType,
        ...(senderIcon
          ? { senderIcon, device: { name: myName, icon: senderIcon } }
          : { device: { name: myName } }),
        files:                 fileArr.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream',
        })),
      }))

      const accepted = await new Promise((resolve) => {
        const orig  = channel.onmessage
        const timer = setTimeout(() => { channel.onmessage = orig; resolve(false) }, 300_000)
        channel.onmessage = (e) => {
          if (typeof e.data === 'string') {
            let msg
            try { msg = JSON.parse(e.data) } catch { orig?.(e); return }
            if (msg.type === 'file-request-response') {
              clearTimeout(timer); channel.onmessage = orig; resolve(msg.accepted); return
            }
          }
          orig?.(e)
        }
      })

      if (!accepted) {
        transferBusyRef.current = false
        idList.forEach((id) => onProgress?.({ id, progress: 0, status: 'rejected' }))
        return
      }

      idList.forEach((id, idx) => {
        if (idx > 0) onProgress?.({ id, status: 'queued', progress: 0 })
      })

      try {
        for (let i = 0; i < fileArr.length; i++) {
          const file = fileArr[i]
          const id   = idList[i]
          const size = file.size

          try {
            onProgress?.({ id, status: 'sending', progress: 0 })
            channel.send(JSON.stringify({
            type: 'file-meta', id, name: file.name, size,
            mime: file.type || 'application/octet-stream',
          }))

            let offset = 0
            while (offset < size) {
              await waitChannelDrain(channel)
              if (channel.readyState !== 'open') {
                throw new Error('dc-closed')
              }
              const pcNow = pcRef.current
              if (!pcNow || pcNow.connectionState === 'failed' || pcNow.connectionState === 'closed') {
                throw new Error('pc-closed')
              }
              const end = Math.min(offset + CHUNK_SIZE, size)
              const buf = await file.slice(offset, end).arrayBuffer()
              channel.send(buf)
              offset = end
              onProgress?.({
                id,
                status:   'sending',
                progress: Math.min(99, Math.round((offset / size) * 100)),
              })
            }
            channel.send(JSON.stringify({ type: 'file-end', id }))
            await new Promise((resolve, reject) => {
              const t = setTimeout(() => {
                fileAckWaitersRef.current.delete(id)
                reject(new Error('file-received-ack timeout'))
              }, FILE_RECV_ACK_TIMEOUT_MS)
              fileAckWaitersRef.current.set(id, { resolve, reject, t })
            })
            onComplete?.(id)
          } catch (err) {
            logError('sendFiles', err)
            onProgress?.({ id, progress: 0, status: 'error' })
            for (let j = i + 1; j < fileArr.length; j++) {
              onProgress?.({ id: idList[j], progress: 0, status: 'error' })
            }
            break
          }
        }
      } finally {
        transferBusyRef.current = false
      }
    })
  }, [onProgress, onComplete])

  return {
    sendFiles,
    connectionState,
    reconnect,
    linkPhase,
    transportReady,
    connectionUserError,
  }
}
