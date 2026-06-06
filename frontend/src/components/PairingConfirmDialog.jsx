import styles from './PairingConfirmDialog.module.css'

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
  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="conn-in-title"
      >
        <p id="conn-in-title" className={styles.visuallyHidden}>
          接続
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
            aria-label="拒否"
          >
            <span className={styles.rejectMark} aria-hidden>×</span>
            <span>拒否</span>
          </button>
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionRowSelected}`}
            onClick={onAccept}
            aria-label="許可"
          >
            <span className={styles.circleMark} aria-hidden />
            <span>許可</span>
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
          <p className={styles.visuallyHidden}>接続</p>
        )}

        <div className={waiting ? `${styles.actions} ${styles.actionsSingle}` : styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} aria-label="キャンセル">
            ×
          </button>
          {connectionFailed ? (
            <button type="button" className={styles.btnPrimary} onClick={onReconnect} aria-label="再接続">
              ↻
            </button>
          ) : !waiting ? (
            <button type="button" className={styles.btnPrimary} onClick={onSendRequest} aria-label="送信">
              →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
