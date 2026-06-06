import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import styles from './IconCropDialog.module.css'

const VIEW = 200
const MIN_SCALE = 1
const MAX_SCALE = 4

function clampPos(px, py, nw, nh, fit, scale) {
  const W = nw * fit * scale
  const H = nh * fit * scale
  const minX = VIEW / 2 - W / 2
  const maxX = W / 2 - VIEW / 2
  const minY = VIEW / 2 - H / 2
  const maxY = H / 2 - VIEW / 2
  return {
    x: Math.min(maxX, Math.max(minX, px)),
    y: Math.min(maxY, Math.max(minY, py)),
  }
}

/**
 * @param {{
 *   onClose: () => void,
 *   onApply: (dataUrl: string) => void,
 *   initialFile?: File | null,
 * }} props
 */
export default function IconCropDialog({ onClose, onApply, initialFile = null }) {
  const fileInputRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)

  const fit = useMemo(() => {
    const { w: nw, h: nh } = natural
    if (!nw || !nh) return 1
    return Math.max(VIEW / nw, VIEW / nh)
  }, [natural])

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src)
    }
  }, [src])

  useEffect(() => {
    if (!initialFile || !initialFile.type.startsWith('image/')) return undefined
    const url = URL.createObjectURL(initialFile)
    setSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setNatural({ w: 0, h: 0 })
    return undefined
  }, [initialFile])

  const expectingImage = Boolean(initialFile?.type?.startsWith('image/'))

  const resetForImage = useCallback((nw, nh) => {
    const f = Math.max(VIEW / nw, VIEW / nh)
    setScale(1)
    setPosition(clampPos(0, 0, nw, nh, f, 1))
  }, [])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setNatural({ w: 0, h: 0 })
    e.target.value = ''
  }

  const onImgLoad = () => {
    const el = imgRef.current
    if (!el) return
    const nw = el.naturalWidth
    const nh = el.naturalHeight
    if (nw && nh) {
      setNatural({ w: nw, h: nh })
      resetForImage(nw, nh)
    }
  }

  const onPointerDown = (e) => {
    if (!src || !natural.w) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
  }

  const onPointerMove = (e) => {
    if (!dragRef.current || !natural.w) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    dragRef.current = { x: e.clientX, y: e.clientY }
    setPosition((p) =>
      clampPos(p.x + dx, p.y + dy, natural.w, natural.h, fit, scale)
    )
  }

  const onPointerUp = (e) => {
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /*  */
    }
  }

  const onWheel = (e) => {
    if (!natural.w) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setScale((s) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta))
      setPosition((p) => clampPos(p.x, p.y, natural.w, natural.h, fit, next))
      return next
    })
  }

  const handleApply = () => {
    const img = imgRef.current
    if (!img || !natural.w || !src) return
    const canvas = document.createElement('canvas')
    canvas.width = VIEW
    canvas.height = VIEW
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // JPEG は透過を黒で埋めるため、先に背景を塗ってから円でクリップする
    ctx.fillStyle = '#fdf8f0'
    ctx.fillRect(0, 0, VIEW, VIEW)
    ctx.beginPath()
    ctx.arc(VIEW / 2, VIEW / 2, VIEW / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.translate(VIEW / 2 + position.x, VIEW / 2 + position.y)
    ctx.scale(fit * scale, fit * scale)
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    onApply(dataUrl)
    onClose()
  }

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="icon-crop-title"
      >
        <h2 id="icon-crop-title" className={styles.title}>
          アイコンの調整
        </h2>
        <p className={styles.lead}>
          写真を選び、ドラッグで位置を合わせます（ホイールで拡大）
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={handleFile}
        />

        {!src && !expectingImage ? (
          <button
            type="button"
            className={styles.pickPhotoBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            写真を選ぶ
          </button>
        ) : !src && expectingImage ? (
          <p className={styles.loadingText}>読み込み中…</p>
        ) : (
          <>
            <div
              className={[
                styles.viewport,
                dragging ? styles.viewportGrabbing : styles.viewportGrab,
              ].join(' ')}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            >
              <img
                ref={imgRef}
                src={src}
                alt=""
                className={styles.sourceImg}
                onLoad={onImgLoad}
                draggable={false}
                style={{
                  width: natural.w ? natural.w * fit * scale : undefined,
                  height: natural.h ? natural.h * fit * scale : undefined,
                  transform: `translate(${position.x}px, ${position.y}px)`,
                }}
              />
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                キャンセル
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => fileInputRef.current?.click()}
              >
                別の写真
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleApply}
                disabled={!natural.w}
              >
                決定
              </button>
            </div>
          </>
        )}

        {!src && !expectingImage && (
          <button type="button" className={styles.btnSecondaryWide} onClick={onClose}>
            閉じる
          </button>
        )}
      </div>
    </div>
  )
}
