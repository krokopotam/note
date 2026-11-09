import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @note/shared lives one level up, so the dev server has to be allowed to serve
// outside the frontend folder (the production build copies it into the bundle).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://127.0.0.1:8120',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
