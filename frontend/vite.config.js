import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function httpToWsOrigin(httpUrl) {
  try {
    const u = new URL(httpUrl)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return u.origin
  } catch {
    return ''
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // .env 未設定・load 失敗時でも開発が動くよう既定を使う（Safari 等で /api が 5173 に残ると CORS 系エラーになりやすい）
  const proxyTarget = (env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000').trim()
  const wsTarget = httpToWsOrigin(proxyTarget) || proxyTarget

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: true,
      host: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      reportCompressedSize: false,
      esbuild: {
        legalComments: 'none',
      },
    },
    base: '/',
  }
})
