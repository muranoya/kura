import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import manifest from './manifest.firefox.json'

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), tailwindcss(), crx({ manifest })],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        popup: new URL('./src/popup/index.html', import.meta.url).pathname,
        background: new URL('./src/background/index.ts', import.meta.url).pathname,
      },
    },
  },
})
