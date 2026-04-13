/**
 * ルーム名（ソート済み deviceId 連結）から、双方で一致する短いセッション ID を生成する。
 * concept.md: 接続時に短いセッションIDを双方に表示し目視照合する。
 */

const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // 0/O/1/I を避ける

export function pairCodeFromRoom(room) {
  if (!room || typeof room !== 'string') return ''
  let h = 2166136261
  for (let i = 0; i < room.length; i++) {
    h ^= room.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let n = h >>> 0
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += ALPH[n % ALPH.length]
    n = Math.imul(n, 31) + i * 17
    n >>>= 0
  }
  return out
}
