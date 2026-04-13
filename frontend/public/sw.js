// LynkOS PWA — インストール要件用の最小 SW（常にネットワーク。キャッシュで転送を壊さない）

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
