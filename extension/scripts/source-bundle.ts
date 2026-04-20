// AMO ソースコード提出用の zip を生成する。
//
// Firefox AMO は最小化・バンドル済みの成果物に加えて、
// 「署名版の xpi を完全に再現できるソースツリー」を要求する。
// node_modules / dist / target / 自動生成ファイルは含めず、
// git で追跡されているファイルのみを git archive 経由で固める。
//
// 出力: extension/kura-extension-source-<version>.zip

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EXTENSION_DIR = resolve(import.meta.dirname, '..')
const REPO_ROOT = resolve(EXTENSION_DIR, '..')

// AMO レビュアーが xpi を再現するのに必要なパスのみを選ぶ。
// - vault-core: wasm-bridge の依存元
// - extension: 拡張本体とビルドスクリプト
// - assets: public_suffix_list.dat など extension ビルドが参照するアセット
// - scripts/sync-version.mjs: justfile からバージョン同期に呼ばれる
// - Cargo.toml / Cargo.lock: wasm-bridge の lock された依存解決
// - VERSION / justfile / LICENSE / README: ビルド再現と法務情報
const INCLUDE_PATHS = [
  'vault-core',
  'extension',
  'assets',
  'scripts/sync-version.mjs',
  'Cargo.toml',
  'Cargo.lock',
  'VERSION',
  'justfile',
  'LICENSE',
  'README.md',
  'README_ja.md',
]

function readVersion(): string {
  const raw = readFileSync(resolve(REPO_ROOT, 'VERSION'), 'utf-8')
  const version = raw.trim()
  if (!version) throw new Error('VERSION file is empty')
  return version
}

function ensureCleanTree(): void {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
  if (result.status !== 0) {
    throw new Error(`git status failed: ${result.stderr}`)
  }
  if (result.stdout.trim().length > 0) {
    console.warn('::warning::Working tree has uncommitted changes. git archive only captures HEAD.')
    console.warn(result.stdout)
  }
}

function runGitArchive(outputPath: string): void {
  if (existsSync(outputPath)) rmSync(outputPath)
  const args = ['archive', '--format=zip', '-o', outputPath, 'HEAD', ...INCLUDE_PATHS]
  const result = spawnSync('git', args, { cwd: REPO_ROOT, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`git archive exited with ${result.status}`)
  }
}

function main(): void {
  const version = readVersion()
  const outputPath = resolve(EXTENSION_DIR, `kura-extension-source-${version}.zip`)

  ensureCleanTree()
  runGitArchive(outputPath)

  console.log(`\n✅ AMO source bundle created: ${outputPath}`)
}

main()
