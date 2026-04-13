import styles from './ReceiveDialog.module.css'

function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function totalSize(files) {
  return files.reduce((s, f) => s + f.size, 0)
}

export default function ReceiveDialog({ request, onAccept, onReject }) {
  if (!request) return null

  const isMultiple = request.files.length > 1

  return (
    <div className={styles.overlay} onClick={onReject}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>

        {/* 送信元アイコン */}
        <div className={styles.senderBubble}>
          <span className={styles.senderIcon}>
            {request.senderType === 'desktop' ? '🖥' : '📱'}
          </span>
        </div>

        {/* タイトル */}
        <h2 className={styles.title}>ファイルを受け取りますか？</h2>
        <p className={styles.senderName}>
          <strong>{request.senderName}</strong> から
        </p>

        {request.inboundQueuedBehind > 0 && (
          <p className={styles.queueHint} role="status">
            ほか {request.inboundQueuedBehind} 件の受信リクエストが順番待ちです（同時受信しません）。
          </p>
        )}

        {/* ファイル一覧 */}
        <div className={styles.fileListWrap}>
          <ul className={styles.fileList}>
            {request.files.map((f, i) => (
              <li key={i} className={styles.fileItem}>
                <span className={styles.fileItemIcon}>📄</span>
                <span className={styles.fileItemName}>{f.name}</span>
                <span className={styles.fileItemSize}>{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
          {isMultiple && (
            <p className={styles.totalSize}>
              合計 {request.files.length} 件・{formatBytes(totalSize(request.files))}
            </p>
          )}
        </div>

        {/* アクション */}
        <div className={styles.actions}>
          <button className={styles.btnReject} onClick={onReject}>
            断る
          </button>
          <button className={styles.btnAccept} onClick={onAccept}>
            受け取る
          </button>
        </div>

      </div>
    </div>
  )
}
