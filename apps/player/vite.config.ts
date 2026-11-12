import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// En local, `/api` est relayé vers le back (uvicorn ou docker compose de backend/) :
// le front appelle la même origine, comme derrière l'Ingress sur EKS.
// Autre adresse : variable API_PROXY_TARGET.
const apiProxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
    changeOrigin: true,
    ws: true, // salle d'échange (WebSocket /api/v1/trades/{tradeId}/live)
  },
}

// https://vite.dev/config/
export default defineConfig({
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      workbox: {
        // Illustrations et polices (sous-ensembles latins) disponibles hors ligne.
        globPatterns: ['**/*.{js,css,html,ico,svg}', 'assets/*.png', 'assets/*-latin-*.woff2'],
        navigateFallback: '/index.html',
        // Le dashboard admin est servi sous /admin/ sur le même domaine : le service worker
        // du joueur ne doit pas répondre à sa place.
        navigateFallbackDenylist: [/^\/admin(\/|$)/, /^\/api\//],
      },
      manifest: {
        name: 'Créatura',
        short_name: 'Créatura',
        description: 'Collectionne et échange des cartes de créatures',
        lang: 'fr',
        display: 'standalone',
        theme_color: '#25334b',
        background_color: '#fff7e7',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
