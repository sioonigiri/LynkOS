import { useState, useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import DeviceList from './components/DeviceList'
import SendPanel from './components/SendPanel'
import TransferStatus from './components/TransferStatus'
import DownloadConfirmDialog from './components/DownloadConfirmDialog'
import ReceiveDialog from './components/ReceiveDialog'
import SettingsPanel from './components/SettingsPanel'
import useDeviceDiscovery from './hooks/useDeviceDiscovery'
import useWebRTC from './hooks/useWebRTC'
import useInbox from './hooks/useInbox'
import {
  getDeviceIconVisual,
  iconForNetworkPayload,
  isLikelyImageFileName,
  suggestedMimeFromFileName,
} from './lib/deviceDisplay'
import {
  loadTransferLog,
  saveTransferLog,
  pruneExpired,
} from './lib/transferLog'
import {
  rxReadChunk,
  rxStreamToWritable,
  rxAssembleBlob,
  rxDeleteTransfer,
  rxDeleteExpiredInDb,
} from './lib/receiveStorage'
import { ensureIosWebRtcIceUnlocked } from './lib/iosIceUnlock'
import {
  isAppleTouchDevice,
  iosSaveBlockedShort,
  iosSaveFailureMessage,
  IOS_IMAGE_SAVE_TOAST,
} from './lib/iosFileSizePolicy'
import { isInFlightTransfer, isCompletedTransfer } from './lib/transferPhases'
import { logError } from './lib/logger'
import styles from './App.module.css'

/** 受信保存: 画像は iOS で共有シート（写真へ保存しやすい）を優先 */
function isIncomingImageForShare(t, name) {
  const m = String(t?.mimeType || '').trim()
  if (m.startsWith('image/')) return true
  if (isLikelyImageFileName(name)) return true
  return false
}

const CONN_BADGE = {
  connected:    { label: '接続',    cls: styles.connected    },
  connecting:   { label: '接続中',  cls: styles.connecting   },
  reconnecting: { label: '再接続', cls: styles.reconnecting },
  disconnected: { label: '未接続',  cls: styles.disconnected },
  failed:       { label: '失敗',    cls: styles.failed       },
}

/** @typedef {'idle'|'waiting_response'|'connecting'|'transferring'} SendFlowPhase */

export default function App() {
  /** @type {[SendFlowPhase, function]} */
  const [sendPhase, setSendPhase] = useState('idle')
  const [pickedFile, setPickedFile] = useState(null)
  /** WebRTC 接続先（transfer 許可後のみ） */
  const [webrtcPeer, setWebrtcPeer] = useState(null)
  const [transfers, setTransfers] = useState(() => loadTransferLog())
  const [receiveRequest, setReceiveRequest] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [myDeviceName, setMyDeviceName] = useState(null)
  /** 設定でアイコン変更時に presence 登録を更新 */
  const [deviceProfileRev, setDeviceProfileRev] = useState(0)
  const [downloadTarget, setDownloadTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const [flashDeviceId, setFlashDeviceId] = useState(null)
  const [inboundReceiveState, setInboundReceiveState] = useState({
    queuedRequests: 0,
    phase:          'idle',
  })
  /** 受信 transfer_request の待ちキュー */
  const [incomingTransfers, setIncomingTransfers] = useState([])

  const pendingRequestIdRef = useRef(null)
  const pendingPeerRef = useRef(null)
  const pendingPeerIdRef = useRef(null)
  const autoSendStartedRef = useRef(false)
  const activeBatchIdsRef = useRef(null)
  const incomingQueueRef = useRef([])

  const transfersRef = useRef(transfers)
  transfersRef.current = transfers

  const { devices, myDevice, fetchError } = useDeviceDiscovery(myDeviceName, deviceProfileRev)

  useEffect(() => {
    if (!toast) return undefined
    const tid = window.setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(tid)
  }, [toast])

  useEffect(() => {
    incomingQueueRef.current = incomingTransfers
  }, [incomingTransfers])

  /** 送信対象として保持している UI 状態をクリア（成功時は必ずここを通す）。 */
  const clearOutboundSelection = useCallback(() => {
    setPickedFile(null)
    autoSendStartedRef.current = false
    activeBatchIdsRef.current = null
  }, [])

  /** 送信成功後: 選択状態と接続フローをまとめてリセット。 */
  const finishOutboundSendSuccess = useCallback(() => {
    pendingRequestIdRef.current = null
    pendingPeerRef.current = null
    pendingPeerIdRef.current = null
    clearOutboundSelection()
    setWebrtcPeer(null)
    setSendPhase('idle')
  }, [clearOutboundSelection])

  const resetOutboundFlow = useCallback(() => {
    pendingRequestIdRef.current = null
    pendingPeerRef.current = null
    pendingPeerIdRef.current = null
    clearOutboundSelection()
    setWebrtcPeer(null)
    setSendPhase('idle')
  }, [clearOutboundSelection])

  const { sendInbox } = useInbox(myDevice?.deviceId ?? '', {
    onTransferRequest: (msg) => {
      if (!msg?.from || !msg?.requestId) return
      setIncomingTransfers((q) => [...q, msg])
    },
    onTransferAccept: (msg) => {
      if (pendingRequestIdRef.current == null) return
      if (msg.requestId !== pendingRequestIdRef.current) return
      const target = pendingPeerRef.current
      const peer =
        target && target.deviceId === msg.from
          ? target
          : {
              deviceId: msg.from,
              name:     msg.senderName || '相手',
              type:     msg.senderType === 'mobile' ? 'mobile' : 'desktop',
              platform: '',
              ...(msg.senderIcon || msg.device?.icon
                ? { icon: msg.senderIcon || msg.device?.icon }
                : {}),
            }
      pendingPeerRef.current = null
      pendingPeerIdRef.current = null
      flushSync(() => {
        setWebrtcPeer(peer)
        setSendPhase('connecting')
      })
    },
    onTransferReject: (msg) => {
      if (pendingRequestIdRef.current == null) return
      if (msg.requestId !== pendingRequestIdRef.current) return
      setToast('拒否')
      resetOutboundFlow()
    },
    onTransferCancel: (msg) => {
      if (!msg?.from) return
      setIncomingTransfers((q) => {
        const rid = msg.requestId
        if (rid != null && String(rid) !== '') {
          return q.filter((x) => x.requestId !== rid)
        }
        return q.filter((x) => x.from !== msg.from)
      })
    },
  })

  const cancelWaiting = useCallback(() => {
    const toId = pendingPeerIdRef.current
    const rid = pendingRequestIdRef.current
    if (myDevice?.deviceId && toId) {
      const payload = {
        type: 'transfer_cancel',
        from: myDevice.deviceId,
        to:   toId,
      }
      if (rid) payload.requestId = rid
      sendInbox(payload)
    }
    pendingRequestIdRef.current = null
    pendingPeerRef.current = null
    pendingPeerIdRef.current = null
    setSendPhase('idle')
  }, [myDevice, sendInbox])

  useEffect(() => {
    setInboundReceiveState({ queuedRequests: 0, phase: 'idle' })
  }, [webrtcPeer?.deviceId])

  const handleInboundQueueChange = useCallback((s) => {
    setInboundReceiveState(s)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      const cur = transfersRef.current
      saveTransferLog(cur)
      const activeIds = new Set(
        cur.flatMap((x) => {
          if (x.storageKey) return [x.storageKey]
          if (x.status === 'receiving' && x.direction === 'in') return [x.id]
          return []
        })
      )
      rxDeleteExpiredInDb([...activeIds]).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [transfers])

  useEffect(() => {
    const flush = () => saveTransferLog(transfersRef.current)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTransfers((prev) => pruneExpired(prev))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    document.title = 'LynkOS'
  }, [])

  const handleReceiveRequest = useCallback((req) => {
    setReceiveRequest(req)
  }, [])

  const handleAccept = () => { receiveRequest?.resolve(true); setReceiveRequest(null) }
  const handleReject = () => { receiveRequest?.resolve(false); setReceiveRequest(null) }

  const handleProgress = useCallback((update) => {
    setTransfers((prev) => {
      const exists = prev.some((t) => t.id === update.id)
      if (!exists && update.direction === 'receiving') {
        const now = Date.now()
        return [...prev, {
          id:        update.id,
          name:      update.name  ?? '受信中...',
          size:      update.size  ?? 0,
          progress:  update.progress ?? 0,
          status:    'receiving',
          direction: 'in',
          updatedAt: now,
        }]
      }
      return prev.map((t) =>
        t.id === update.id ? { ...t, ...update, updatedAt: Date.now() } : t
      )
    })
  }, [])

  const handleComplete = useCallback((id) => {
    const now = Date.now()
    const batchIds = activeBatchIdsRef.current
    if (batchIds?.includes(id)) {
      clearOutboundSelection()
    }
    setTransfers((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, progress: 100, status: 'done', updatedAt: now } : t
      )
      queueMicrotask(() => saveTransferLog(next))
      return next
    })
  }, [clearOutboundSelection])

  const handleReceive = useCallback(
    ({ id, name, size, directSaved, storageKey, chunkCount, mimeType }) => {
      const now = Date.now()
      setTransfers((prev) => {
        const exists = prev.some((t) => t.id === id)
        const patch = directSaved
          ? {
              progress:   100,
              status:     'received_saved',
              direction:  'in',
              updatedAt:  now,
              directSaved: true,
            }
          : {
              progress:   100,
              status:     'received_ready',
              direction:  'in',
              updatedAt:  now,
              storageKey,
              chunkCount,
              ...(mimeType ? { mimeType } : {}),
            }
        const next = exists
          ? prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
          : [...prev, { id, name, size, ...patch }]
        queueMicrotask(() => saveTransferLog(next))
        return next
      })
    },
    []
  )

  const runDownload = useCallback(async (t) => {
    if (!t || t.directSaved) return
    const { storageKey, name, size } = t
    const chunkCount = Number(t.chunkCount)
    if (storageKey == null || !Number.isFinite(chunkCount) || chunkCount < 1) return

    const INLINE_DL_MAX = 48 * 1024 * 1024
    const MEMORY_ASSEMBLY_MAX = 200 * 1024 * 1024
    const sz = Number(size) || 0
    const isAppleTouch = isAppleTouchDevice()

    /** 確認ダイアログ後は即保存（Downloads 等）。`download` 属性付き a.click を基本にする。 */
    const triggerAnchorDownload = (blobUrl, fileName) => {
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
      }, 2500)
    }

    /**
     * iOS Safari: blob + a.download は OS の「ダウンロードしますか？」が出やすい。
     * 共有シート（ファイル保存・写真に保存）を先に試す。
     * ※非 HTTPS では canShare が false になりやすく、この場合はフォールバックのみ。
     */
    const tryIosShareThenAnchor = async (blob, fileName) => {
      const mime =
        String(t.mimeType || '').trim() ||
        blob.type ||
        suggestedMimeFromFileName(fileName) ||
        'application/octet-stream'
      const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime })
      const file = new File([typedBlob], fileName, { type: mime })
      const payload = { files: [file], title: fileName }
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share(payload)
          return true
        } catch (e) {
          if (e?.name === 'AbortError') return false
          /* NotAllowedError 等（非 HTTPS など）→ フォールバック */
        }
      }
      const url = URL.createObjectURL(typedBlob)
      triggerAnchorDownload(url, fileName)
      return true
    }

    try {
      if (chunkCount === 1 && sz < INLINE_DL_MAX) {
        const buf = await rxReadChunk(storageKey, 0)
        if (!buf) return
        const mime =
          String(t.mimeType || '').trim() || 'application/octet-stream'
        const blob = new Blob([buf], { type: mime })
        if (isAppleTouch) {
          const cont = await tryIosShareThenAnchor(blob, name)
          if (!cont) return
        } else {
          const url = URL.createObjectURL(blob)
          triggerAnchorDownload(url, name)
        }
      } else if (sz <= MEMORY_ASSEMBLY_MAX) {
        const blob = await rxAssembleBlob(storageKey, chunkCount)
        const mime =
          String(t.mimeType || '').trim() ||
          blob.type ||
          'application/octet-stream'
        const typedBlob =
          blob.type === mime ? blob : new Blob([blob], { type: mime })
        if (isAppleTouch) {
          const cont = await tryIosShareThenAnchor(typedBlob, name)
          if (!cont) return
        } else {
          const url = URL.createObjectURL(typedBlob)
          triggerAnchorDownload(url, name)
        }
      } else if (typeof window.showSaveFilePicker === 'function') {
        let handle
        try {
          handle = await window.showSaveFilePicker({ suggestedName: name })
        } catch (e) {
          if (e?.name === 'AbortError') return
          logError('保存先の選択に失敗', e)
          window.alert(iosSaveFailureMessage())
          return
        }
        const writable = await handle.createWritable()
        try {
          await rxStreamToWritable(storageKey, chunkCount, writable)
        } catch (e) {
          try {
            await writable.abort()
          } catch (_) { /*  */ }
          throw e
        }
      } else {
        window.alert(iosSaveBlockedShort())
        return
      }

      await rxDeleteTransfer(storageKey)
      const now = Date.now()
      if (isAppleTouchDevice() && isIncomingImageForShare(t, name)) {
        setToast(IOS_IMAGE_SAVE_TOAST)
      }
      setTransfers((prev) => {
        const next = prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                status:     'received_saved',
                updatedAt:  now,
                storageKey: undefined,
                chunkCount: undefined,
              }
            : x
        )
        queueMicrotask(() => saveTransferLog(next))
        return next
      })
    } catch (err) {
      logError('ダウンロード失敗', err)
      window.alert(iosSaveFailureMessage())
    }
  }, [])

  const handleFailed = useCallback(() => {
    setToast('接続できませんでした')
    resetOutboundFlow()
  }, [resetOutboundFlow])

  const handleTransferAbort = useCallback(() => {
    const ids = activeBatchIdsRef.current
    if (ids?.length) {
      setTransfers((prev) =>
        prev.map((t) =>
          ids.includes(t.id) ? { ...t, status: 'error', progress: 0, updatedAt: Date.now() } : t
        )
      )
    }
    setToast('相手が切断しました')
    resetOutboundFlow()
  }, [resetOutboundFlow])

  useEffect(() => {
    if (sendPhase !== 'waiting_response') return undefined
    const tid = window.setTimeout(() => {
      setToast('相手からの応答がありませんでした')
      cancelWaiting()
    }, 90_000)
    return () => clearTimeout(tid)
  }, [sendPhase, cancelWaiting])

  const {
    sendFiles,
    connectionState,
    reconnect,
    transportReady,
    connectionUserError,
  } = useWebRTC({
    targetDevice:         webrtcPeer,
    onConnectionReset:     () => {
      setWebrtcPeer(null)
      setSendPhase((p) => {
        if (p === 'transferring' || p === 'connecting') {
          autoSendStartedRef.current = false
          activeBatchIdsRef.current = null
          return 'idle'
        }
        return p
      })
    },
    onProgress:           handleProgress,
    onComplete:           handleComplete,
    onReceiveRequest:     handleReceiveRequest,
    onInboundQueueChange: handleInboundQueueChange,
    onReceive:            handleReceive,
    onFailed:             handleFailed,
    onTransferAbort:      handleTransferAbort,
  })

  useEffect(() => {
    if (!transportReady) setReceiveRequest(null)
  }, [transportReady])

  useEffect(() => {
    if (sendPhase !== 'connecting') return undefined
    const tid = window.setTimeout(() => {
      if (!transportReady) {
        setToast('接続できませんでした')
        resetOutboundFlow()
      }
    }, 120_000)
    return () => clearTimeout(tid)
  }, [sendPhase, transportReady, resetOutboundFlow])

  /** 受信側はファイル選択がないため、P2P 確立後に接続 UI を外す */
  useEffect(() => {
    if (sendPhase !== 'connecting' || !transportReady) return
    if (pickedFile) return
    setSendPhase('idle')
  }, [sendPhase, transportReady, pickedFile])

  useEffect(() => {
    if (sendPhase !== 'connecting' || !transportReady || !pickedFile) return
    if (autoSendStartedRef.current) return
    autoSendStartedRef.current = true
    const now = Date.now()
    const base = now
    const fileArr = [pickedFile]
    const newTransfers = fileArr.map((file, idx) => ({
      id:        `${base}-${idx}-${file.name}`,
      name:      file.name,
      size:      file.size,
      progress:  0,
      status:    idx === 0 ? 'sending' : 'queued',
      direction: 'out',
      updatedAt: now,
    }))
    activeBatchIdsRef.current = newTransfers.map((t) => t.id)
    setTransfers((prev) => [...prev, ...newTransfers])
    sendFiles(fileArr, newTransfers.map((t) => t.id))
    setSendPhase('transferring')
  }, [sendPhase, transportReady, pickedFile, sendFiles])

  useEffect(() => {
    const ids = activeBatchIdsRef.current
    if (!ids?.length || sendPhase !== 'transferring') return
    const terminal = ['done', 'error', 'rejected']
    const allDone = ids.every((id) => {
      const t = transfers.find((x) => x.id === id)
      return t && terminal.includes(t.status)
    })
    if (allDone) {
      finishOutboundSendSuccess()
    }
  }, [transfers, sendPhase, finishOutboundSendSuccess])

  const displayDevice = myDevice
    ? { ...myDevice, name: myDeviceName ?? myDevice.name }
    : null

  const handleFileChosen = (file) => {
    setPickedFile(file)
  }

  const clearPickedFile = () => {
    if (sendPhase !== 'idle') return
    clearOutboundSelection()
  }

  const sendTransferRequestToDevice = async (sendTarget) => {
    if (!pickedFile || !myDevice) return
    await ensureIosWebRtcIceUnlocked()
    const requestId = `tr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    pendingRequestIdRef.current = requestId
    pendingPeerRef.current = sendTarget
    pendingPeerIdRef.current = sendTarget.deviceId
    const myName = myDeviceName ?? myDevice.name
    const myType = myDevice.type === 'mobile' || /mobile/i.test(myDevice.type) ? 'mobile' : 'desktop'
    let storedIcon = ''
    try {
      storedIcon = localStorage.getItem('lynkos-device-icon') ?? ''
    } catch {
      storedIcon = ''
    }
    const senderIcon = iconForNetworkPayload(storedIcon)
    const fileMeta = [
      {
        name: pickedFile.name,
        size: pickedFile.size,
        type: pickedFile.type || 'application/octet-stream',
      },
    ]
    const first = pickedFile
    const ok = sendInbox({
      type:         'transfer_request',
      requestId,
      from:         myDevice.deviceId,
      to:           sendTarget.deviceId,
      senderName:   myName,
      senderType:   myType,
      ...(senderIcon ? { senderIcon, device: { name: myName, icon: senderIcon } } : { device: { name: myName } }),
      files:        fileMeta,
      file:         first
        ? {
            name: first.name,
            size: first.size,
            type: first.type || 'application/octet-stream',
          }
        : undefined,
    })
    if (!ok) {
      setToast('失敗')
      pendingRequestIdRef.current = null
      pendingPeerRef.current = null
      pendingPeerIdRef.current = null
      return
    }
    setSendPhase('waiting_response')
  }

  const handleDeviceTap = async (device) => {
    if (
      sendPhase === 'waiting_response' ||
      sendPhase === 'connecting' ||
      sendPhase === 'transferring'
    ) {
      return
    }
    if (typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(12)
      } catch (_) { /*  */ }
    }
    setFlashDeviceId(device.deviceId)
    window.setTimeout(() => setFlashDeviceId(null), 240)
    if (!pickedFile) {
      return
    }
    await sendTransferRequestToDevice(device)
  }

  const handleInboxAccept = () => {
    const head = incomingQueueRef.current[0]
    if (!head || !myDevice) return
    void ensureIosWebRtcIceUnlocked()
    flushSync(() => {
      setWebrtcPeer({
        deviceId: head.from,
        name:     head.senderName || '送信元',
        type:     head.senderType === 'mobile' ? 'mobile' : 'desktop',
        platform: '',
        ...(head.senderIcon || head.device?.icon
          ? { icon: head.senderIcon || head.device?.icon }
          : {}),
      })
      setSendPhase('connecting')
      setIncomingTransfers((q) => q.slice(1))
    })
    let acceptIcon
    try {
      acceptIcon = iconForNetworkPayload(localStorage.getItem('lynkos-device-icon') ?? '')
    } catch {
      acceptIcon = undefined
    }
    const acceptName = myDeviceName ?? myDevice.name
    sendInbox({
      type:       'transfer_accept',
      requestId:  head.requestId,
      from:       myDevice.deviceId,
      to:         head.from,
      senderName: acceptName,
      senderType: myDevice.type === 'mobile' || /mobile/i.test(myDevice.type) ? 'mobile' : 'desktop',
      ...(acceptIcon
        ? { senderIcon: acceptIcon, device: { name: acceptName, icon: acceptIcon } }
        : { device: { name: acceptName } }),
    })
  }

  const handleInboxReject = () => {
    const head = incomingQueueRef.current[0]
    if (!head || !myDevice) return
    sendInbox({
      type:      'transfer_reject',
      requestId: head.requestId,
      from:      myDevice.deviceId,
      to:        head.from,
    })
    setIncomingTransfers((q) => q.slice(1))
  }

  const inboxModalRequest =
    incomingTransfers.length > 0
      ? (() => {
          const head = incomingTransfers[0]
          const fl = head.files || (head.file ? [head.file] : [])
          return {
            senderName:         head.senderName ?? '近くのデバイス',
            senderType:         head.senderType ?? 'desktop',
            senderIcon:         head.senderIcon ?? head.device?.icon,
            files:              fl,
            inboundQueuedBehind: incomingTransfers.length - 1,
            resolve:            (accepted) => {
              if (accepted) handleInboxAccept()
              else handleInboxReject()
            },
          }
        })()
      : null

  const showInboundStrip =
    inboundReceiveState.phase !== 'idle' || inboundReceiveState.queuedRequests > 0

  const inFlightTransfers = transfers.filter(isInFlightTransfer)
  const completedTransfers = transfers.filter(isCompletedTransfer)

  const hasTransferUi =
    inFlightTransfers.length > 0 || completedTransfers.length > 0 || showInboundStrip

  const badge =
    sendPhase === 'waiting_response'
      ? { label: '待機', cls: styles.connecting }
      : sendPhase === 'transferring'
        ? { label: '送信中', cls: styles.connecting }
        : sendPhase === 'connecting'
          ? { label: '接続中', cls: styles.connecting }
          : CONN_BADGE[connectionState] ?? CONN_BADGE.disconnected

  const listDisabled =
    sendPhase === 'waiting_response' ||
    sendPhase === 'connecting' ||
    sendPhase === 'transferring'

  const sendUiBusy = listDisabled

  const showStatusRow =
    sendPhase === 'waiting_response' ||
    sendPhase === 'connecting' ||
    sendPhase === 'transferring' ||
    (sendPhase === 'idle' && !!webrtcPeer && !pickedFile)

  const myHeaderIcon = displayDevice ? getDeviceIconVisual(displayDevice) : null

  const hideSupportFab =
    showSettings || Boolean(receiveRequest) || Boolean(inboxModalRequest) || Boolean(downloadTarget)

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label="トップページへ">
          <svg className={styles.logoIcon} width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon
              points="14,2 25,8 25,20 14,26 3,20 3,8"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <circle cx="14" cy="14" r="4" fill="currentColor" />
          </svg>
          <span className={styles.logoText}>LynkOS</span>
        </Link>

        {displayDevice && myHeaderIcon && (
          <button
            className={styles.myDeviceBtn}
            onClick={() => setShowSettings(true)}
            title="設定"
          >
            <span
              className={[
                styles.myDeviceIcon,
                myHeaderIcon.kind === 'url' ? styles.myDeviceIconPhoto : '',
              ].filter(Boolean).join(' ')}
            >
              {myHeaderIcon.kind === 'url' ? (
                <img src={myHeaderIcon.href} alt="" className={styles.myDeviceIconImg} />
              ) : (
                myHeaderIcon.text
              )}
            </span>
            <span className={styles.myDeviceName}>{displayDevice.name}</span>
          </button>
        )}
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.pickRow}>
            <SendPanel
              onFileChosen={handleFileChosen}
              previewFile={pickedFile}
              allowPick={!sendUiBusy}
              disabled={sendUiBusy}
            />
            {pickedFile && sendPhase === 'idle' && (
              <button
                type="button"
                className={styles.iconClear}
                onClick={clearPickedFile}
                aria-label="ファイルを外す"
              >
                ×
              </button>
            )}
          </div>
        </section>

        {toast && (
          <div className={styles.toast} role="status">
            {toast}
          </div>
        )}

        <section className={styles.section}>
          {showStatusRow && (
            <div className={styles.compactStatus}>
              <span className={`${styles.connBadge} ${badge.cls}`}>{badge.label}</span>
              {sendPhase === 'waiting_response' && (
                <button type="button" className={styles.cancelBtn} onClick={cancelWaiting} aria-label="キャンセル">
                  ×
                </button>
              )}
              {connectionState === 'failed' && (
                <button type="button" className={styles.retryBtn} onClick={reconnect}>
                  再試行
                </button>
              )}
            </div>
          )}
          {connectionUserError && (
            <p className={styles.connectionError} role="alert">
              {connectionUserError}
            </p>
          )}
          <DeviceList
            devices={devices}
            onSelect={(d) => void handleDeviceTap(d)}
            error={fetchError}
            disabled={listDisabled}
            flashDeviceId={flashDeviceId}
          />
        </section>

        {(hasTransferUi || showInboundStrip) && (
          <section className={styles.section}>
            <div className={styles.transferActions} style={{ marginBottom: 10 }}>
                {completedTransfers.some((t) =>
                  ['done', 'error', 'rejected', 'received_ready'].includes(t.status)
                ) && (
                  <button
                    type="button"
                    className={styles.clearBtn}
                    aria-label="完了した項目を一覧から外す"
                    onClick={() =>
                      setTransfers((prev) => {
                        const next = prev.filter(
                          (t) =>
                            !['done', 'error', 'rejected', 'received_ready'].includes(
                              t.status
                            )
                        )
                        const keep = new Set(next.map((x) => x.id))
                        for (const x of prev) {
                          if (!keep.has(x.id) && x.storageKey) {
                            rxDeleteTransfer(x.storageKey).catch(() => {})
                          }
                        }
                        return next
                      })
                    }
                  >
                    消去
                  </button>
                )}
                {completedTransfers.some((t) => t.status === 'received_saved') && (
                  <button
                    type="button"
                    className={styles.clearBtn}
                    aria-label="保存済みの履歴を消去"
                    onClick={() =>
                      setTransfers((prev) => {
                        const next = prev.filter((t) => t.status !== 'received_saved')
                        const keep = new Set(next.map((x) => x.id))
                        for (const x of prev) {
                          if (!keep.has(x.id) && x.storageKey) {
                            rxDeleteTransfer(x.storageKey).catch(() => {})
                          }
                        }
                        return next
                      })
                    }
                  >
                    履歴消
                  </button>
                )}
            </div>
            <TransferStatus
              inFlightTransfers={inFlightTransfers}
              completedTransfers={completedTransfers}
              inboundReceiveState={inboundReceiveState}
              onReceiveFileTap={(t) => setDownloadTarget(t)}
            />
          </section>
        )}
      </main>

      {downloadTarget && (
        <DownloadConfirmDialog
          fileName={downloadTarget.name}
          fileSize={downloadTarget.size}
          onCancel={() => setDownloadTarget(null)}
          onConfirm={() => {
            const t = downloadTarget
            setDownloadTarget(null)
            runDownload(t)
          }}
        />
      )}

      {receiveRequest && (
        <ReceiveDialog
          request={receiveRequest}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}

      {inboxModalRequest && (
        <ReceiveDialog
          request={inboxModalRequest}
          onAccept={() => {
            inboxModalRequest.resolve(true)
          }}
          onReject={() => {
            inboxModalRequest.resolve(false)
          }}
        />
      )}

      {showSettings && (
        <SettingsPanel
          myDevice={displayDevice}
          onClose={() => setShowSettings(false)}
          onSave={(name) => {
            setMyDeviceName(name)
            setDeviceProfileRev((n) => n + 1)
          }}
        />
      )}

      {!hideSupportFab && (
        <Link to="/support" className={styles.supportFab} aria-label="サポート" title="サポート">
          ?
        </Link>
      )}
    </div>
  )
}
