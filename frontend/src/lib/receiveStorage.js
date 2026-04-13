/**
 * 大容量受信時は RAM に溜めず IndexedDB / ファイルへ逐次書き込みする。
 */

const DB_NAME = 'lynkos-receive'
const DB_VER = 1
const STORE = 'chunks'

/** これより大きいファイルは RAM に全チャンク保持しない */
export const INLINE_RECEIVE_MAX = 48 * 1024 * 1024

let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
    })
  }
  return dbPromise
}

function chunkKey(transferId, seq) {
  return `${transferId}#${seq.toString(36).padStart(8, '0')}`
}

export async function rxAppendChunk(transferId, seq, buffer) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(buffer, chunkKey(transferId, seq))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function rxReadChunk(transferId, seq) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const r = tx.objectStore(STORE).get(chunkKey(transferId, seq))
    r.onsuccess = () => resolve(r.result ?? null)
    r.onerror = () => reject(r.error)
  })
}

/**
 * IndexedDB のチャンクを結合して Blob を作る（主に小容量・保存 UI 用）。
 * 受信パス本体ではチャンクを RAM に溜めず IDB へ逐次保存している。
 */
export async function rxAssembleBlob(transferId, chunkCount, onProgress) {
  const parts = []
  for (let i = 0; i < chunkCount; i++) {
    const buf = await rxReadChunk(transferId, i)
    if (buf) parts.push(buf)
    onProgress?.(i + 1, chunkCount)
  }
  return new Blob(parts)
}

/** 保存ダイアログで選んだファイルへストリーム書き込み（巨大 Blob を RAM に作らない） */
export async function rxStreamToWritable(transferId, chunkCount, writable) {
  for (let i = 0; i < chunkCount; i++) {
    const buf = await rxReadChunk(transferId, i)
    if (buf) await writable.write(new Uint8Array(buf))
  }
  await writable.close()
}

export async function rxDeleteTransfer(transferId) {
  const db = await openDb()
  const keys = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const r = tx.objectStore(STORE).getAllKeys()
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  const prefix = `${transferId}#`
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith(prefix)) st.delete(k)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 30 分以上前の受信データを IDB から削除 */
export async function rxDeleteExpiredInDb(validTransferIds) {
  const valid = new Set(validTransferIds.filter(Boolean))
  const db = await openDb()
  const keys = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const r = tx.objectStore(STORE).getAllKeys()
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  const prefixes = new Set()
  for (const k of keys) {
    if (typeof k !== 'string' || !k.includes('#')) continue
    const tid = k.slice(0, k.indexOf('#'))
    if (!valid.has(tid)) prefixes.add(tid)
  }
  await Promise.all([...prefixes].map((tid) => rxDeleteTransfer(tid)))
}
