/**
 * concept.md / iPhone・iPad 向けファイルサイズティア（短文・非技術）
 * ~100MB: 通常 / 100〜300MB: 注意 / 300MB〜: 続行確認（UIで明示）
 *
 * しきい値・判定ロジックは変更しない。ユーザー向け文言のみ translations.js から取得する。
 */
import { getCurrentLanguage, translate } from '../i18n/core'

function tt(key, params) {
  return translate(getCurrentLanguage(), key, params)
}

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
// 定数ではなく関数にして、呼び出し時点の表示言語を反映する。

export function iosDlNotice() {
  return tt('ios.dlNotice')
}

export function iosDlConfirm300() {
  return tt('ios.dlConfirm300')
}

export function iosDlBlocked() {
  return tt('ios.dlBlocked')
}

/** メモリ組み立て上限などで保存開始できないとき */
export function iosSaveBlockedShort() {
  return iosDlBlocked()
}

export function iosSaveFailureMessage() {
  return tt('ios.dlSaveFailed')
}

/** iOS Safari: Web から直接フォトライブラリへ入れないため、保存後の案内 */
export function iosImagePhotosHint() {
  return tt('ios.imagePhotosHint')
}

/** 保存確認モーダル内（短文） */
export function iosImageConfirmHint() {
  return tt('ios.imageConfirmHint')
}

/** トースト用 */
export function iosImageSaveToast() {
  return tt('ios.imageSaveToast')
}

// ── 送信前（iPhone / iPad）─────────────

export function iosSendNoticeTitle() {
  return tt('ios.sendNoticeTitle')
}

export function iosSendNoticeBody(mb) {
  return tt('ios.sendNoticeBody', { mb })
}

export function iosSendConfirm300Body(mb) {
  return tt('ios.sendConfirm300Body', { mb })
}
