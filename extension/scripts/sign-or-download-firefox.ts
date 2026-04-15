import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EXTENSION_DIR = resolve(import.meta.dirname, '..')
const ADDON_ID = 'kura-pm@meshpeak.net'
const AMO_BASE = 'https://addons.mozilla.org'

const apiKey = process.env.AMO_API_KEY
const apiSecret = process.env.AMO_API_SECRET
const version = process.env.VERSION

if (!apiKey || !apiSecret) {
  console.warn('::warning::AMO credentials not configured. Skipping Firefox signing.')
  process.exit(0)
}

if (!version) {
  console.error('::error::VERSION env var not set')
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

async function amoFetch(url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `JWT ${generateJwt()}` } })
}

interface AmoVersion {
  version: string
  file?: { url?: string }
}

async function findExistingVersion(): Promise<AmoVersion | null> {
  const url = `${AMO_BASE}/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/?filter=all_with_unlisted&page_size=50`
  const res = await amoFetch(url)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`AMO versions API failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { results?: AmoVersion[] }
  return data.results?.find((v) => v.version === version) ?? null
}

async function download(url: string, dest: string): Promise<void> {
  const res = await amoFetch(url)
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${await res.text()}`)
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

function runWebExtSign(): never {
  const result = spawnSync(
    'pnpm',
    [
      'web-ext',
      'sign',
      '--source-dir',
      'dist',
      '--channel',
      'unlisted',
      '--api-key',
      apiKey as string,
      '--api-secret',
      apiSecret as string,
      '--artifacts-dir',
      '.',
    ],
    { cwd: EXTENSION_DIR, stdio: 'inherit' },
  )
  process.exit(result.status ?? 1)
}

const existing = await findExistingVersion()
if (existing) {
  const fileUrl = existing.file?.url
  if (!fileUrl) {
    console.warn(
      `::warning::Version ${version} exists on AMO but has no downloadable file yet. Falling back to web-ext sign (will wait for processing).`,
    )
    runWebExtSign()
  }
  const dest = resolve(EXTENSION_DIR, `kura-firefox-signed-${version}.xpi`)
  console.log(`Version ${version} already signed on AMO. Downloading existing xpi...`)
  await download(fileUrl, dest)
  console.log(`Downloaded: ${dest}`)
} else {
  console.log(`Version ${version} not found on AMO. Signing via web-ext...`)
  runWebExtSign()
}
