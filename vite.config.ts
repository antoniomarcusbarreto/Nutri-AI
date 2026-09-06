import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }): UserConfig => ({
  plugins: [react(), tailwindcss()],
  // Produção: remove console/debugger residuais do bundle (Onda 6 / DEBT-08).
  // O logger central já é no-op em produção (SEC-16); isto varre libs de terceiros.
  // `drop` é suportado pelo esbuild/oxc em runtime, mas ainda não está no tipo.
  esbuild: { drop: mode === 'production' ? ['console', 'debugger'] : [] } as UserConfig['esbuild'],
  build: {
    rollupOptions: {
      output: {
        // Vendor splitting: chunks estáveis e cacheáveis entre deploys (PERF-02).
        // `charts` (recharts + d3) só é baixado junto da rota /acompanhamento (lazy).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/recharts|victory-vendor|[\\/]d3-/.test(id)) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack')) return 'react-vendor'
          if (/[\\/]react-router/.test(id)) return 'react-vendor'
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          if (id.includes('date-fns')) return 'dates'
        },
      },
    },
  },
}))
