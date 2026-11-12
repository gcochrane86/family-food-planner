/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Which update the app is running, shown in Settings: the commit it was built from, and when.
const commit = (() => { try { return execSync('git rev-parse --short=7 HEAD').toString().trim(); } catch { return 'dev'; } })();

export default defineConfig({
  base: '/family-food-planner/',
  define: { __APP_VERSION__: JSON.stringify(commit), __APP_BUILT__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // Keep recipe photos and fonts on the device, so opening the app doesn't download them again.
        // Photos get a new file name whenever they change, so a kept copy is never out of date.
        runtimeCaching: [
          {
            // Full photos and the smaller copies Supabase makes of them.
            urlPattern: /\/storage\/v1\/(object|render\/image)\/public\/recipe-images\//,
            handler: 'CacheFirst',
            options: {
              // v3 (11 Nov 2026): photos load with CORS, so only real photos (200) are kept, never a missing small copy.
              cacheName: 'recipe-images-v3',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Family Food Planner',
        short_name: 'Food',
        description: 'Weekly meal plan, pantry and shopping for the family.',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#F3F4EF',
        theme_color: '#2D6A3E',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{mjs,ts}', 'supabase/functions/**/*.test.ts'],
  },
});
