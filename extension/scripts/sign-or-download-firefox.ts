import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const EXTENSION_DIR = resolve(import.meta.dirname, '..')
const ADDON_ID = 'kura-pm@meshpeak.net'
const AMO_BASE = 'https://addons.mozilla.org'

const apiKey = process.env.AMO_API_KEY
const apiSecret = process.env.AMO_API_SECRET
const version = process.env.VERSION
const sourceBundlePath = process.env.SOURCE_BUNDLE_PATH

if (!apiKey || !apiSecret) {
  console.warn('::warning::AMO credentials not configured. Skipping Firefox submission.')
  process.exit(0)
}

if (!version) {
  console.error('::error::VERSION env var not set')
  process.exit(1)
}

if (!sourceBundlePath) {
  console.error('::error::SOURCE_BUNDLE_PATH env var not set')
  process.exit(1)
}

function generateJwt(): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: apiKey,
    jti: randomBytes(16).toString('hex'),
    iat: now,
    exp: now + 60,
  }
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${b64(header)}.${b64(payload)}`
  const signature = createHmac('sha256', apiSecret as string)
    .update(signingInput)
    .digest('base64url')
  return `${signingInput}.${signature}`
}

interface AmoVersion {
  id: number
  version: string
}

async function pollForVersionId(retries = 10, intervalMs = 3000): Promise<number> {
  const url = `${AMO_BASE}/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/?filter=all_with_unlisted&page_size=50`
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { Authorization: `JWT ${generateJwt()}` } })
    if (res.ok) {
      const data = (await res.json()) as { results?: AmoVersion[] }
      const found = data.results?.find((v) => v.version === version)
      if (found) return found.id
    }
    if (i < retries - 1) {
      console.log(`Version ${version} not yet visible on AMO. Retrying in ${intervalMs / 1000}s...`)
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  throw new Error(`Version ${version} not found on AMO after ${retries} retries`)
}

async function uploadSourceBundle(versionId: number): Promise<void> {
  const absPath = resolve(sourceBundlePath as string)
  const form = new FormData()
  form.append('source', new Blob([readFileSync(absPath)]), basename(absPath))
  const res = await fetch(
    `${AMO_BASE}/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/${versionId}/`,
    {
      method: 'PATCH',
      headers: { Authorization: `JWT ${generateJwt()}` },
      body: form,
    },
  )
  if (!res.ok) {
    throw new Error(`Source bundle upload failed: ${res.status} ${await res.text()}`)
  }
  console.log(`Source bundle uploaded successfully for version ${version} (id: ${versionId})`)
}

function submitToAmo(): void {
  console.log(`Submitting version ${version} to AMO as listed...`)
  const result = spawnSync(
    'pnpm',
    [
      'web-ext',
      'sign',
      '--source-dir',
      'dist',
      '--channel',
      'listed',
      '--amo-metadata',
      'amo-metadata.json',
      '--api-key',
      apiKey as string,
      '--api-secret',
      apiSecret as string,
      '--artifacts-dir',
      '.',
    ],
    { cwd: EXTENSION_DIR, stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error(`web-ext sign exited with status ${result.status}`)
  }
}

submitToAmo()
console.log('Waiting for version to appear on AMO...')
const versionId = await pollForVersionId()
console.log(`Found version ${version} on AMO (id: ${versionId}). Uploading source bundle...`)
await uploadSourceBundle(versionId)
