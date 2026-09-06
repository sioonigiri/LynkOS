import StaticPageLayout from '../components/StaticPageLayout'
import { useLanguage } from '../i18n/useLanguage'
import { SUPPORT_EMAIL, supportMailtoHref } from '../lib/contact'
import { PAGE_METADATA, usePageMetadata } from '../lib/usePageMetadata'
import styles from './StaticPage.module.css'

export default function PrivacyPage() {
  usePageMetadata(PAGE_METADATA.privacy)
  const { t } = useLanguage()
  const section1Body = t('privacy.section1Body')
  const section2List = t('privacy.section2List')

  return (
    <StaticPageLayout>
      <article className={styles.article}>
        <h1 className={styles.title}>{t('privacy.title')}</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.title')}</h2>
          <p className={styles.bodyText}>{t('privacy.intro')}</p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.section1Title')}</h2>
          {section1Body.map((line) => (
            <p key={line} className={styles.bodyText}>{line}</p>
          ))}
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.section2Title')}</h2>
          <p className={styles.bodyText}>{t('privacy.section2Lead')}</p>
          <ul className={styles.list}>
            {section2List.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.section3Title')}</h2>
          <p className={styles.bodyText}>{t('privacy.section3Body')}</p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.section4Title')}</h2>
          <p className={styles.bodyText}>{t('privacy.section4Body')}</p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.section5Title')}</h2>
          <p className={styles.bodyText}>{t('privacy.section5Body')}</p>
          <p className={styles.bodyText}>
            <a href={supportMailtoHref} className={styles.mailLink}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.section6Title')}</h2>
          <p className={styles.bodyText}>{t('privacy.section6Body')}</p>
        </section>
      </article>
    </StaticPageLayout>
  )
}
