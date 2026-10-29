// cargo-about の JSON（標準入力）から、デスクトップ版の About 画面で表示するサードパーティライセンス一覧を作る。
// 出力: desktop/third-party-licenses.json
//   texts:    ライセンス全文（同じ全文は1つにまとめる）
//   packages: { name, version, license, texts: texts の番号 }
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'desktop/third-party-licenses.json')

// cargo-about は SPDX にないライセンスの全文を出力しないので、クレートに同梱されている全文を読む
const SLINT_LICENSE = 'LicenseRef-Slint-Royalty-free-2.0'

const about = JSON.parse(readFileSync(0, 'utf-8'))

const texts = []
const textIndex = new Map()
function addText(text) {
  const normalized = `${text.replace(/\r\n/g, '\n').trim()}\n`
  if (!textIndex.has(normalized)) {
    textIndex.set(normalized, texts.length)
    texts.push(normalized)
  }
  return textIndex.get(normalized)
}

// クレートの id → 採用したライセンスの全文
const byCrate = new Map()
for (const license of about.licenses) {
  for (const { crate } of license.used_by) {
    if (!byCrate.has(crate.id)) byCrate.set(crate.id, [])
    byCrate.get(crate.id).push({ id: license.id, text: addText(license.text) })
  }
}

const packages = []
let mplText
for (const { package: pkg, license } of about.crates) {
  // path 依存（kura 自身のクレート）は除く
  if (pkg.source === null) continue
  let licenses = byCrate.get(pkg.id) ?? []
  if (licenses.length === 0 && license.includes(SLINT_LICENSE)) {
    const path = resolve(dirname(pkg.manifest_path), `LICENSES/${SLINT_LICENSE}.md`)
    licenses = [{ id: SLINT_LICENSE, text: addText(readFileSync(path, 'utf-8')) }]
  }
  if (licenses.length === 0) {
    throw new Error(`No license text found for ${pkg.name} ${pkg.version} (${license})`)
  }
  if (mplText === undefined) mplText = licenses.find((l) => l.id === 'MPL-2.0')?.text
  packages.push({
    name: pkg.name,
    version: pkg.version,
    license: [...new Set(licenses.map((l) => l.id))].join(' AND '),
    texts: [...new Set(licenses.map((l) => l.text))],
  })
}

// Cargo 以外でバイナリに埋め込んでいるもの
function bundled(name, license, text) {
  packages.push({ name, version: '', license, texts: [text] })
}
bundled('JetBrains Mono', 'OFL-1.1', addText(readFileSync(resolve(root, 'desktop/fonts/OFL.txt'), 'utf-8')))
bundled('Lucide', 'ISC AND MIT', addText(readFileSync(resolve(root, 'desktop/ui/icons/LICENSE'), 'utf-8')))
// vault-core が assets/public_suffix_list.dat を埋め込んでいる。MPL-2.0 の全文は依存クレートのものを使う
if (mplText === undefined) {
  throw new Error('MPL-2.0 license text for the Public Suffix List was not found in the crate licenses')
}
bundled('Public Suffix List', 'MPL-2.0', mplText)

packages.sort(
  (a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
    a.version.localeCompare(b.version, undefined, { numeric: true }),
)

writeFileSync(output, `${JSON.stringify({ texts, packages }, null, 1)}\n`)
console.log(`[desktop-licenses] ${packages.length} packages, ${texts.length} license texts`)
