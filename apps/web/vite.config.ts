import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/health': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4080',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
