import jsQR, { type QRCode } from 'jsqr'

export type TotpQrErrorCode = 'no_qr' | 'empty' | 'invalid_totp'

export class TotpQrDecodeError extends Error {
  readonly code: TotpQrErrorCode

  constructor(code: TotpQrErrorCode) {
    super(code)
    this.name = 'TotpQrDecodeError'
    this.code = code
  }
}

const MAX_QR_CODES = 20
const SCALE_FACTORS = [1, 0.75, 0.5] as const

/** Trim QR payload; empty after trim is rejected. */
export function normalizeTotpQrPayload(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new TotpQrDecodeError('empty')
  }
  return value
}

function maskQrRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  code: QRCode,
  pad = 8,
) {
  const points = [
    code.location.topLeftCorner,
    code.location.topRightCorner,
    code.location.bottomLeftCorner,
    code.location.bottomRightCorner,
  ]
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.max(0, Math.floor(Math.min(...xs) - pad))
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs) + pad))
  const minY = Math.max(0, Math.floor(Math.min(...ys) - pad))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys) + pad))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }
}

/** Decode all QR codes found by repeatedly masking each hit (jsQR returns one at a time). */
export function decodeAllQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string[] {
  if (width === 0 || height === 0) return []

  const copy = new Uint8ClampedArray(data)
  const found: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < MAX_QR_CODES; i++) {
    const result = jsQR(copy, width, height, { inversionAttempts: 'attemptBoth' })
    if (!result?.data) break
    const payload = result.data.trim()
    if (payload && !seen.has(payload)) {
      seen.add(payload)
      found.push(payload)
    }
    maskQrRegion(copy, width, height, result)
  }

  return found
}

/** Decode the first QR code found in raw image pixel data. */
export function decodeQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  const all = decodeAllQrFromImageData(data, width, height)
  if (all.length === 0) {
    throw new TotpQrDecodeError('no_qr')
  }
  return all[0]
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new TotpQrDecodeError('no_qr'))
    img.src = dataUrl
  })
}

function drawScaledImageData(
  img: HTMLImageElement,
  scale: number,
): { data: Uint8ClampedArray; width: number; height: number } | null {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (srcW === 0 || srcH === 0) return null

  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = scale < 1
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  return { data: imageData.data, width, height }
}

/** Prefer otpauth URIs, then other payloads (stable order within each group). */
export function rankTotpQrCandidates(payloads: string[]): string[] {
  const otpauth: string[] = []
  const others: string[] = []
  const seen = new Set<string>()
  for (const raw of payloads) {
    const value = raw.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    if (/^otpauth:\/\//i.test(value)) otpauth.push(value)
    else others.push(value)
  }
  return [...otpauth, ...others]
}

/** Decode all QR payloads from a data URL (multi-QR + multi-scale). */
export async function decodeAllQrFromDataUrl(dataUrl: string): Promise<string[]> {
  const img = await loadImageFromDataUrl(dataUrl)
  const collected: string[] = []

  for (const scale of SCALE_FACTORS) {
    const scaled = drawScaledImageData(img, scale)
    if (!scaled) continue
    collected.push(...decodeAllQrFromImageData(scaled.data, scaled.width, scaled.height))
  }

  return rankTotpQrCandidates(collected)
}

/** Decode the first QR code found in a data URL image (e.g. tab screenshot). */
export async function decodeQrFromDataUrl(dataUrl: string): Promise<string> {
  const all = await decodeAllQrFromDataUrl(dataUrl)
  if (all.length === 0) {
    throw new TotpQrDecodeError('no_qr')
  }
  return all[0]
}

/**
 * Decode QR from data URL and validate as TOTP secret / otpauth URI.
 * Tries every detected QR until one validates.
 */
export async function decodeTotpQrFromDataUrl(
  dataUrl: string,
  validate: (value: string) => Promise<void>,
): Promise<string> {
  const candidates = await decodeAllQrFromDataUrl(dataUrl)
  if (candidates.length === 0) {
    throw new TotpQrDecodeError('no_qr')
  }

  let sawEmpty = false
  for (const raw of candidates) {
    let value: string
    try {
      value = normalizeTotpQrPayload(raw)
    } catch (err) {
      if (err instanceof TotpQrDecodeError && err.code === 'empty') {
        sawEmpty = true
      }
      continue
    }
    try {
      await validate(value)
      return value
    } catch {
      // try next candidate
    }
  }

  if (sawEmpty && candidates.every((c) => !c.trim())) {
    throw new TotpQrDecodeError('empty')
  }
  throw new TotpQrDecodeError('invalid_totp')
}
