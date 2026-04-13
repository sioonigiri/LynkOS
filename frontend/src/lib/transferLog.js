import { LONG_ABSENCE_MS } from './sessionBoundary'

export const TRANSFER_LOG_KEY = 'lynkos-transfer-log'

/** 転送履歴の表示・復元の最大保持時間（リロード後もこの時間で自然消滅） */
export const TRANSFER_HISTORY_TTL_MS = LONG_ABSENCE_MS

/**
 * @returns {Array<object>}
 */
export function loadTransferLog() {
  try {
    const raw = localStorage.getItem(TRANSFER_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const items = Array.isArray(parsed?.items) ? parsed.items : []
    const now = Date.now()
    return items.filter((t) => {
      const u = typeof t.updatedAt === 'number' ? t.updatedAt : 0
      if (now - u >= TRANSFER_HISTORY_TTL_MS) return false
      // リロード後は接続が切れるため進行中は復元しない
      if (
        t.status === 'sending' ||
        t.status === 'receiving' ||
        t.status === 'queued'
      ) {
        return false
      }
      return true
    })
  } catch {
    return []
  }
}

function toStorable(t) {
  return {
    id:          t.id,
    name:        t.name,
    size:        t.size,
    status:      t.status,
    direction:   t.direction,
    progress:    t.progress ?? 0,
    updatedAt:   t.updatedAt ?? Date.now(),
    storageKey:  t.storageKey,
    chunkCount:  t.chunkCount,
    directSaved: t.directSaved === true,
  }
}

export function saveTransferLog(items) {
  try {
    const now = Date.now()
    // sending/receiving も保存する（復元時は load で除外）。除外すると送受信中に
    // 「完了行だけ」が消えて localStorage が空になることがあった。
    const trimmed = items
      .filter((t) => {
        const u = typeof t.updatedAt === 'number' ? t.updatedAt : now
        return now - u < TRANSFER_HISTORY_TTL_MS
      })
      .map(toStorable)
    localStorage.setItem(TRANSFER_LOG_KEY, JSON.stringify({ items: trimmed }))
  } catch {
    /* 容量超過など */
  }
}

export function pruneExpired(items) {
  const now = Date.now()
  return items.filter((t) => {
    const u = typeof t.updatedAt === 'number' ? t.updatedAt : now
    return now - u < TRANSFER_HISTORY_TTL_MS
  })
}
