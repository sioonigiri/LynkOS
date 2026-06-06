import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './LandingPage.module.css'

/**
 * スクリーンショット: frontend/public/landing/
 * - step-2-3.png … ③の下
 * - step-4.png   … ④の下
 */
const STEPS = [
  { n: 1, text: '送信端末・受信端末の両方でこのアプリを開く' },
  { n: 2, text: '送信端末で送信したいファイルを選択' },
  {
    n: 3,
    text: '送信先の端末を選択',
    imageAfter: {
      src: '/landing/step-2-3.png',
      alt: 'ファイルを選択し、送信先を選ぶ画面',
    },
  },
  {
    n: 4,
    text: '受信端末で受信を許可',
    imageAfter: {
      src: '/landing/step-4.png',
      alt: '受信を許可する画面',
    },
  },
  { n: 5, text: '転送開始' },
]

function StepScreenshot({ src, alt }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={styles.stepShot}>
      {failed ? (
        <span className={styles.stepShotPlaceholder}>画像を読み込めませんでした</span>
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
  useEffect(() => {
    document.title = 'LynkOS'
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
          同じネットワークに接続している端末同士で、簡単にファイルを送受信できます。
        </p>
        <Link to="/app" className={styles.cta}>
          使ってみる
        </Link>
        <p className={styles.note}>
          ※送受信を行うには、送信側・受信側の両方でこのアプリを開いておく必要があります。
        </p>
      </header>

      <section className={styles.section} aria-labelledby="howto-heading">
        <h2 id="howto-heading" className={styles.sectionTitle}>
          使い方
        </h2>
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.n} className={styles.step}>
              <StepLine n={step.n} text={step.text} />
              {step.imageAfter ? (
                <div className={styles.stepPhotoFrame}>
                  <StepScreenshot src={step.imageAfter.src} alt={step.imageAfter.alt} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <footer className={styles.footer}>
        <p>LynkOS</p>
      </footer>
    </div>
  )
}
