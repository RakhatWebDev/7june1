/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed to GitHub Pages under /7june1/ — the app uses a hash router,
// so only the asset base path depends on this.
const base = process.env.GITHUB_PAGES ? '/7june1/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'FORMA — My Training Process',
        short_name: 'FORMA',
        description: 'Личный тренировочный дневник: зал, кардио, растяжка, питание и сон.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
