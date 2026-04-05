import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import wasm from 'vite-plugin-wasm'
import manifest from './manifest.firefox.json'

/** Strip Chrome-only properties from manifest.json for Firefox compatibility */
function firefoxManifestCleanup(): Plugin {
  return {
    name: 'firefox-manifest-cleanup',
    closeBundle() {
      const manifestPath = resolve(__dirname, 'dist/manifest.json')
      try {
        const json = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (json.web_accessible_resources) {
          for (const entry of json.web_accessible_resources) {
            delete entry.use_dynamic_url
          }
        }
        writeFileSync(manifestPath, JSON.stringify(json, null, 2))
      } catch {
        // ignore if manifest doesn't exist yet
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), wasm(), tailwindcss(), crx({ manifest }), firefoxManifestCleanup()],
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
