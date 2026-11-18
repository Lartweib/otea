import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorker } from './src/offline/sw-build.ts';
import { hoverOnly } from './src/styles/hover-only.ts';

export default defineConfig({
  // The installed app's service worker is built beside the app, into /sw.js.
  plugins: [react(), serviceWorker()],
  // Hover styles only where a pointer hovers: never stuck under a finger.
  css: { postcss: { plugins: [hoverOnly()] } },
  // A project's API is under its page's path (/p/<id>/api); the pairing calls are at /api.
  server: {
    proxy: {
      '^/p/[^/]+/api': 'http://127.0.0.1:4400',
      '/api': 'http://127.0.0.1:4400',
      '/auth': 'http://127.0.0.1:4400',
    },
  },
});
