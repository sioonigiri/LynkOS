import {
  isAppleTouchDevice,
  getIosSizeTier,
  IOS_DL_NOTICE,
  IOS_DL_CONFIRM_300,
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

  const tierNote =
    iOS && tier === 'notice'
      ? IOS_DL_NOTICE
      : iOS && tier === 'confirm'
        ? IOS_DL_CONFIRM_300
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
        aria-label="保存の確認"
      >
        {tier !== 'blocked' ? (
          <p id="dl-confirm-title" className={styles.dialogTitle}>
            保存しますか？
          </p>
        ) : (
          <p id="dl-confirm-title" className={styles.dialogTitle}>
            保存できません
          </p>
        )}
        {tierNote ? (
          <p
            className={styles.tierNote}
            role={tier === 'blocked' ? 'alert' : 'status'}
          >
            {tierNote}
          </p>
        ) : null}
        <p className={styles.fileName} title={fileName}>
          {fileName}
        </p>
        <div
          className={`${styles.actions} ${tier === 'blocked' ? styles.actionsSingle : ''}`}
        >
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
          >
            {tier === 'blocked' ? '閉じる' : 'キャンセル'}
          </button>
          {tier !== 'blocked' && (
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              保存
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
