import { Link } from 'react-router-dom'
import styles from './SiteFooter.module.css'

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.nav} aria-label="フッター">
        <Link to="/support" className={styles.link}>
          サポート
        </Link>
        <span className={styles.sep} aria-hidden>
          ·
        </span>
        <Link to="/privacy" className={styles.link}>
          プライバシーポリシー
        </Link>
      </nav>
      <p className={styles.copy}>LynkOS</p>
    </footer>
  )
}
