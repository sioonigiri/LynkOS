/**
 * concept.md / iPhone・iPad 向けファイルサイズティア（短文・非技術）
 * ~100MB: 通常 / 100〜300MB: 注意 / 300MB〜: 続行確認（UIで明示）
 */

export const MB = 1024 * 1024

export const IOS_NOTICE_MIN = 100 * MB
export const IOS_CONFIRM_MIN = 300 * MB
/** 保存 UI で続行ボタンを出さない上限（実運用で破綻しやすい帯域） */
export const IOS_BLOCKED_MIN = 1024 * MB

export function isAppleTouchDevice() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** @returns {'ok' | 'notice' | 'confirm' | 'blocked'} */
export function getIosSizeTier(bytes) {
  const n = Number(bytes) || 0
  if (n >= IOS_BLOCKED_MIN) return 'blocked'
  if (n >= IOS_CONFIRM_MIN) return 'confirm'
  if (n >= IOS_NOTICE_MIN) return 'notice'
  return 'ok'
}

export function formatMb(bytes) {
  return (Number(bytes) / MB).toFixed(0)
}

// ── ダウンロード確認（2 行以内・非技術）────────────────

export const IOS_DL_NOTICE = '約100MB超'

export const IOS_DL_CONFIRM_300 = '約300MB超・続行？'

export const IOS_DL_BLOCKED = 'この端末では不可の可能性'

export const IOS_DL_SAVE_FAILED =
  '保存に失敗しました'

/** メモリ組み立て上限などで保存開始できないとき */
export function iosSaveBlockedShort() {
  return IOS_DL_BLOCKED
}

export function iosSaveFailureMessage() {
  return IOS_DL_SAVE_FAILED
}

/** iOS Safari: Web から直接フォトライブラリへ入れないため、保存後の案内 */
/** iOS Safari: Web から直接フォトライブラリへ入れないため、保存後の案内 */
export const IOS_IMAGE_PHOTOS_HINT =
  '「ファイル」に保存されます。写真へは共有から「写真に保存」。'

/** 保存確認モーダル内（短文） */
export const IOS_IMAGE_CONFIRM_HINT =
  '共有シートから「写真に保存」で追加できます。'

/** トースト用 */
export const IOS_IMAGE_SAVE_TOAST =
  '保存しました'

// ── 送信前（iPhone / iPad）─────────────

export const IOS_SEND_NOTICE_TITLE = '容量の注意'

export function iosSendNoticeBody(mb) {
  return `最大約 ${mb} MB。転送が不安定になることがあります。`
}

export function iosSendConfirm300Body(mb) {
  return `約 ${mb} MB。このサイズは失敗しやすいです。続行しますか？`
}
