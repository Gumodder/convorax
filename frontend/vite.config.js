import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Tudo saia num bundle so de ~1,16 MB: o usuario baixava o LiveKit inteiro
    // antes de ver a tela de login. Separar as libs em chunks estaveis faz o
    // navegador reaproveitar o cache entre deploys — so o chunk que mudou e
    // rebaixado. (O Vite 8 roda em cima do rolldown, onde manualChunks
    // precisa ser funcao; a forma de objeto foi removida.)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('livekit')) return 'livekit'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
