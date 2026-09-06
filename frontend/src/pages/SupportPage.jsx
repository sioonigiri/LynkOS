import { Link } from 'react-router-dom'
import StaticPageLayout from '../components/StaticPageLayout'
import { useLanguage } from '../i18n/useLanguage'
import { SUPPORT_EMAIL, supportMailtoHref } from '../lib/contact'
import { PAGE_METADATA, usePageMetadata } from '../lib/usePageMetadata'
import styles from './SupportPage.module.css'

export default function SupportPage() {
  usePageMetadata(PAGE_METADATA.support)
  const { t } = useLanguage()
  const howToSteps = t('support.howToSteps')
  const faqItems = t('support.faqItems')

  return (
    <StaticPageLayout>
      <article className={styles.article}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>{t('support.eyebrow')}</p>
          <h1 className={styles.title}>{t('support.title')}</h1>
          <p className={styles.intro}>{t('support.intro')}</p>
        </header>

        <section className={styles.block} aria-labelledby="howto-heading">
          <h2 id="howto-heading" className={styles.blockTitle}>
            {t('support.howToTitle')}
          </h2>
          <ol className={styles.steps}>
            {howToSteps.map((text, index) => (
              <li key={text} className={styles.step}>
                <span className={styles.stepNum} aria-hidden>
                  {index + 1}
                </span>
                <p className={styles.stepText}>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.block} aria-labelledby="faq-heading">
          <h2 id="faq-heading" className={styles.blockTitle}>
            {t('support.faqTitle')}
          </h2>
          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <div key={item.question} className={styles.faqItem}>
                <h3 className={styles.faqQuestion}>
                  <span className={styles.faqMark} aria-hidden>
                    Q
                  </span>
                  {item.question}
                </h3>
                <div className={styles.faqAnswer}>
                  <p className={styles.faqAnswerText}>{item.answer}</p>
                  {item.bullets ? (
                    <ul className={styles.faqBullets}>
                      {item.bullets.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.contactBlock} aria-labelledby="contact-heading">
          <h2 id="contact-heading" className={styles.blockTitle}>
            {t('support.contactTitle')}
          </h2>
          <p className={styles.contactLead}>{t('support.contactLead')}</p>
          <a href={supportMailtoHref} className={styles.mailButton}>
            {SUPPORT_EMAIL}
          </a>
          <p className={styles.contactNote}>{t('support.contactNote')}</p>
        </section>

        <p className={styles.backRow}>
          <Link to="/app" className={styles.backLink}>
            {t('support.backToApp')}
          </Link>
        </p>
      </article>
    </StaticPageLayout>
  )
}
