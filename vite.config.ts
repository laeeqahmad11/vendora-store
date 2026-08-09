import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const e2eSingleBundle = process.env.VITE_E2E_SINGLE_BUNDLE === 'true'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Windows browser/network middleware occasionally leaves a lazy route
    // chunk pending even though the local server has already responded. The
    // E2E build keeps React.lazy semantics but removes that runtime localhost
    // fetch. Normal production builds retain their existing chunk strategy.
    ...(e2eSingleBundle
      ? {
          rolldownOptions: {
            output: { codeSplitting: false },
          },
        }
      : {
          rollupOptions: {
            output: {
              manualChunks(id: string) {
                if (id.includes('node_modules')) {
                  if (id.includes('firebase')) return 'vendor-firebase'
                  if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
                  if (id.includes('react-router') || id.includes('/react/') || id.includes('react-dom'))
                    return 'vendor-react'
                }
              },
            },
          },
        }),
  },
})
