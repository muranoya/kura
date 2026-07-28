import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Adds the MAIN-world WebAuthn content script declaration to the built
 * `dist/manifest.json` after crx's own manifest generation, pointing at a
 * plain static file copied verbatim from `public/` (not crx-processed).
 *
 * This is NOT declared in the source manifest.json/manifest.firefox.json
 * passed to `crx({ manifest })`, because @crxjs/vite-plugin wraps every
 * declared content script in a loader that dynamically `import()`s the real
 * bundle from the extension origin. For an ISOLATED-world script that's fine,
 * but a MAIN-world script runs in the page's own script-loading context, and
 * at least Firefox 153 resolves that loader's relative import against the
 * *page's* origin instead of the extension's — silently failing to load the
 * real logic, with no console error and no manifest warning. A single
 * self-contained script with no imports sidesteps the whole class of problem
 * and behaves identically across Chrome and Firefox. See
 * `public/webauthn-main-injected.js` and docs/webauthn-passkey.md Part 3-2.
 */
export function injectWebauthnMainContentScript(): Plugin {
  return {
    name: 'inject-webauthn-main-content-script',
    closeBundle() {
      const manifestPath = resolve(__dirname, 'dist/manifest.json')
      const json = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      json.content_scripts = json.content_scripts || []
      json.content_scripts.push({
        matches: ['<all_urls>'],
        js: ['webauthn-main-injected.js'],
        run_at: 'document_start',
        all_frames: true,
        world: 'MAIN',
      })
      writeFileSync(manifestPath, JSON.stringify(json, null, 2))
    },
  }
}
