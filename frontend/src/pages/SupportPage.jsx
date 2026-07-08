import { Link } from 'react-router-dom'
import StaticPageLayout from '../components/StaticPageLayout'
import { SUPPORT_EMAIL, supportMailtoHref } from '../lib/contact'
import { PAGE_METADATA, usePageMetadata } from '../lib/usePageMetadata'
import styles from './SupportPage.module.css'

const HOWTO_STEPS = [
  '送信元と送信先の端末を同じWi-Fiネットワークへ接続します。',
  'LynkOSを起動します。',
  '送信したいファイルを選択します。',
  '一覧に表示された送信先を選択すると、ファイルの送信が開始されます。',
]

const FAQ_ITEMS = [
  {
    question: '送信先が表示されません',
    answer: '以下をご確認ください。',
    bullets: [
      '両方の端末が同じWi-Fiネットワークに接続されている',
      '受信側でもLynkOS（またはWeb版）が開かれている',
      'ネットワーク接続が正常である',
    ],
  },
  {
    question: 'どのようなファイルを送信できますか？',
    answer: '写真・動画・PDF・書類など、さまざまなファイルを送受信できます。',
  },
]

export default function SupportPage() {
  usePageMetadata(PAGE_METADATA.support)

  return (
    <StaticPageLayout>
      <article className={styles.article}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>Support</p>
          <h1 className={styles.title}>LynkOS サポート</h1>
          <p className={styles.intro}>
            LynkOSをご利用いただきありがとうございます。同じWi-Fi上の端末間で、写真・動画・書類などを簡単に送受信できるファイル共有アプリです。
          </p>
        </header>

        <section className={styles.block} aria-labelledby="howto-heading">
          <h2 id="howto-heading" className={styles.blockTitle}>
            使い方
          </h2>
          <ol className={styles.steps}>
            {HOWTO_STEPS.map((text, index) => (
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
            よくある質問
          </h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
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
            お問い合わせ
          </h2>
          <p className={styles.contactLead}>
            ご質問、ご要望、不具合の報告は、メールでお送りください。
          </p>
          <a href={supportMailtoHref} className={styles.mailButton}>
            {SUPPORT_EMAIL}
          </a>
          <p className={styles.contactNote}>通常、数営業日以内に返信いたします。</p>
        </section>

        <p className={styles.backRow}>
          <Link to="/app" className={styles.backLink}>
            アプリに戻る
          </Link>
        </p>
      </article>
    </StaticPageLayout>
  )
}
