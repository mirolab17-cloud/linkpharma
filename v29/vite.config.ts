import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/linkpharma/v29/',
          name: 'فارما لينك',
          short_name: 'فارما لينك',
          description: 'منصة فارما لينك بين المستودعات وإرسال طلبيات الصيدليات عبر واتساب',
          theme_color: '#0f9d7a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: './',
          scope: './',
          dir: 'rtl',
          lang: 'ar',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // The landing page is index.html, so do not use it as an SPA navigation fallback.
          navigateFallback: null,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Large feature/Firebase bundles are runtime-cached so a transient download failure cannot reject SW installation.
          maximumFileSizeToCacheInBytes: 512 * 1024,
          globIgnores: ['**/assets/v18Features-*.js', '**/assets/firebase-*.js'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/assets\/firebase-[^/]+\.js$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'linkpharma-v29-firebase-chunks',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /\/assets\/v18Features-[^/]+\.js$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'linkpharma-v29-feature-chunks',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      // v29: public landing (index.html) and authenticated React platform (platform.html) as separate entries.
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          platform: path.resolve(__dirname, 'platform.html'),
        },
      },
      // لا نستخدم manualChunks: تقسيم المكتبات يدوياً سبب اعتماداً دائرياً بين الملفات وصفحة بيضاء.
      chunkSizeWarningLimit: 2000,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
