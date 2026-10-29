// リポジトリにバンドルしている外部データソースを配布元から取り直す。
// ビルド時にはダウンロードしない方針なので、定期的にこのスクリプトで手動更新してコミットする。
//   assets/public_suffix_list.dat                        : Public Suffix List（vault-core / extension が使う）
//   android/app/src/main/assets/gpm_privileged_allowlist.json : Passkey の特権アプリ許可リスト（Android が使う）
// 配布元の内容はそのまま保存する（整形すると次回更新時の差分が読みにくくなるため）。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const assets = [
  {
    name: 'Public Suffix List',
    url: 'https://publicsuffix.org/list/public_suffix_list.dat',
    path: 'assets/public_suffix_list.dat',
    validate(text) {
      for (const marker of ['===BEGIN ICANN DOMAINS===', '===END PRIVATE DOMAINS===']) {
        if (!text.includes(marker)) throw new Error(`missing "${marker}"`)
      }
    },
  },
  {
    name: 'GPM privileged allowlist',
    url: 'https://www.gstatic.com/gpm-passkeys-privileged-apps/apps.json',
    path: 'android/app/src/main/assets/gpm_privileged_allowlist.json',
    validate(text) {
      const apps = JSON.parse(text).apps
      if (!Array.isArray(apps) || apps.length === 0) throw new Error('"apps" is empty')
    },
  },
]

function readCurrent(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

async function download(asset) {
  const response = await fetch(asset.url)
  if (!response.ok) {
    throw new Error(`${asset.name}: ${response.status} ${response.statusText} (${asset.url})`)
  }
  const text = await response.text()
  try {
    asset.validate(text)
  } catch (e) {
    throw new Error(`${asset.name}: unexpected content from ${asset.url}: ${e.message}`)
  }
  return text
}

// 一部だけ更新された状態で終わらないよう、すべて取得・検証できてから書き込む
const texts = await Promise.all(assets.map(download))

for (const [i, asset] of assets.entries()) {
  const text = texts[i]
  const output = resolve(root, asset.path)
  if (readCurrent(output) === text) {
    console.log(`= ${asset.path} (unchanged)`)
    continue
  }
  writeFileSync(output, text, 'utf-8')
  console.log(`✓ ${asset.path} (updated)`)
}
