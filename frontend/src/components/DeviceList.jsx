import styles from './DeviceList.module.css'
import { getDeviceIconVisual } from '../lib/deviceDisplay'

function DeviceBubbleIcon({ device }) {
  const v = getDeviceIconVisual(device)
  if (v.kind === 'url') {
    return <img src={v.href} alt="" className={styles.iconImg} />
  }
  return <span className={styles.icon}>{v.text}</span>
}

export default function DeviceList({
  devices,
  onSelect,
  error,
  disabled = false,
  flashDeviceId = null,
}) {
  // サーバー接続エラー
  if (error) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.radar}>
          <div className={styles.radarCore}>
            <span className={styles.radarIcon}>⚠️</span>
          </div>
        </div>
        <p className={styles.emptyText}>オフライン</p>
      </div>
    )
  }

  // デバイスなし（検索中）
  if (devices.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.radar}>
          <div className={styles.radarRing} style={{ animationDelay: '0s' }} />
          <div className={styles.radarRing} style={{ animationDelay: '0.8s' }} />
          <div className={styles.radarRing} style={{ animationDelay: '1.6s' }} />
          <div className={styles.radarCore}>
            <span className={styles.radarIcon}>📡</span>
          </div>
        </div>
        <p className={styles.emptyText}>検索中</p>
      </div>
    )
  }

  return (
    <div
      className={`${styles.grid} ${disabled ? styles.gridDisabled : ''}`}
      aria-busy={disabled || undefined}
    >
      {devices.map((device, i) => {
        const vis = getDeviceIconVisual(device)
        const isPhotoIcon = vis.kind === 'url'
        return (
          <button
            key={device.deviceId}
            type="button"
            className={`${styles.bubble} ${
              flashDeviceId === device.deviceId ? styles.flash : ''
            }`}
            onClick={() => !disabled && onSelect(device)}
            disabled={disabled}
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <div
              className={`${styles.iconWrap} ${isPhotoIcon ? styles.iconWrapPhoto : ''}`}
            >
              <DeviceBubbleIcon device={device} />
            </div>
            <span className={styles.name}>{device.name}</span>
          </button>
        )
      })}
    </div>
  )
}
