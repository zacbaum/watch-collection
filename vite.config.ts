import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Shared between Vite's base and the PWA manifest so localhost installs work
// the same as the GitHub Pages deployment.
const base = process.env.NODE_ENV === 'production' ? '/watch-collection/' : '/'

export default defineConfig({
  base,
  server: {
    // Bind both IPv4 and IPv6 loopback so 'localhost' resolves reliably
    // on Windows regardless of resolver preference.
    host: '127.0.0.1',
    strictPort: true,
    port: 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Watch Collection',
        short_name: 'Watches',
        description: 'Personal watch collection manager',
        // Warm theme (the app default): light bg + dark bg
        theme_color: '#f7f2e8',
        background_color: '#f7f2e8',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.frankfurter\.app\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fx-rates',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
