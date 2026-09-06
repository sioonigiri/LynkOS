import { useEffect } from 'react'
import { useLanguage } from '../i18n/useLanguage'

/**
 * Vite + React Router 向けのページ metadata（title / description）。
 * 言語切り替え時にも再適用されるよう、`useLanguage()` の `language` を依存に含める。
 * @param {{ titleKey: string, descriptionKey: string }} metadata
 */
export function usePageMetadata({ titleKey, descriptionKey }) {
  const { language, t } = useLanguage()

  useEffect(() => {
    document.title = t(titleKey)

    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', t(descriptionKey))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, titleKey, descriptionKey])
}

/** ルートごとの SEO metadata 定義（キーは translations.js の metadata.* を参照） */
export const PAGE_METADATA = {
  landing: { titleKey: 'metadata.landingTitle', descriptionKey: 'metadata.landingDescription' },
  support: { titleKey: 'metadata.supportTitle', descriptionKey: 'metadata.supportDescription' },
  privacy: { titleKey: 'metadata.privacyTitle', descriptionKey: 'metadata.privacyDescription' },
}
