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
  const proxyTarget = (env.VITE_DEV_PROXY_TARGET || '').trim()

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: true,
      host: true,
      ...(proxyTarget
        ? {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
              },
              '/ws': {
                target: httpToWsOrigin(proxyTarget) || proxyTarget,
                ws: true,
                changeOrigin: true,
              },
            },
          }
        : {}),
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
