import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDirectory = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
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
