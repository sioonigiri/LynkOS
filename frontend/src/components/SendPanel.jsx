import { useRef, useState, useEffect, useMemo } from 'react'
import {
  isAppleTouchDevice,
  MB,
  IOS_SEND_NOTICE_TITLE,
  iosSendNoticeBody,
  iosSendConfirm300Body,
  formatMb,
} from '../lib/iosFileSizePolicy'
import { fileEntryVisual } from '../lib/deviceDisplay'
import styles from './SendPanel.module.css'

const NOTICE_DISMISS_MS = 9000

const FILE_INPUT_ID = 'lynkos-file-input'

/**
 * @param {object} props
 * @param {(file: File) => void} props.onFileChosen
 * @param {File | null} [props.previewFile]
 * @param {boolean} props.disabled
 * @param {boolean} [props.allowPick=true]
 */
export default function SendPanel({ onFileChosen, disabled, allowPick = true, previewFile = null }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [iosNoticeMb, setIosNoticeMb] = useState(null)

  useEffect(() => {
    if (iosNoticeMb == null) return
    const t = window.setTimeout(() => setIosNoticeMb(null), NOTICE_DISMISS_MS)
    return () => clearTimeout(t)
  }, [iosNoticeMb])

  const previewUrl = useMemo(() => {
    if (!previewFile || !previewFile.type.startsWith('image/')) return null
    return URL.createObjectURL(previewFile)
  }, [previewFile])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const combinedDisabled = disabled || !allowPick
  const hasPreview = Boolean(previewFile)
  const isImage = Boolean(previewFile?.type.startsWith('image/'))

  const fileViz = previewFile ? fileEntryVisual(previewFile.name, previewFile.type) : null

  const runChoose = (file) => {
    if (!file) return

    if (!isAppleTouchDevice()) {
      onFileChosen(file)
      return
    }

    const mb = formatMb(file.size)

    if (file.size >= 300 * MB) {
      if (!window.confirm(iosSendConfirm300Body(mb))) return
      onFileChosen(file)
      return
    }

    if (file.size >= 100 * MB) {
      setIosNoticeMb(Number(mb))
    }

    onFileChosen(file)
  }

  const handleFiles = (fileList) => {
    const file = fileList?.[0]
    runChoose(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (combinedDisabled) return
    handleFiles(e.dataTransfer.files)
  }

  const waitLabel =
    combinedDisabled && allowPick ? '待機' : !allowPick ? '待機' : null

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

      <label
        className={[
          styles.panel,
          hasPreview ? styles.panelFilled : '',
          dragging ? styles.dragging : '',
          combinedDisabled ? styles.disabled : '',
        ].join(' ')}
        htmlFor={combinedDisabled ? undefined : FILE_INPUT_ID}
        tabIndex={combinedDisabled ? -1 : 0}
        onDragOver={(e) => {
          e.preventDefault()
          if (!combinedDisabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onKeyDown={(e) => {
          if (combinedDisabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <input
          ref={inputRef}
          id={FILE_INPUT_ID}
          type="file"
          className={styles.visuallyHidden}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
          disabled={combinedDisabled}
          tabIndex={-1}
        />

        {waitLabel && (
          <div className={styles.centerStack}>
            <span className={styles.spinnerIcon}>⏳</span>
            <p className={styles.waitText}>{waitLabel}</p>
          </div>
        )}

        {!waitLabel && !hasPreview && (
          <div className={styles.placeholder}>画像・ファイルを選択</div>
        )}

        {!waitLabel && hasPreview && isImage && previewUrl && (
          <div className={styles.previewContainer}>
            <img src={previewUrl} alt="" className={styles.previewImage} />
            {dragging && <div className={styles.dragOverlay} aria-hidden />}
          </div>
        )}

        {!waitLabel && hasPreview && !isImage && previewFile && (
          <div className={styles.previewContainer}>
            <div className={styles.filePreview}>
              <span className={styles.fileIcon} aria-hidden>
                {fileViz?.icon ?? '📄'}
              </span>
              <span className={styles.fileName}>{previewFile.name}</span>
            </div>
            {dragging && <div className={styles.dragOverlay} aria-hidden />}
          </div>
        )}
      </label>
    </div>
  )
}
