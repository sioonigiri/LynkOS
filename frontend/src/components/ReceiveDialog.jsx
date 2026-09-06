import styles from './ReceiveDialog.module.css'
import { getDeviceIconVisual, fileEntryVisual } from '../lib/deviceDisplay'
import { useLanguage } from '../i18n/useLanguage'

function senderDeviceFromRequest(request) {
  const t = request.senderType === 'mobile' ? 'mobile' : 'desktop'
  return {
    type: t,
    platform: '',
    icon: request.senderIcon ?? request.device?.icon,
  }
}

export default function ReceiveDialog({ request, onAccept, onReject }) {
  const { t } = useLanguage()
  if (!request) return null

  const isMultiple = request.files.length > 1
  const senderVis = getDeviceIconVisual(senderDeviceFromRequest(request))

  return (
    <div className={styles.overlay} onClick={onReject}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('receiveDialog.dialogAria')}>

        <div className={styles.senderBubble}>
          {senderVis.kind === 'url' ? (
            <img src={senderVis.href} alt="" className={styles.senderIconImg} />
          ) : (
            <span className={styles.senderIcon}>{senderVis.text}</span>
          )}
        </div>

        <p className={styles.senderNameOnly}>{request.senderName}</p>

        {request.inboundQueuedBehind > 0 && (
          <p
            className={styles.queueHint}
            role="status"
            aria-label={t('receiveDialog.pendingCountAria', { n: request.inboundQueuedBehind })}
          >
            +{request.inboundQueuedBehind}
          </p>
        )}

        <div className={styles.fileListWrap}>
          <ul className={styles.fileList}>
            {request.files.map((f, i) => {
              const fv = fileEntryVisual(f.name, f.type)
              return (
                <li key={i} className={styles.fileItem}>
                  <span className={styles.fileItemIcon} aria-hidden>
                    {fv.isImage ? '🖼' : fv.icon}
                  </span>
                  <span className={styles.fileItemName}>{f.name}</span>
                </li>
              )
            })}
          </ul>
          {isMultiple && (
            <p className={styles.fileCountFoot} aria-hidden>
              {request.files.length}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionRowNeutral}`}
            onClick={onReject}
            aria-label={t('receiveDialog.denyAria')}
          >
            <span className={styles.rejectMark} aria-hidden>×</span>
            <span>{t('receiveDialog.deny')}</span>
          </button>
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionRowSelected}`}
            onClick={onAccept}
            aria-label={t('receiveDialog.allowAria')}
          >
            <span className={styles.circleMark} aria-hidden />
            <span>{t('receiveDialog.allow')}</span>
          </button>
        </div>

      </div>
    </div>
  )
}
