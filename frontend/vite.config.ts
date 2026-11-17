import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false,
      },
      '/data': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/hls.js/')) return 'hls'
          if (id.includes('/@astryxdesign/') || id.includes('/@stylexjs/')) return 'astryx'
          if (/\/node_modules\/(react|react-dom|scheduler|lucide-react)\//.test(id)) return 'vendor'
          return undefined
        },
      },
    },
  },
})
