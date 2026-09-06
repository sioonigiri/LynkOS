import { useCallback, useMemo, useState } from 'react'
import { LanguageContext } from './context'
import { getCurrentLanguage, translate, LANGUAGE_STORAGE_KEY } from './core'

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => getCurrentLanguage())

  const setLanguage = useCallback((lang) => {
    if (lang !== 'ja' && lang !== 'en') return
    setLanguageState(lang)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {
      /* private mode 等 */
    }
  }, [])

  const t = useCallback((key, params) => translate(language, key, params), [language])

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
