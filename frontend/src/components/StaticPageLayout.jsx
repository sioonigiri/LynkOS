import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage'
import SiteFooter from './SiteFooter'
import styles from './StaticPageLayout.module.css'

function LynkOSMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <polygon
        points="14,2 25,8 25,20 14,26 3,20 3,8"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="14" cy="14" r="4" fill="currentColor" />
    </svg>
  )
}

export default function StaticPageLayout({ children }) {
  const { t } = useLanguage()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label={t('nav.staticTopAria')}>
          <span className={styles.logoIcon}>
            <LynkOSMark />
          </span>
          <span className={styles.logoText}>LynkOS</span>
        </Link>
      </header>

      <main className={styles.main}>{children}</main>

      <SiteFooter />
    </div>
  )
}
