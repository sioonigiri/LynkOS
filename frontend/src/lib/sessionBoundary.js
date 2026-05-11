/**
 * ブラウザを閉じた／タブを離れた時刻を記録し、
 * 再表示から 30 分以上経過していたら軽量化のため揮発データを消す。
 * （pagehide はリロード時も発火するが、その直後の load では差分が数 ms のみなので誤ってリセットしない）
 */

export const LONG_ABSENCE_MS = 30 * 60 * 1000

const END_KEY = 'lynkos-session-ended-at'
const KEEP_KEYS = new Set(['lynkos-device-id', 'lynkos-device-name', 'lynkos-device-icon'])

export function recordSessionEnd() {
  try {
    localStorage.setItem(END_KEY, String(Date.now()))
  } catch (_) {
    /* private mode 等 */
  }
}

/**
 * @returns {{ didReset: boolean }}
 */
export function applyLongAbsenceResetIfNeeded() {
  try {
    const raw = localStorage.getItem(END_KEY)
    if (!raw) return { didReset: false }

    const endedAt = parseInt(raw, 10)
    if (Number.isNaN(endedAt)) {
      localStorage.removeItem(END_KEY)
      return { didReset: false }
    }

    if (Date.now() - endedAt < LONG_ABSENCE_MS) return { didReset: false }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('lynkos-')) continue
      if (KEEP_KEYS.has(k)) continue
      localStorage.removeItem(k)
    }
    return { didReset: true }
  } catch (_) {
    return { didReset: false }
  }
}

export async function clearLynkOsCaches() {
  if (!('caches' in window)) return
  try {
    const keys = await caches.keys()
    await Promise.all(
      keys.filter((name) => name.startsWith('lynkos')).map((name) => caches.delete(name))
    )
  } catch (_) {
    /* 無視 */
  }
}
