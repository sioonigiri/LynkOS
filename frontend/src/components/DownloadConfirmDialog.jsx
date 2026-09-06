import {
  isAppleTouchDevice,
  getIosSizeTier,
  iosDlNotice,
  iosDlConfirm300,
  iosDlBlocked,
} from '../lib/iosFileSizePolicy'
import { useLanguage } from '../i18n/useLanguage'
import styles from './DownloadConfirmDialog.module.css'

export default function DownloadConfirmDialog({
  fileName,
  fileSize,
  onConfirm,
  onCancel,
}) {
  const { t } = useLanguage()
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
      ? iosDlNotice()
      : iOS && tier === 'confirm'
        ? iosDlConfirm300()
        : tier === 'blocked'
          ? iosDlBlocked()
          : ''

  return (
    <div className={styles.overlay} onClick={onCancel} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="dl-confirm-title"
        aria-label={t('downloadDialog.dialogAria')}
      >
        {tier !== 'blocked' ? (
          <p id="dl-confirm-title" className={styles.dialogTitle}>
            {t('downloadDialog.confirmTitle')}
          </p>
        ) : (
          <p id="dl-confirm-title" className={styles.dialogTitle}>
            {t('downloadDialog.blockedTitle')}
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
            {tier === 'blocked' ? t('downloadDialog.close') : t('downloadDialog.cancel')}
          </button>
          {tier !== 'blocked' && (
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {t('downloadDialog.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
