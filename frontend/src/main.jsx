import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import LandingPage from './LandingPage.jsx'
import {
  applyLongAbsenceResetIfNeeded,
  clearLynkOsCaches,
  recordSessionEnd,
} from './lib/sessionBoundary'

const { didReset } = applyLongAbsenceResetIfNeeded()
if (didReset && 'caches' in window) {
  clearLynkOsCaches().catch(() => {})
}

window.addEventListener('pagehide', () => {
  recordSessionEnd()
})

// PWA: 本番のみ登録（Chrome のインストール条件。中身はネットワーク直結のまま）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
