/**
 * デバイス表示（プレースホルダ絵文字・ラベル）。
 * device.icon は http(s) / data:image のみ画像として扱い、それ以外は無視して端末種別の絵文字にフォールバック。
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|avif|bmp)$/i

/** presence / 転送ペイロード用。data URL 含む（バックエンド ICON_MAX_LEN と揃える） */
export const MAX_DEVICE_ICON_CHARS = 400_000

export function isLikelyImageFileName(name) {
  return IMAGE_EXT.test(String(name || ''))
}

/** 拡張子から Web Share / Blob 用の MIME を推定（空文字 = 不明） */
export function suggestedMimeFromFileName(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'png':       return 'image/png'
    case 'jpg':
    case 'jpeg':      return 'image/jpeg'
    case 'gif':       return 'image/gif'
    case 'webp':      return 'image/webp'
    case 'heic':
    case 'avif':
    case 'bmp':       return `image/${ext}`
    case 'pdf':       return 'application/pdf'
    case 'zip':       return 'application/zip'
    case 'txt':       return 'text/plain'
    case 'csv':       return 'text/csv'
    case 'json':      return 'application/json'
    case 'mp4':       return 'video/mp4'
    case 'mov':       return 'video/quicktime'
    case 'webm':      return 'video/webm'
    default:          return ''
  }
}

export function isDeviceIconUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim())
}

export function isDeviceIconDataUrl(s) {
  return /^data:image\//i.test(String(s || '').trim())
}

/** 転送・API 用（空・超過は送らない） */
export function iconForNetworkPayload(stored) {
  if (stored == null || typeof stored !== 'string') return undefined
  const t = stored.trim()
  if (!t || t.length > MAX_DEVICE_ICON_CHARS) return undefined
  return t
}

/**
 * 一覧・モーダル用。http(s) / data:image は kind:url。
 * @returns {{ kind: 'emoji', text: string } | { kind: 'url', href: string }}
 */
export function getDeviceIconVisual(device) {
  if (!device) return { kind: 'emoji', text: '🖥' }
  const raw = device.icon
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t && (isDeviceIconUrl(t) || isDeviceIconDataUrl(t))) return { kind: 'url', href: t }
  }
  return { kind: 'emoji', text: getDeviceEmoji(device) }
}

/** 受信ダイアログなど（URL ではなく絵文字1個想定） */
export function resolveDeviceIconChar(device) {
  const v = getDeviceIconVisual(device)
  return v.kind === 'emoji' ? v.text : '🖼'
}

export function getDeviceEmoji(device) {
  if (!device) return '🖥'
  const p = String(device.platform || '').toLowerCase()
  const t = String(device.type || '').toLowerCase()

  if (p === 'iphone' || p === 'ipad' || p === 'android') return '📱'
  if (p === 'mac') return '💻'
  if (p === 'windows' || p === 'linux' || p === 'desktop') return '🖥'
  if (t === 'mobile') return '📱'
  return '🖥'
}

export function getDeviceLabel(device) {
  if (!device) return 'PC'
  const p = String(device.platform || '').toLowerCase()
  switch (p) {
    case 'iphone':  return 'iPhone'
    case 'ipad':    return 'iPad'
    case 'android': return 'Android'
    case 'mac':     return 'Mac'
    case 'windows': return 'Windows PC'
    case 'linux':   return 'Linux PC'
    case 'desktop': return 'PC'
    default:
      return device.type === 'mobile' ? 'モバイル' : 'PC'
  }
}

/** 転送一覧のファイル行用（MIME 優先） */
export function fileEntryVisual(name, mimeType) {
  const m = String(mimeType || '')
  if (m.startsWith('image/')) return { icon: '🖼', isImage: true }
  if (m.startsWith('video/')) return { icon: '🎬', isImage: false }
  if (m.startsWith('audio/')) return { icon: '🎵', isImage: false }
  if (m.startsWith('text/') || /\.(txt|md|csv)$/i.test(String(name))) return { icon: '📝', isImage: false }
  if (/\.(zip|7z|rar)$/i.test(String(name))) return { icon: '📦', isImage: false }
  if (isLikelyImageFileName(name)) return { icon: '🖼', isImage: true }
  return { icon: '📄', isImage: false }
}
