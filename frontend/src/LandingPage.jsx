import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  useEffect(() => {
    document.title = 'LynkOS | 近くのデバイスへファイルを送る'
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.mark} aria-hidden>
          <svg width="48" height="48" viewBox="0 0 28 28" fill="none">
            <polygon
              points="14,2 25,8 25,20 14,26 3,20 3,8"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <circle cx="14" cy="14" r="4" fill="currentColor" />
          </svg>
        </div>
        <h1 className={styles.title}>LynkOS</h1>
        <p className={styles.lead}>
          アカウント不要で、同じネットワーク近くのスマホや PC に写真やファイルを送れます。ブラウザだけで動く
          PWA です。
        </p>
        <Link to="/app" className={styles.cta}>
          使ってみる
        </Link>
        <p className={styles.note}>送信・受信には双方でこのアプリを開いてください。</p>
      </header>

      <section className={styles.section} aria-labelledby="features-heading">
        <h2 id="features-heading" className={styles.sectionTitle}>
          できること
        </h2>
        <ul className={styles.list}>
          <li className={styles.item}>
            <span className={styles.bullet} aria-hidden />
            <span>近くのデバイスを一覧し、選んでファイルを送信</span>
          </li>
          <li className={styles.item}>
            <span className={styles.bullet} aria-hidden />
            <span>受信側は確認してから保存（ブラウザや端末の制限に依存します）</span>
          </li>
          <li className={styles.item}>
            <span className={styles.bullet} aria-hidden />
            <span>ホーム画面に追加してアプリのように利用可能</span>
          </li>
        </ul>
      </section>

      <footer className={styles.footer}>
        <p>
          LynkOS — ローカルネットワーク向けの{'\u7C21\u6613'}ファイル送受信
        </p>
      </footer>
    </div>
  )
}
