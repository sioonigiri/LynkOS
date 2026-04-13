import { useState } from 'react'
import { getDeviceEmoji, getDeviceLabel } from '../lib/deviceDisplay'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel({ myDevice, onClose, onSave }) {
  const [name, setName] = useState(myDevice?.name ?? '')

  const handleSave = () => {
    if (!name.trim()) return
    localStorage.setItem('lynkos-device-name', name.trim())
    onSave(name.trim())
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>

        {/* ハンドル */}
        <div className={styles.handle} />

        <div className={styles.body}>
          {/* ヘッダー */}
          <div className={styles.header}>
            <h2 className={styles.title}>設定</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">
              <span>✕</span>
            </button>
          </div>

          {/* デバイスプレビュー */}
          <div className={styles.devicePreview}>
            <div className={styles.previewBubble}>
              <span className={styles.previewIcon}>
                {getDeviceEmoji(myDevice)}
              </span>
            </div>
            <span className={styles.previewName}>{name || 'デバイス名'}</span>
            <span className={styles.previewType}>
              {getDeviceLabel(myDevice)}
            </span>
          </div>

          {/* フォーム */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="deviceName">
              デバイス名
            </label>
            <input
              id="deviceName"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="例: My PC, iPhone 15..."
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <p className={styles.hint}>近くのデバイスにこの名前が表示されます</p>
          </div>

          {/* 保存ボタン */}
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  )
}
