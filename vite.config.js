import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/cargador-empleados/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      crypto: 'crypto-browserify',
      events: 'events',
      process: 'process/browser',
      stream: 'stream-browserify',
      timers: 'timers-browserify',
      util: 'util',
    },
  },
  server: {
    proxy: {
      '/api/geovictoria': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/visma': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'index.html'),
        geovictoria: resolve(projectRoot, 'geovictoria/index.html'),
      },
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
