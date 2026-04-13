import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import DeviceList from './components/DeviceList'
import SendPanel from './components/SendPanel'
import TransferStatus from './components/TransferStatus'
import DownloadConfirmDialog from './components/DownloadConfirmDialog'
import ReceiveDialog from './components/ReceiveDialog'
import SettingsPanel from './components/SettingsPanel'
import PairingConfirmDialog from './components/PairingConfirmDialog'
import useDeviceDiscovery from './hooks/useDeviceDiscovery'
import useWebRTC from './hooks/useWebRTC'
import { getDeviceEmoji } from './lib/deviceDisplay'
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
import { pairCodeFromRoom } from './lib/pairCode'
import { ensureIosWebRtcIceUnlocked } from './lib/iosIceUnlock'
import {
  isAppleTouchDevice,
  iosSaveBlockedShort,
  iosSaveFailureMessage,
} from './lib/iosFileSizePolicy'
import { isInFlightTransfer, isCompletedTransfer } from './lib/transferPhases'
import { logError } from './lib/logger'
import styles from './App.module.css'

// 接続バッジのテキストと CSS クラス
const CONN_BADGE = {
  connected:    { label: '接続済み',    cls: styles.connected    },
  connecting:   { label: '接続中...',   cls: styles.connecting   },
  reconnecting: { label: '再接続中...', cls: styles.reconnecting },
  disconnected: { label: '未接続',      cls: styles.disconnected },
  failed:       { label: '接続失敗',    cls: styles.failed       },
}

export default function App() {
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [transfers,      setTransfers]      = useState(() => loadTransferLog())
  const [receiveRequest, setReceiveRequest] = useState(null)
  const [showSettings,   setShowSettings]   = useState(false)
  const [myDeviceName,   setMyDeviceName]   = useState(null)
  const [downloadTarget, setDownloadTarget] = useState(null)
  const [pairingConfirmed, setPairingConfirmed] = useState(false)
  /** 受信キュー UI（useWebRTC が更新） */
  const [inboundReceiveState, setInboundReceiveState] = useState({
    queuedRequests: 0,
    phase:          'idle',
  })
  const transfersRef = useRef(transfers)
  transfersRef.current = transfers

  const { devices, myDevice, fetchError } = useDeviceDiscovery(myDeviceName)

  /** effect 前でも表示できるよう localStorage を同期フォールバック（iPad で … が消えない対策） */
  const displayPairCode = useMemo(() => {
    if (!selectedDevice?.deviceId) return ''
    const myId = myDevice?.deviceId ?? localStorage.getItem('lynkos-device-id') ?? ''
    if (!myId) return ''
    return pairCodeFromRoom([myId, selectedDevice.deviceId].sort().join('_'))
  }, [selectedDevice?.deviceId, myDevice?.deviceId])

  useEffect(() => {
    setPairingConfirmed(false)
    setInboundReceiveState({ queuedRequests: 0, phase: 'idle' })
  }, [selectedDevice?.deviceId])

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

  // ── 受信確認 ──
  const handleReceiveRequest = useCallback((req) => {
    setReceiveRequest(req)
  }, [])

  const handleAccept = () => { receiveRequest?.resolve(true);  setReceiveRequest(null) }
  const handleReject = () => { receiveRequest?.resolve(false); setReceiveRequest(null) }

  // ── 進捗 ──
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

  // ── 送信完了 ──
  const handleComplete = useCallback((id) => {
    const now = Date.now()
    setTransfers((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, progress: 100, status: 'done', updatedAt: now } : t
      )
      queueMicrotask(() => saveTransferLog(next))
      return next
    })
  }, [])

  // ── 受信完了（小容量は IDB に 1 チャンク、大容量は直接保存 or IDB 複数チャンク）──
  const handleReceive = useCallback(
    ({ id, name, size, directSaved, storageKey, chunkCount }) => {
      const now = Date.now()
      setTransfers((prev) => {
        const exists = prev.some((t) => t.id === id)
        const patch = directSaved
          ? {
              progress:    100,
              status:      'received_saved',
              direction:   'in',
              updatedAt:   now,
              directSaved: true,
            }
          : {
              progress:   100,
              status:     'received_ready',
              direction:  'in',
              updatedAt:  now,
              storageKey,
              chunkCount,
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
    /** showSaveFilePicker が無い環境（iPad Safari 等）で RAM に載せられる上限 */
    const MEMORY_ASSEMBLY_MAX = 200 * 1024 * 1024
    const sz = Number(size) || 0
    const needsStreamSave = chunkCount > 1 || sz >= INLINE_DL_MAX
    const isAppleTouch = isAppleTouchDevice()

    const triggerAnchorDownload = (blobUrl, fileName) => {
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
      }, 2000)
    }

    try {
      if (!needsStreamSave && chunkCount === 1 && sz < INLINE_DL_MAX) {
        const buf = await rxReadChunk(storageKey, 0)
        if (!buf) return
        const url = URL.createObjectURL(new Blob([buf]))
        triggerAnchorDownload(url, name)
      } else if (typeof window.showSaveFilePicker === 'function') {
        // ユーザージェスチャを優先: 先に保存ダイアログ（無効な types は Chrome で例外の原因）
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
      } else if (sz <= MEMORY_ASSEMBLY_MAX) {
        const blob = await rxAssembleBlob(storageKey, chunkCount)
        const file = new File([blob], name, {
          type: blob.type || 'application/octet-stream',
        })
        const canShareFiles =
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] })

        if (canShareFiles && isAppleTouch) {
          try {
            await navigator.share({ files: [file], title: name })
          } catch (e) {
            if (e?.name === 'AbortError') return
            const url = URL.createObjectURL(blob)
            triggerAnchorDownload(url, name)
          }
        } else {
          const url = URL.createObjectURL(blob)
          triggerAnchorDownload(url, name)
        }
      } else {
        window.alert(iosSaveBlockedShort())
        return
      }

      await rxDeleteTransfer(storageKey)
      const now = Date.now()
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

  // ── 再接続上限 ──
  const handleFailed = useCallback(() => {}, [])

  const {
    sendFiles,
    connectionState,
    reconnect,
    peerPairingConfirmed,
    transportReady,
    connectionUserError,
  } = useWebRTC({
    targetDevice:          selectedDevice,
    localPairingConfirmed: pairingConfirmed,
    onConnectionReset:     () => setPairingConfirmed(false),
    onProgress:            handleProgress,
    onComplete:            handleComplete,
    onReceiveRequest:      handleReceiveRequest,
    onInboundQueueChange:  handleInboundQueueChange,
    onReceive:             handleReceive,
    onFailed:              handleFailed,
  })

  useEffect(() => {
    if (!transportReady) setReceiveRequest(null)
  }, [transportReady])

  const prevConnectionStateRef = useRef(null)
  useEffect(() => {
    const prev = prevConnectionStateRef.current
    prevConnectionStateRef.current = connectionState
    // 再接続で一時的に connecting になるだけでは「接続する」を消さない
    if (
      prev === 'connected' &&
      (connectionState === 'disconnected' || connectionState === 'failed')
    ) {
      setPairingConfirmed(false)
    }
  }, [connectionState])

  const handleSend = (files) => {
    if (!transportReady || !pairingConfirmed || !peerPairingConfirmed) {
      return
    }
    const now = Date.now()
    const base = Date.now()
    const newTransfers = Array.from(files).map((file, idx) => ({
      id:        `${base}-${idx}-${file.name}`,
      name:      file.name,
      size:      file.size,
      progress:  0,
      status:    idx === 0 ? 'sending' : 'queued',
      direction: 'out',
      updatedAt: now,
    }))
    setTransfers((prev) => [...prev, ...newTransfers])
    sendFiles(files, newTransfers.map((t) => t.id))
  }

  const displayDevice = myDevice
    ? { ...myDevice, name: myDeviceName ?? myDevice.name }
    : null

  const showInboundStrip =
    inboundReceiveState.phase !== 'idle' || inboundReceiveState.queuedRequests > 0

  /** 待機中・転送中（転送中タブ） */
  const inFlightTransfers = transfers.filter(isInFlightTransfer)
  /** 完了・履歴・エラー等（完了タブ） */
  const completedTransfers = transfers.filter(isCompletedTransfer)

  const hasTransferUi =
    inFlightTransfers.length > 0 || completedTransfers.length > 0 || showInboundStrip

  const pairingHandshakeDone =
    pairingConfirmed && peerPairingConfirmed

  const badge =
    transportReady && !pairingHandshakeDone
      ? {
          label:
            !pairingConfirmed && !peerPairingConfirmed
              ? '確認が必要'
              : !peerPairingConfirmed
                ? '相手の確認待ち'
                : 'あなたの確認待ち',
          cls: styles.connecting,
        }
      : CONN_BADGE[connectionState] ?? CONN_BADGE.disconnected

  const sendReady = transportReady && pairingHandshakeDone

  const pairingUiComplete = transportReady && pairingHandshakeDone

  const showPairingSheet = selectedDevice && !pairingUiComplete

  return (
    <div className={styles.layout}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.logo}>
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
        </div>

        {displayDevice && (
          <button
            className={styles.myDeviceBtn}
            onClick={() => setShowSettings(true)}
            title="設定"
          >
            <span className={styles.myDeviceIcon}>
              {getDeviceEmoji(displayDevice)}
            </span>
            <span className={styles.myDeviceName}>{displayDevice.name}</span>
          </button>
        )}
      </header>

      {/* メインコンテンツ */}
      <main className={styles.main}>

        {/* デバイス検出エリア */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>近くのデバイス</span>
            {devices.length > 0 && (
              <span className={styles.deviceCount}>{devices.length}台検出</span>
            )}
          </div>
          {devices.length > 0 && (
            <p className={styles.pairingHint}>
              接続するには、相手の端末でも一覧からあなたを選んでください。
            </p>
          )}
          <DeviceList
            devices={devices}
            selected={selectedDevice}
            onSelect={async (d) => {
              if (selectedDevice?.deviceId === d.deviceId) {
                setSelectedDevice(null)
                return
              }
              await ensureIosWebRtcIceUnlocked()
              setSelectedDevice(d)
            }}
            error={fetchError}
          />
        </section>

        {/* 送信エリア（デバイス選択後） */}
        {selectedDevice && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>
                {selectedDevice.name} に送信
              </span>
              <div className={styles.badgeRow}>
                <span className={`${styles.connBadge} ${badge.cls}`}>
                  {badge.label}
                </span>
                {connectionState === 'failed' && (
                  <button className={styles.retryBtn} onClick={reconnect}>
                    再試行
                  </button>
                )}
              </div>
            </div>
            {connectionUserError && (
              <p className={styles.connectionError} role="alert">
                {connectionUserError}
              </p>
            )}
            <SendPanel
              onSend={handleSend}
              disabled={!sendReady}
            />
          </section>
        )}

        {/* 転送完了 / 転送履歴 / 受信キュー表示 */}
        {(hasTransferUi || showInboundStrip) && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>転送</span>
              <div className={styles.transferActions}>
                {completedTransfers.some((t) =>
                  ['done', 'error', 'rejected', 'received_ready'].includes(t.status)
                ) && (
                  <button
                    type="button"
                    className={styles.clearBtn}
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
                    完了を消去
                  </button>
                )}
                {completedTransfers.some((t) => t.status === 'received_saved') && (
                  <button
                    type="button"
                    className={styles.clearBtn}
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
                    履歴を消去
                  </button>
                )}
              </div>
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

      {/* 受信ダイアログ */}
      {receiveRequest && (
        <ReceiveDialog
          request={receiveRequest}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}

      {/* 設定パネル */}
      {showSettings && (
        <SettingsPanel
          myDevice={displayDevice}
          onClose={() => setShowSettings(false)}
          onSave={setMyDeviceName}
        />
      )}

      {showPairingSheet && selectedDevice && (
        <PairingConfirmDialog
          peerName={selectedDevice.name}
          pairCode={displayPairCode}
          pairingConfirmed={pairingConfirmed}
          connectionFailed={connectionState === 'failed'}
          onConnect={() => setPairingConfirmed(true)}
          onCancel={() => setSelectedDevice(null)}
          onReconnect={reconnect}
        />
      )}
    </div>
  )
}
