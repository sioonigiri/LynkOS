import { useRef, useState, useEffect } from 'react'
import {
  isAppleTouchDevice,
  MB,
  IOS_SEND_NOTICE_TITLE,
  iosSendNoticeBody,
  iosSendConfirm300Body,
  IOS_SEND_STRONG_ALERT,
  iosSendStrongConfirmBody,
  formatMb,
} from '../lib/iosFileSizePolicy'
import styles from './SendPanel.module.css'

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

const NOTICE_DISMISS_MS = 9000

export default function SendPanel({ onSend, disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  /** 100MB〜299MB: 非ブロック注意バナー */
  const [iosNoticeMb, setIosNoticeMb] = useState(null)

  useEffect(() => {
    if (iosNoticeMb == null) return
    const t = window.setTimeout(() => setIosNoticeMb(null), NOTICE_DISMISS_MS)
    return () => clearTimeout(t)
  }, [iosNoticeMb])

  const handleFiles = (files) => {
    if (files.length === 0) return
    const list = Array.from(files)

    if (!isAppleTouchDevice()) {
      onSend(list)
      return
    }

    const maxSize = Math.max(...list.map((f) => f.size))
    const mb = formatMb(maxSize)

    if (maxSize >= 500 * MB) {
      window.alert(IOS_SEND_STRONG_ALERT)
      if (!window.confirm(iosSendStrongConfirmBody(mb))) return
      onSend(list)
      return
    }

    if (maxSize >= 300 * MB) {
      if (!window.confirm(iosSendConfirm300Body(mb))) return
      onSend(list)
      return
    }

    if (maxSize >= 100 * MB) {
      setIosNoticeMb(Number(mb))
    }

    onSend(list)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className={styles.outer}>
      {iosNoticeMb != null && (
        <div className={styles.iosNotice} role="status">
          <div className={styles.iosNoticeHead}>
            <span className={styles.iosNoticeTitle}>{IOS_SEND_NOTICE_TITLE}</span>
            <button
              type="button"
              className={styles.iosNoticeClose}
              onClick={() => setIosNoticeMb(null)}
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
          <p className={styles.iosNoticeText}>{iosSendNoticeBody(iosNoticeMb)}</p>
        </div>
      )}

      <div
        className={[
          styles.panel,
          dragging ? styles.dragging : '',
          disabled ? styles.disabled : '',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => !disabled && e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className={styles.hidden}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />

        <div className={styles.iconArea}>
          {disabled ? (
            <span className={styles.spinnerIcon}>⏳</span>
          ) : dragging ? (
            <span className={styles.dropIcon}>📂</span>
          ) : (
            <span className={styles.dropIcon}>📤</span>
          )}
        </div>

        <p className={styles.mainText}>
          {disabled
            ? '接続を確立中...'
            : dragging
              ? 'ここにドロップ'
              : 'タップしてファイルを選択'}
        </p>

        {!disabled && !dragging && !isMobile && (
          <p className={styles.subText}>または、ファイルをここにドラッグ</p>
        )}
      </div>
    </div>
  )
}
