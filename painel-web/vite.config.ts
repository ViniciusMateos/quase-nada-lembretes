import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Painel web local do Quase Nada Lembretes. Fala com o MESMO backend do app
// (Server 1 :8000) via proxy do dev server — assim o browser bate em
// localhost (mesma origem) e o Vite repassa pro backend, matando qualquer dor
// de cabeça com CORS. Só roda local.
const BACKEND = 'http://147.15.7.119:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/health': { target: BACKEND, changeOrigin: true },
    },
  },
})
