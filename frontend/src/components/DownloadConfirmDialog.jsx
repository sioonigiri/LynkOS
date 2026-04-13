import {
  isAppleTouchDevice,
  getIosSizeTier,
  formatMb,
  IOS_DL_NOTICE,
  IOS_DL_CONFIRM_300,
  IOS_DL_CONFIRM_500,
  IOS_DL_BLOCKED,
} from '../lib/iosFileSizePolicy'
import styles from './DownloadConfirmDialog.module.css'

export default function DownloadConfirmDialog({
  fileName,
  fileSize,
  onConfirm,
  onCancel,
}) {
  const iOS = isAppleTouchDevice()
  const sz = Number(fileSize) || 0
  const tier = iOS ? getIosSizeTier(sz) : 'ok'

  const canConfirm = tier !== 'blocked'

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm()
  }

  const iosBody =
    tier === 'notice'
      ? IOS_DL_NOTICE
      : tier === 'confirm'
        ? IOS_DL_CONFIRM_300
        : tier === 'strong'
          ? IOS_DL_CONFIRM_500
          : tier === 'blocked'
            ? IOS_DL_BLOCKED
            : ''

  return (
    <div className={styles.overlay} onClick={onCancel} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="dl-confirm-title"
      >
        <p id="dl-confirm-title" className={styles.title}>
          {tier === 'blocked' ? '保存について' : 'ダウンロードしますか？'}
        </p>
        <p className={styles.fileName} title={fileName}>
          {fileName}
        </p>
        {sz > 0 && (
          <p className={styles.sizeLine}>サイズ: 約 {formatMb(sz)} MB</p>
        )}

        {iOS && tier !== 'ok' && tier !== 'blocked' && (
          <div
            className={`${styles.iosBox} ${
              tier === 'notice'
                ? styles.iosBoxNotice
                : tier === 'confirm'
                  ? styles.iosBoxWarn
                  : styles.iosBoxStrong
            }`}
            role={tier === 'notice' ? 'status' : undefined}
          >
            <p className={styles.iosTextPre}>{iosBody}</p>
          </div>
        )}

        {iOS && tier === 'blocked' && (
          <div className={`${styles.iosBox} ${styles.iosBoxStrong}`} role="alert">
            <p className={styles.iosTextPre}>{IOS_DL_BLOCKED}</p>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {tier === 'blocked' ? '閉じる' : 'キャンセル'}
          </button>
          {tier !== 'blocked' && (
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {iOS && (tier === 'confirm' || tier === 'strong') ? '続行' : '保存する'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
