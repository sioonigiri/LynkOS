/**
 * 転送 UI 用ライフサイクル（保存は従来どおり status）
 * - waiting: キュー待ち（送信側）
 * - transferring: バイト転送中
 * - completed: 終端
 */

export const COMPLETED_STATUSES = [
  'done',
  'received_ready',
  'received_saved',
  'error',
  'rejected',
]

/** @returns {'waiting' | 'transferring' | 'completed'} */
export function getTransferLifecyclePhase(t) {
  const s = t?.status
  if (s === 'queued') return 'waiting'
  if (s === 'sending' || s === 'receiving') return 'transferring'
  if (COMPLETED_STATUSES.includes(s)) return 'completed'
  return 'completed'
}

/** 転送中タブ: 待機＋転送中（完了前のすべて） */
export function isInFlightTransfer(t) {
  const p = getTransferLifecyclePhase(t)
  return p === 'waiting' || p === 'transferring'
}

export function isCompletedTransfer(t) {
  return getTransferLifecyclePhase(t) === 'completed'
}
