import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gitSha = process.env.VITE_GIT_SHA || process.env.GITHUB_SHA || 'dev';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(gitSha),
  },
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
