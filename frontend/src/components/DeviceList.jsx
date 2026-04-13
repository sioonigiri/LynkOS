import styles from './DeviceList.module.css'
import { getDeviceEmoji, getDeviceLabel } from '../lib/deviceDisplay'

export default function DeviceList({ devices, selected, onSelect, error }) {
  // サーバー接続エラー
  if (error) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.radar}>
          <div className={styles.radarCore}>
            <span className={styles.radarIcon}>⚠️</span>
          </div>
        </div>
        <p className={styles.emptyText}>接続できませんでした</p>
        <p className={styles.emptyHint}>Wi-Fi や電波を確認してください</p>
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
        <p className={styles.emptyText}>デバイスを検索中...</p>
        <p className={styles.emptyHint}>同じ Wi-Fi に接続された端末が表示されます</p>
      </div>
    )
  }

  return (
    <div className={styles.grid}>
      {devices.map((device, i) => (
        <button
          key={device.deviceId}
          className={`${styles.bubble} ${selected?.deviceId === device.deviceId ? styles.selected : ''}`}
          onClick={() => onSelect(device)}
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <div className={styles.iconWrap}>
            {selected?.deviceId === device.deviceId && (
              <span className={styles.ripple} />
            )}
            <span className={styles.icon}>{getDeviceEmoji(device)}</span>
          </div>
          <span className={styles.name}>{device.name}</span>
          <span className={styles.type}>{getDeviceLabel(device)}</span>
        </button>
      ))}
    </div>
  )
}
