import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDirectory = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/victory-vendor/')) {
            return 'charts'
          }

          if (
            id.includes('/node_modules/react/')
            || id.includes('/node_modules/react-dom/')
            || id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('/node_modules/axios/')) {
            return 'http'
          }

          return 'vendor'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(rootDirectory, '../shared')
    }
  },
  server: {
    fs: {
      allow: [path.resolve(rootDirectory, '..')]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (incomingPath) => incomingPath.replace(/^\/api/, '')
      }
    }
  }
})
