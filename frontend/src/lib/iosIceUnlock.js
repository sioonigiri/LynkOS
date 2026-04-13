/**
 * WebKit（特に iOS Safari）は、権限取得前にローカル ICE（host）を出さないことがある。
 * デバイス選択のタップ直後に呼び、ユーザー操作コンテキストを保ったまま試す。
 */
let unlocked = false

export function isAppleTouchWebKit() {
  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export async function ensureIosWebRtcIceUnlocked() {
  if (unlocked || !isAppleTouchWebKit()) return
  if (!navigator.mediaDevices?.getUserMedia) return
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })
    s.getTracks().forEach((t) => t.stop())
    unlocked = true
  } catch {
    /* 拒否時も TURN のみで続行 */
  }
}
