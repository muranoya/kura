import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = readFileSync(resolve(root, 'VERSION'), 'utf-8').trim()

const jsonTargets = [
  'desktop/package.json',
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/tauri.conf.dev.json',
  'extension/package.json',
  'extension/manifest.json',
  'extension/manifest.firefox.json',
]

const tomlTargets = [
  'vault-core/Cargo.toml',
  'desktop/src-tauri/Cargo.toml',
  'extension/wasm-bridge/Cargo.toml',
  'android/rust-jni/Cargo.toml',
]

for (const rel of jsonTargets) {
  const path = resolve(root, rel)
  const content = readFileSync(path, 'utf-8')
  writeFileSync(path, content.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`))
}

for (const rel of tomlTargets) {
  const path = resolve(root, rel)
  const content = readFileSync(path, 'utf-8')
  writeFileSync(path, content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`))
}

console.log(`[sync-version] ${version}`)
