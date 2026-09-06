import { useState, useLayoutEffect } from 'react'
import { getTransferLifecyclePhase } from '../lib/transferPhases'
import { useLanguage } from '../i18n/useLanguage'
import styles from './TransferStatus.module.css'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext)) return '🖼'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext))                  return '🎬'
  if (['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(ext))                  return '🎵'
  if (['pdf'].includes(ext))                                                 return '📑'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))                      return '🗜'
  if (['doc', 'docx', 'txt', 'md'].includes(ext))                           return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext))                                  return '📊'
  if (['ppt', 'pptx'].includes(ext))                                         return '📋'
  return '📄'
}

function TransferRow({ t: item, onReceiveTap, tr }) {
  const isReceiveTap = item.status === 'received_ready' && typeof onReceiveTap === 'function'
  const phase = getTransferLifecyclePhase(item)
  const showProgressTrack =
    item.status === 'queued' || item.status === 'sending' || item.status === 'receiving'

  return (
    <li className={`${styles.item} ${styles[item.status] ?? ''}`}>
      <div className={styles.row}>
        <span className={styles.fileIcon}>
          {item.status === 'done'             ? '✅'
          : item.status === 'received_saved' ? '✅'
          : item.status === 'received_ready' ? '📥'
          : item.status === 'error'          ? '❌'
          : item.status === 'rejected'       ? '🚫'
          : getFileIcon(item.name)}
        </span>

        <div className={styles.info}>
          {isReceiveTap ? (
            <button
              type="button"
              className={styles.fileTapBtn}
              onClick={() => onReceiveTap(item)}
              aria-label={tr('transferStatus.receiveConfirmAria')}
            >
              {item.name}
            </button>
          ) : (
            <span className={styles.name} title={item.name}>{item.name}</span>
          )}
          <span className={styles.meta}>{formatBytes(item.size)}</span>
        </div>

        <span className={`${styles.badge} ${styles[`badge_${item.status}`] ?? ''}`}>
          {phase === 'waiting'                  ? tr('transferStatus.waiting')
          : item.status === 'receiving'        ? tr('transferStatus.receivingPercent', { p: item.progress ?? 0 })
          : item.status === 'sending'          ? tr('transferStatus.sendingPercent', { p: item.progress ?? 0 })
          : item.status === 'done'             ? tr('transferStatus.done')
          : item.status === 'received_saved'   ? tr('transferStatus.done')
          : item.status === 'received_ready'   ? tr('transferStatus.received')
          : item.status === 'error'            ? tr('transferStatus.error')
          : item.status === 'rejected'         ? tr('transferStatus.rejected')
          : `${item.progress ?? 0}%`}
        </span>
      </div>

      {showProgressTrack && (
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{ width: `${item.status === 'queued' ? 0 : (item.progress ?? 0)}%` }}
          />
        </div>
      )}
    </li>
  )
}

function inboundStripText(state, t) {
  if (!state) return ''
  const q = state.queuedRequests ?? 0
  if (state.phase === 'prompt' && q > 0) {
    return `+${q}`
  }
  if (state.phase === 'receiving' && q > 0) {
    return t('transferStatus.receivingCount', { q })
  }
  if (state.phase === 'receiving') {
    return t('transferStatus.receivingInProgress')
  }
  if (q > 0) {
    return `+${q}`
  }
  return ''
}

export default function TransferStatus({
  inFlightTransfers,
  completedTransfers,
  onReceiveFileTap,
  inboundReceiveState,
}) {
  const { t } = useLanguage()
  const [tab, setTab] = useState('inflight')

  const hasInFlight = inFlightTransfers.length > 0
  const hasCompleted = completedTransfers.length > 0
  const inboundMsg = inboundStripText(inboundReceiveState, t)
  const showInbound = inboundMsg.length > 0

  useLayoutEffect(() => {
    if (hasInFlight) setTab('inflight')
    else if (hasCompleted) setTab('completed')
  }, [hasInFlight, hasCompleted])

  if (!hasInFlight && !hasCompleted && !showInbound) return null

  return (
    <div className={styles.wrap}>
      {showInbound && (
        <div className={styles.inboundStrip} role="status">
          {inboundMsg}
        </div>
      )}

      {(hasInFlight || hasCompleted) && (
        <div className={styles.tabBar} role="tablist" aria-label={t('transferStatus.tablistAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'inflight'}
            className={`${styles.tab} ${tab === 'inflight' ? styles.tabActive : ''}`}
            onClick={() => setTab('inflight')}
          >
            {t('transferStatus.inflight')}
            {hasInFlight ? (
              <span className={styles.tabCount}>{inFlightTransfers.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'completed'}
            className={`${styles.tab} ${tab === 'completed' ? styles.tabActive : ''}`}
            onClick={() => setTab('completed')}
          >
            {t('transferStatus.completed')}
            {hasCompleted ? (
              <span className={styles.tabCount}>{completedTransfers.length}</span>
            ) : null}
          </button>
        </div>
      )}

      {tab === 'inflight' && hasInFlight && (
        <div className={styles.block} role="tabpanel">
          <ul className={styles.list}>
            {inFlightTransfers.map((item) => (
              <TransferRow key={item.id} t={item} onReceiveTap={onReceiveFileTap} tr={t} />
            ))}
          </ul>
        </div>
      )}

      {tab === 'inflight' && !hasInFlight && hasCompleted && (
        <p className={styles.tabEmpty} aria-hidden>
          —
        </p>
      )}

      {tab === 'completed' && hasCompleted && (
        <div className={styles.block} role="tabpanel">
          <ul className={styles.list}>
            {completedTransfers.map((item) => (
              <TransferRow key={item.id} t={item} onReceiveTap={onReceiveFileTap} tr={t} />
            ))}
          </ul>
        </div>
      )}

      {tab === 'completed' && !hasCompleted && hasInFlight && (
        <p className={styles.tabEmpty} aria-hidden>
          —
        </p>
      )}
    </div>
  )
}
