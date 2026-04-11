import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf-8').trim()

const targets = ['../package.json', '../src-tauri/tauri.conf.json', '../src-tauri/tauri.conf.dev.json']

for (const file of targets) {
  const path = resolve(import.meta.dirname, file)
  const content = readFileSync(path, 'utf-8')
  const updated = content.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)
  writeFileSync(path, updated)
}

console.log(`[sync-version] ${version}`)
