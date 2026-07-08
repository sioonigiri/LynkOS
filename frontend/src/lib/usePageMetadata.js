import { useEffect } from 'react'

/**
 * Vite + React Router 向けのページ metadata（title / description）。
 * @param {{ title: string, description: string }} metadata
 */
export function usePageMetadata({ title, description }) {
  useEffect(() => {
    document.title = title

    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)
  }, [title, description])
}

/** ルートごとの SEO metadata 定義 */
export const PAGE_METADATA = {
  landing: {
    title: 'LynkOS',
    description:
      '同じネットワーク上の端末同士で、写真・動画・書類などを簡単に送受信できるファイル共有アプリ。',
  },
  support: {
    title: 'LynkOS サポート',
    description:
      'LynkOS の使い方、よくある質問、お問い合わせ先。同じ Wi-Fi 上の端末間でファイルを送受信するアプリのサポートページです。',
  },
  privacy: {
    title: 'プライバシーポリシー',
    description:
      'LynkOS のプライバシーポリシー。取得する情報、利用目的、第三者提供、セキュリティについて。',
  },
}
