import { useState, useLayoutEffect } from 'react'
import { getTransferLifecyclePhase } from '../lib/transferPhases'
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

function TransferRow({ t, onReceiveTap }) {
  const isReceiveTap = t.status === 'received_ready' && typeof onReceiveTap === 'function'
  const phase = getTransferLifecyclePhase(t)
  const showProgressTrack =
    t.status === 'queued' || t.status === 'sending' || t.status === 'receiving'

  return (
    <li className={`${styles.item} ${styles[t.status] ?? ''}`}>
      <div className={styles.row}>
        <span className={styles.fileIcon}>
          {t.status === 'done'             ? '✅'
          : t.status === 'received_saved' ? '✅'
          : t.status === 'received_ready' ? '📥'
          : t.status === 'error'          ? '❌'
          : t.status === 'rejected'       ? '🚫'
          : getFileIcon(t.name)}
        </span>

        <div className={styles.info}>
          {isReceiveTap ? (
            <button
              type="button"
              className={styles.fileTapBtn}
              onClick={() => onReceiveTap(t)}
              title="ダウンロードの確認へ"
            >
              {t.name}
            </button>
          ) : (
            <span className={styles.name} title={t.name}>{t.name}</span>
          )}
          <span className={styles.meta}>{formatBytes(t.size)}</span>
        </div>

        <span className={`${styles.badge} ${styles[`badge_${t.status}`] ?? ''}`}>
          {phase === 'waiting'             ? '待機中'
          : t.status === 'receiving'      ? `受信中 ${t.progress ?? 0}%`
          : t.status === 'sending'        ? `転送中 ${t.progress ?? 0}%`
          : t.status === 'done'             ? '完了（送信）'
          : t.status === 'received_saved'  ? (t.directSaved ? '完了（保存済・指定先）' : '完了（保存済）')
          : t.status === 'received_ready' ? '受信完了（保存待ち）'
          : t.status === 'error'          ? 'エラー'
          : t.status === 'rejected'       ? '拒否'
          : `${t.progress ?? 0}%`}
        </span>
      </div>

      {showProgressTrack && (
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{ width: `${t.status === 'queued' ? 0 : (t.progress ?? 0)}%` }}
          />
        </div>
      )}
    </li>
  )
}

function inboundStripText(state) {
  if (!state) return ''
  const q = state.queuedRequests ?? 0
  if (state.phase === 'prompt' && q > 0) {
    return `受信確認のあと、さらに ${q} 件が順番待ちです（同時受信しません）。`
  }
  if (state.phase === 'receiving' && q > 0) {
    return `受信中です。あと ${q} 件のリクエストが待機中です。`
  }
  if (state.phase === 'receiving') {
    return 'ファイルを受信中です。完了するまで次の受信は始まりません。'
  }
  if (q > 0) {
    return `受信キュー: ${q} 件が順番待ちです。`
  }
  return ''
}

export default function TransferStatus({
  inFlightTransfers,
  completedTransfers,
  onReceiveFileTap,
  inboundReceiveState,
}) {
  const [tab, setTab] = useState('inflight')

  const hasInFlight = inFlightTransfers.length > 0
  const hasCompleted = completedTransfers.length > 0
  const inboundMsg = inboundStripText(inboundReceiveState)
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
        <div className={styles.tabBar} role="tablist" aria-label="転送の表示切替">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'inflight'}
            className={`${styles.tab} ${tab === 'inflight' ? styles.tabActive : ''}`}
            onClick={() => setTab('inflight')}
          >
            転送中
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
            完了
            {hasCompleted ? (
              <span className={styles.tabCount}>{completedTransfers.length}</span>
            ) : null}
          </button>
        </div>
      )}

      {tab === 'inflight' && hasInFlight && (
        <div className={styles.block} role="tabpanel">
          <ul className={styles.list}>
            {inFlightTransfers.map((t) => (
              <TransferRow key={t.id} t={t} onReceiveTap={onReceiveFileTap} />
            ))}
          </ul>
        </div>
      )}

      {tab === 'inflight' && !hasInFlight && hasCompleted && (
        <p className={styles.tabEmpty}>転送中のファイルはありません。</p>
      )}

      {tab === 'completed' && hasCompleted && (
        <div className={styles.block} role="tabpanel">
          <ul className={styles.list}>
            {completedTransfers.map((t) => (
              <TransferRow key={t.id} t={t} onReceiveTap={onReceiveFileTap} />
            ))}
          </ul>
        </div>
      )}

      {tab === 'completed' && !hasCompleted && hasInFlight && (
        <p className={styles.tabEmpty}>完了した転送はまだありません。</p>
      )}
    </div>
  )
}
