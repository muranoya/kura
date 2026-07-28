import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Copies the MAIN-world WebAuthn script verbatim into `dist/` and adds its
 * content script declaration to the built `dist/manifest.json` after crx's
 * own manifest generation.
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
 * and behaves identically across Chrome and Firefox.
 *
 * The source lives at `src/main-world/webauthn-main-injected.js` (plain JS,
 * no imports) rather than in `public/`: this plugin copies it into `dist/`
 * itself instead of relying on Vite's public-dir passthrough, so the file is
 * ordinary tracked source under `src/` and isn't at the mercy of whatever
 * ignore rules `public/` happens to have (that directory is bulk-gitignored
 * for generated assets — see docs/webauthn-passkey.md Part 3-2).
 */
export function injectWebauthnMainContentScript(): Plugin {
  return {
    name: 'inject-webauthn-main-content-script',
    closeBundle() {
      const srcPath = resolve(__dirname, 'src/main-world/webauthn-main-injected.js')
      const destPath = resolve(__dirname, 'dist/webauthn-main-injected.js')
      copyFileSync(srcPath, destPath)

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
