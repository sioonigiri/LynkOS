import { useLanguage } from '../i18n/useLanguage'
import styles from './LanguageToggle.module.css'

/** シンプルな JP / EN 切り替えトグル。選択中の言語をハイライトする。 */
export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div className={styles.toggle} role="group" aria-label="Language / 言語">
      <button
        type="button"
        className={`${styles.option} ${language === 'ja' ? styles.active : ''}`}
        onClick={() => setLanguage('ja')}
        aria-pressed={language === 'ja'}
        aria-label={t('language.switchToJapanese')}
      >
        JP
      </button>
      <button
        type="button"
        className={`${styles.option} ${language === 'en' ? styles.active : ''}`}
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        aria-label={t('language.switchToEnglish')}
      >
        EN
      </button>
    </div>
  )
}
