/**
 * WebRTC ICE: 既定 STUN + 環境変数 VITE_ICE_SERVERS_JSON で追加（TURN 等）
 *
 * VITE_ICE_SERVERS_JSON: RTCPeerConnection 形式の JSON 配列（既定 STUN に連結）
 * 例: [{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
 */

const DEFAULT_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

function iceServersFromEnv() {
  const raw = import.meta.env.VITE_ICE_SERVERS_JSON
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

/**
 * @returns {RTCIceServer[]}
 */
export function getIceServers() {
  const extra = iceServersFromEnv()
  return [...DEFAULT_STUN, ...extra]
}
