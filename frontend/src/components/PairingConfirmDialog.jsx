import styles from './PairingConfirmDialog.module.css'
import { useLanguage } from '../i18n/useLanguage'

/**
 * 送信側: 接続リクエストを送り、相手の許可待ち
 * 受信側: 接続リクエストの許可／拒否（concept.md・セッションID照合なし）
 */
export function ConnectionIncomingDialog({
  senderName,
  senderType,
  onAccept,
  onReject,
}) {
  const { t } = useLanguage()

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="conn-in-title"
      >
        <p id="conn-in-title" className={styles.visuallyHidden}>
          {t('pairing.connectHidden')}
        </p>
        <div className={styles.senderBubble}>
          <span className={styles.senderIcon} aria-hidden>
            {senderType === 'desktop' ? '🖥' : '📱'}
          </span>
        </div>
        <p className={styles.peerName}>{senderName}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionRowNeutral}`}
            onClick={onReject}
            aria-label={t('pairing.deny')}
          >
            <span className={styles.rejectMark} aria-hidden>×</span>
            <span>{t('pairing.deny')}</span>
          </button>
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionRowSelected}`}
            onClick={onAccept}
            aria-label={t('pairing.allow')}
          >
            <span className={styles.circleMark} aria-hidden />
            <span>{t('pairing.allow')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PairingConfirmDialog({
  peerName,
  outgoingAwaitingAccept,
  connectionFailed,
  onSendRequest,
  onCancel,
  onReconnect,
}) {
  const { t } = useLanguage()
  const waiting = outgoingAwaitingAccept && !connectionFailed

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="pair-peer"
      >
        <p id="pair-peer" className={styles.peerName}>
          {peerName}
        </p>

        {waiting ? (
          <p className={styles.subtle} aria-hidden>
            …
          </p>
        ) : (
          <p className={styles.visuallyHidden}>{t('pairing.titleHidden')}</p>
        )}

        <div className={waiting ? `${styles.actions} ${styles.actionsSingle}` : styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} aria-label={t('pairing.cancelAria')}>
            ×
          </button>
          {connectionFailed ? (
            <button type="button" className={styles.btnPrimary} onClick={onReconnect} aria-label={t('pairing.reconnectAria')}>
              ↻
            </button>
          ) : !waiting ? (
            <button type="button" className={styles.btnPrimary} onClick={onSendRequest} aria-label={t('pairing.sendAria')}>
              →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
