import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = readFileSync(resolve(root, 'VERSION'), 'utf-8').trim()

const jsonTargets = [
  'extension/package.json',
  'extension/manifest.json',
  'extension/manifest.firefox.json',
]

const tomlTargets = [
  'vault-core/Cargo.toml',
  'desktop/Cargo.toml',
  'extension/wasm-bridge/Cargo.toml',
  'android/rust-jni/Cargo.toml',
]

for (const rel of jsonTargets) {
  const path = resolve(root, rel)
  const content = readFileSync(path, 'utf-8')
  writeFileSync(path, content.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`))
}

const crateNames = []
for (const rel of tomlTargets) {
  const path = resolve(root, rel)
  const content = readFileSync(path, 'utf-8')
  writeFileSync(path, content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`))
  crateNames.push(content.match(/^name\s*=\s*"([^"]*)"/m)[1])
}

// Cargo.lock には workspace メンバー自身のバージョンも記録されるため、
// Cargo.toml だけ書き換えると `--locked` 付きのコマンド（cargo about 等）が失敗する。
// `cargo update --offline` は crates.io index のキャッシュがない CI で失敗するので直接書き換える。
// workspace メンバーのエントリには `source` 行がないことで外部クレートと区別する。
// Windows の CI では autocrlf で CRLF になるため改行は \r?\n で受ける
const lockPath = resolve(root, 'Cargo.lock')
let lock = readFileSync(lockPath, 'utf-8')
for (const name of crateNames) {
  const pattern = new RegExp(`^(name = "${name}"\\r?\\nversion = )"[^"]*"(?!\\r?\\nsource)`, 'm')
  if (!pattern.test(lock)) throw new Error(`[sync-version] ${name} not found in Cargo.lock`)
  lock = lock.replace(pattern, `$1"${version}"`)
}
writeFileSync(lockPath, lock)

console.log(`[sync-version] ${version}`)
