import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAPPING_PATH = resolve(root, 'android/app/src/main/assets/package_domains.json')
const HANDLE_ALL_URLS_RELATION = 'delegate_permission/common.handle_all_urls'

function normalizeFingerprints(fingerprints) {
  const unique = new Set(fingerprints.map((fp) => fp.toUpperCase()))
  return [...unique].sort()
}

async function fetchAssetLinksFingerprints(domain, packageName) {
  const url = `https://${domain}/.well-known/assetlinks.json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  const statements = await response.json()
  if (!Array.isArray(statements)) {
    throw new Error('assetlinks.json is not an array')
  }
  const statement = statements.find(
    (s) =>
      s?.relation?.includes(HANDLE_ALL_URLS_RELATION) &&
      s?.target?.namespace === 'android_app' &&
      s?.target?.package_name === packageName
  )
  if (!statement) {
    throw new Error(`no matching target for package_name=${packageName}`)
  }
  const fingerprints = statement.target.sha256_cert_fingerprints
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    throw new Error('target has no sha256_cert_fingerprints')
  }
  return fingerprints
}

async function main() {
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'))
  const skipped = []

  for (const [packageName, entry] of Object.entries(mapping)) {
    try {
      const fingerprints = await fetchAssetLinksFingerprints(entry.domain, packageName)
      entry.certSha256 = normalizeFingerprints(fingerprints)
      console.log(`updated: ${packageName} (${entry.domain}) -> ${entry.certSha256.length} fingerprint(s)`)
    } catch (e) {
      skipped.push({ packageName, domain: entry.domain, reason: e.message })
    }
  }

  writeFileSync(MAPPING_PATH, `${JSON.stringify(mapping, null, 4)}\n`, 'utf-8')

  if (skipped.length > 0) {
    console.log('')
    console.log(
      `skipped ${skipped.length} entrie(s) (assetlinks.json unavailable or not matching; manual verification needed):`
    )
    for (const { packageName, domain, reason } of skipped) {
      console.log(`  - ${packageName} (${domain}): ${reason}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
