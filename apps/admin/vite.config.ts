import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// En local, `/api` est relayé vers le back (uvicorn ou docker compose de backend/) :
// le front appelle la même origine, comme derrière l'Ingress sur EKS.
// Autre adresse : variable API_PROXY_TARGET.
const apiProxy = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000', changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  plugins: [vue(), vueDevTools(), tailwindcss()],
  build: {
    // ECharts (déjà réduit aux seuls modules utilisés) pèse ~530 ko : on l'isole dans son propre fichier.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'echarts', test: /node_modules[\\/](echarts|zrender|vue-echarts)/ }],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
