import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import manifest from './manifest.firefox.json'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    crx({ manifest }),
  ],
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
