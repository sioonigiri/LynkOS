import styles from './PairingConfirmDialog.module.css'

/**
 * AirDrop 風の最小 UI: 相手名・セッション ID・接続する / キャンセル
 */
export default function PairingConfirmDialog({
  peerName,
  pairCode,
  pairingConfirmed,
  connectionFailed,
  onConnect,
  onCancel,
  onReconnect,
}) {
  const waitingAfterConnect = pairingConfirmed && !connectionFailed

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="pair-peer"
        aria-describedby="pair-code"
      >
        <p id="pair-peer" className={styles.peerName}>
          {peerName}
        </p>
        <p id="pair-code" className={styles.code} aria-live="polite">
          {pairCode || '…'}
        </p>

        {waitingAfterConnect && (
          <p className={styles.subtle}>接続を確立しています</p>
        )}

        <div
          className={
            waitingAfterConnect ? `${styles.actions} ${styles.actionsSingle}` : styles.actions
          }
        >
          <button type="button" className={styles.btnSecondary} onClick={onCancel}>
            キャンセル
          </button>
          {connectionFailed ? (
            <button type="button" className={styles.btnPrimary} onClick={onReconnect}>
              接続する
            </button>
          ) : !pairingConfirmed ? (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onConnect}
              disabled={!pairCode}
            >
              接続する
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
