import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        // Plan §6/§7 — dev proxy: FE on :5173, backend on :4000. No CORS in dev.
        // Override the target with VITE_DEV_PROXY_TARGET (e.g. the Pi's LAN
        // address) — or bypass the proxy entirely by setting VITE_API_BASE_URL
        // (see src/api/apiBase.ts).
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000',
          changeOrigin: true,
        },
        // Training simulator WebSocket (browser mic ↔ Deepgram Voice Agent
        // bridge). ws:true is required — plain proxies drop the upgrade.
        '/ws': {
          target: env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
