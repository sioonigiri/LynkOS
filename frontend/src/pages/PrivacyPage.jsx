import StaticPageLayout from '../components/StaticPageLayout'
import { SUPPORT_EMAIL, supportMailtoHref } from '../lib/contact'
import { PAGE_METADATA, usePageMetadata } from '../lib/usePageMetadata'
import styles from './StaticPage.module.css'

export default function PrivacyPage() {
  usePageMetadata(PAGE_METADATA.privacy)

  return (
    <StaticPageLayout>
      <article className={styles.article}>
        <h1 className={styles.title}>プライバシーポリシー</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>プライバシーポリシー</h2>
          <p className={styles.bodyText}>
            LynkOS（以下「本アプリ」）は、利用者のプライバシーを尊重し、個人情報の適切な保護に努めます。
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. 取得する情報</h2>
          <p className={styles.bodyText}>
            本アプリは、ファイル転送機能を提供するために必要な範囲で端末情報やネットワーク情報を利用します。
          </p>
          <p className={styles.bodyText}>
            送信されるファイルは転送処理のためだけに利用されます。
          </p>
          <p className={styles.bodyText}>
            本アプリは、送信されたファイルの内容を収集・保存・販売することはありません。
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. 利用目的</h2>
          <p className={styles.bodyText}>取得した情報は、以下の目的で利用します。</p>
          <ul className={styles.list}>
            <li>ファイル転送機能の提供</li>
            <li>接続先端末の検出</li>
            <li>通信の確立</li>
            <li>アプリ品質の改善</li>
            <li>不具合の調査およびサポート対応</li>
          </ul>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. 第三者への提供</h2>
          <p className={styles.bodyText}>
            法令に基づく場合を除き、取得した情報を第三者へ提供することはありません。
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. セキュリティ</h2>
          <p className={styles.bodyText}>
            利用者情報を適切に管理し、不正アクセスや情報漏えいの防止に努めます。
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. お問い合わせ</h2>
          <p className={styles.bodyText}>
            プライバシーに関するお問い合わせは、以下のメールアドレスまでお願いいたします。
          </p>
          <p className={styles.bodyText}>
            <a href={supportMailtoHref} className={styles.mailLink}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. 改定</h2>
          <p className={styles.bodyText}>
            本ポリシーは、必要に応じて内容を変更する場合があります。
          </p>
        </section>
      </article>
    </StaticPageLayout>
  )
}
