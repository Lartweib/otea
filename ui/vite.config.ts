import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { hoverOnly } from './src/styles/hover-only.ts';

export default defineConfig({
  plugins: [react()],
  // Hover styles only where a pointer hovers: never stuck under a finger.
  css: { postcss: { plugins: [hoverOnly()] } },
  server: { proxy: { '/api': 'http://127.0.0.1:4400' } },
});
