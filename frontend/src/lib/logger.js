/** 本番ではコンソールを汚さない。開発時のみ詳細ログ。 */
const dev = import.meta.env.DEV

export function logError(scope, err) {
  if (dev) console.error(`[LynkOS] ${scope}`, err)
}

export function logWarn(scope, ...args) {
  if (dev) console.warn(`[LynkOS] ${scope}`, ...args)
}

/** 接続失敗は本番でも記録（サポート・調査用） */
export function logConnectionFailure(scope, detail) {
  console.error(`[LynkOS] connection failure: ${scope}`, detail ?? '')
}
