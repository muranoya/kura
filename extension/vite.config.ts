import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import manifest from './manifest.json'

// Service Worker では document が存在しないため、
// Vite の modulepreload polyfill 内の document 参照をガードする
function serviceWorkerDocumentGuard(): Plugin {
  return {
    name: 'service-worker-document-guard',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        if (!chunk.code.includes('getElementsByTagName(`link`)')) continue
        chunk.code = chunk.code.replace(
          /if\((\w+)&&\1\.length>0\)\{let (\w+)=document\.getElementsByTagName/,
          'if(typeof document!=="undefined"&&$1&&$1.length>0){let $2=document.getElementsByTagName',
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), wasm(), tailwindcss(), crx({ manifest }), serviceWorkerDocumentGuard()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        popup: new URL('./src/popup/index.html', import.meta.url).pathname,
        background: new URL('./src/background/index.ts', import.meta.url).pathname,
        offscreen: new URL('./src/background/offscreen.html', import.meta.url).pathname,
      },
    },
  },
})
