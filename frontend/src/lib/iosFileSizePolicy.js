/**
 * concept.md / iPhone・iPad 向けファイルサイズティア（短文・非技術）
 */

export const MB = 1024 * 1024

export const IOS_NOTICE_MIN = 100 * MB
export const IOS_CONFIRM_MIN = 300 * MB
export const IOS_STRONG_MIN = 500 * MB
/** 保存ダイアログで続行不可（PC 推奨） */
export const IOS_BLOCKED_MIN = 800 * MB

export function isAppleTouchDevice() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** @returns {'ok' | 'notice' | 'confirm' | 'strong' | 'blocked'} */
export function getIosSizeTier(bytes) {
  const n = Number(bytes) || 0
  if (n >= IOS_BLOCKED_MIN) return 'blocked'
  if (n >= IOS_STRONG_MIN) return 'strong'
  if (n >= IOS_CONFIRM_MIN) return 'confirm'
  if (n >= IOS_NOTICE_MIN) return 'notice'
  return 'ok'
}

export function formatMb(bytes) {
  return (Number(bytes) / MB).toFixed(0)
}

// ── ダウンロード確認（2 行以内・非技術）────────────────

export const IOS_DL_NOTICE = 'ファイルサイズが大きめです'

export const IOS_DL_CONFIRM_300 =
  'このファイルは大きいため、保存に失敗する可能性があります\n続行しますか？'

export const IOS_DL_CONFIRM_500 =
  'このサイズは失敗する可能性が高いです\n続行しますか？'

export const IOS_DL_BLOCKED =
  'この端末では保存できない可能性があります\nPCでの受信をおすすめします'

export const IOS_DL_SAVE_FAILED =
  '保存に失敗しました\n別の端末での受信をおすすめします'

/** メモリ組み立て上限などで保存開始できないとき */
export function iosSaveBlockedShort() {
  return IOS_DL_BLOCKED
}

export function iosSaveFailureMessage() {
  return IOS_DL_SAVE_FAILED
}

// ── 送信前（既存フロー用・短くはしていない）─────────────

export const IOS_SEND_NOTICE_TITLE = '容量の注意（iPhone / iPad）'

export function iosSendNoticeBody(mb) {
  return `含まれるファイルの最大サイズは約 ${mb} MB です。iOS のブラウザでは、転送に時間がかかったり不安定になることがあります。`
}

export function iosSendConfirm300Body(mb) {
  return (
    `最大で約 ${mb} MB のファイルが含まれています。\n\n` +
    'iPhone / iPad の Safari では、300MB を超える転送はメモリやバックグラウンド制限により失敗しやすくなります。\n\n' +
    '続行しますか？'
  )
}

export const IOS_SEND_STRONG_ALERT =
  '【非推奨】500MB 超の送信（iPhone / iPad）\n\n' +
  'このサイズは iOS の Safari が一度に扱えるメモリや WebRTC の制限を大きく超える可能性があります。失敗・途中切断・端末の応答不良のリスクが高いです。\n\n' +
  '可能であれば PC で受信するか、ファイルを分割してください。\n\n' +
  'それでも試す場合は「OK」を押して次の確認に進みます。'

export function iosSendStrongConfirmBody(mb) {
  return (
    `約 ${mb} MB を送信しようとしています。これは iOS 環境では非推奨です。\n\n` +
    'それでも送信を開始しますか？（キャンセルを推奨します）'
  )
}
