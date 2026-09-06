import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage'
import LanguageToggle from './LanguageToggle'
import styles from './SiteFooter.module.css'

export default function SiteFooter() {
  const { t } = useLanguage()

  return (
    <footer className={styles.footer}>
      <nav className={styles.nav} aria-label={t('nav.footerAria')}>
        <Link to="/support" className={styles.link}>
          {t('footer.support')}
        </Link>
        <span className={styles.sep} aria-hidden>
          ·
        </span>
        <Link to="/privacy" className={styles.link}>
          {t('footer.privacy')}
        </Link>
      </nav>
      <div className={styles.langRow}>
        <LanguageToggle />
      </div>
      <p className={styles.copy}>LynkOS</p>
    </footer>
  )
}
