import { translations } from './translations'

export const LANGUAGE_STORAGE_KEY = 'lynkos-language'

function detectSystemLanguage() {
  try {
    const lang = navigator.language || navigator.userLanguage || ''
    return lang.toLowerCase().startsWith('ja') ? 'ja' : 'en'
  } catch {
    return 'en'
  }
}

/**
 * 現在の表示言語を返す（React コンポーネント外・非同期処理からも呼べる同期ヘルパー）。
 * iosFileSizePolicy.js のような React 外のモジュールから使うためのもの。
 */
export function getCurrentLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'ja' || stored === 'en') return stored
  } catch {
    /* private mode 等 */
  }
  return detectSystemLanguage()
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function interpolate(template, params) {
  if (typeof template !== 'string' || !params) return template
  return Object.keys(params).reduce(
    (acc, key) => acc.replaceAll(`{${key}}`, String(params[key])),
    template
  )
}

/**
 * キーからローカライズ済みの値を取り出す。文字列以外（配列・オブジェクト等、FAQ 項目など）も
 * そのまま返せるようにしている。動的な値は `params` で `{name}` プレースホルダに差し込む。
 */
export function translate(language, key, params) {
  const table = translations[language] ?? translations.en
  const value = getByPath(table, key)
  if (value === undefined) {
    // フォールバック: 英語 → キー自体
    const fallback = getByPath(translations.en, key)
    return fallback === undefined ? key : interpolate(fallback, params)
  }
  return interpolate(value, params)
}
