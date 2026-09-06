import { useState } from 'react'
import { Link } from 'react-router-dom'
import SiteFooter from './components/SiteFooter'
import { useLanguage } from './i18n/useLanguage'
import { PAGE_METADATA, usePageMetadata } from './lib/usePageMetadata'
import styles from './LandingPage.module.css'

/**
 * スクリーンショット: frontend/public/landing/
 * - step-2-3.png … ③の下
 * - step-4.png   … ④の下
 * 文言・alt は translations.js の landing.steps を参照する。
 */
const STEP_IMAGES = {
  3: '/landing/step-2-3.png',
  4: '/landing/step-4.png',
}

function StepScreenshot({ src, alt, loadFailedText }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={styles.stepShot}>
      {failed ? (
        <span className={styles.stepShotPlaceholder}>{loadFailedText}</span>
      ) : (
        <img
          src={src}
          alt={alt}
          className={styles.stepImg}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function StepLine({ n, text }) {
  return (
    <div className={styles.stepMain}>
      <span className={styles.stepNum} aria-hidden>
        {n}
      </span>
      <p className={styles.stepText}>{text}</p>
    </div>
  )
}

export default function LandingPage() {
  usePageMetadata(PAGE_METADATA.landing)
  const { t } = useLanguage()
  const steps = t('landing.steps')

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
        <p className={styles.lead}>{t('landing.lead')}</p>
        <Link to="/app" className={styles.cta}>
          {t('landing.cta')}
        </Link>
        <p className={styles.note}>{t('landing.note')}</p>
      </header>

      <section className={styles.section} aria-labelledby="howto-heading">
        <h2 id="howto-heading" className={styles.sectionTitle}>
          {t('landing.howToTitle')}
        </h2>
        <ol className={styles.steps}>
          {steps.map((step, index) => {
            const n = index + 1
            const imageSrc = STEP_IMAGES[n]
            return (
              <li key={n} className={styles.step}>
                <StepLine n={n} text={step.text} />
                {imageSrc ? (
                  <div className={styles.stepPhotoFrame}>
                    <StepScreenshot
                      src={imageSrc}
                      alt={step.imageAlt}
                      loadFailedText={t('landing.imageLoadFailed')}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      <SiteFooter />
    </div>
  )
}
