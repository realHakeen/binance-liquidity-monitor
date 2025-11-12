import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external connections (for Docker)
    port: 5173,
    watch: {
      usePolling: true, // Enable polling for Docker volume mounts
    },
    proxy: {
      '/api': {
        // Use environment variable or default to localhost
        // In Docker dev mode, set VITE_API_URL=http://backend:3000
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

