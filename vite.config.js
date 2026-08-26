import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/cargador-empleados/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/geovictoria': {
        target: 'http://localhost:8787',
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
