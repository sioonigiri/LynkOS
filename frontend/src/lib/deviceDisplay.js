/**
 * デバイス表示（絵文字・ラベル）の単一の定義。
 * platform を type より優先し、自分のヘッダーと相手端末の一覧表示を一致させる。
 * （type だけ mobile / API の食い違いで 📱 になるのを防ぐ）
 */

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
