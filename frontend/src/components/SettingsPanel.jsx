import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getDeviceIconVisual, getDeviceEmoji, MAX_DEVICE_ICON_CHARS } from '../lib/deviceDisplay'
import { useLanguage } from '../i18n/useLanguage'
import IconCropDialog from './IconCropDialog'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel({ myDevice, onClose, onSave }) {
  const { t } = useLanguage()
  const [name, setName] = useState(myDevice?.name ?? '')
  const [icon, setIcon] = useState(() => {
    try {
      return localStorage.getItem('lynkos-device-icon') ?? ''
    } catch {
      return ''
    }
  })
  const [cropOpen, setCropOpen] = useState(false)
  const [cropInitialFile, setCropInitialFile] = useState(null)
  const iconFileInputRef = useRef(null)

  const isCustomPhoto = icon.trim().startsWith('data:image/')

  const previewDevice = myDevice
    ? {
        ...myDevice,
        name: name.trim() || myDevice.name,
        ...(isCustomPhoto ? { icon: icon.trim() } : {}),
      }
    : null
  const previewVis = getDeviceIconVisual(previewDevice)

  const handleSelectIcon = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    setCropInitialFile(file)
    setCropOpen(true)
  }

  const handleSave = () => {
    if (!name.trim()) return
    const iconValue = icon.trim()
    try {
      if (iconValue) {
        if (iconValue.startsWith('data:') && iconValue.length > 2_800_000) {
          window.alert(t('settingsPanel.iconTooLarge'))
          return
        }
        if (iconValue.startsWith('data:') && iconValue.length > MAX_DEVICE_ICON_CHARS) {
          window.alert(
            t('settingsPanel.iconLimit', { k: Math.round(MAX_DEVICE_ICON_CHARS / 1000) })
          )
          return
        }
        localStorage.setItem('lynkos-device-icon', iconValue)
      } else {
        localStorage.removeItem('lynkos-device-icon')
      }
    } catch {
      /*  */
    }
    localStorage.setItem('lynkos-device-name', name.trim())
    onSave(name.trim())
    onClose()
  }

  const closeCrop = () => {
    setCropOpen(false)
    setCropInitialFile(null)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>

        <div className={styles.handle} />

        <div className={styles.body}>
          <div className={styles.header}>
            <h2 className={styles.title}>{t('settingsPanel.title')}</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label={t('settingsPanel.closeAria')}>
              <span>✕</span>
            </button>
          </div>

          <div className={styles.devicePreview}>
            <div
              className={[
                styles.previewBubble,
                isCustomPhoto ? styles.previewBubblePhoto : '',
              ].filter(Boolean).join(' ')}
            >
              {previewVis.kind === 'url' ? (
                <img src={previewVis.href} alt="" className={styles.previewIconImg} />
              ) : (
                <span className={styles.previewIcon} aria-hidden>
                  {getDeviceEmoji(myDevice)}
                </span>
              )}
            </div>
            <span className={styles.previewName}>{name.trim() || t('settingsPanel.namePlaceholderFallback')}</span>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{t('settingsPanel.icon')}</span>
            <input
              ref={iconFileInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenFileInput}
              onChange={handleSelectIcon}
            />
            <button
              type="button"
              className={styles.pickPhotoBtn}
              onClick={() => iconFileInputRef.current?.click()}
            >
              {t('settingsPanel.photo')}
            </button>
            {isCustomPhoto && (
              <button
                type="button"
                className={styles.clearIconBtn}
                onClick={() => setIcon('')}
                aria-label={t('settingsPanel.removeIconAria')}
              >
                {t('settingsPanel.remove')}
              </button>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="deviceName">
              {t('settingsPanel.name')}
            </label>
            <input
              id="deviceName"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder=""
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {t('settingsPanel.save')}
          </button>

          <Link to="/" className={styles.landingLinkBtn} onClick={onClose}>
            {t('settingsPanel.backToLanding')}
          </Link>
        </div>
      </div>

      {cropOpen && (
        <IconCropDialog
          key={cropInitialFile ? `${cropInitialFile.name}-${cropInitialFile.lastModified}` : 'crop'}
          initialFile={cropInitialFile}
          onClose={closeCrop}
          onApply={(dataUrl) => {
            setIcon(dataUrl)
            closeCrop()
          }}
        />
      )}
    </div>
  )
}
