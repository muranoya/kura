import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  QRCodeReader,
  type Result,
  RGBLuminanceSource,
} from '@zxing/library'

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
const BOUNDS_PAD = 12

export type QrPoint = { x: number; y: number }

/** Axis-aligned bounds in image pixel space. */
export type QrBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** One decoded QR with optional geometry (image pixel space). */
export type QrDetection = {
  value: string
  points: QrPoint[]
  bounds: QrBounds | null
}

export type QrDecodeBatch = {
  detections: QrDetection[]
  imageWidth: number
  imageHeight: number
}

/** Trim QR payload; empty after trim is rejected. */
export function normalizeTotpQrPayload(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new TotpQrDecodeError('empty')
  }
  return value
}

/** Mask a secret for confirmation UI (never show full secret). */
export function maskSecretFragment(secret: string, keep = 4): string {
  const s = secret.replace(/\s+/g, '')
  if (!s) return '••••'
  if (s.length <= keep * 2) return '•'.repeat(Math.min(Math.max(s.length, 4), 12))
  return `${s.slice(0, keep)}…${s.slice(-keep)}`
}

export type TotpQrCandidateSummary = {
  value: string
  kind: 'otpauth' | 'secret'
  issuer: string | null
  account: string | null
  digits: string | null
  period: string | null
  secretMasked: string
}

/** Parse a TOTP QR payload into safe display fields (secret is masked). */
export function summarizeTotpQrCandidate(value: string): TotpQrCandidateSummary {
  const trimmed = value.trim()
  if (/^otpauth:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      let label = ''
      if (url.pathname && url.pathname !== '/') {
        label = decodeURIComponent(url.pathname.replace(/^\//, ''))
      }
      const issuerParam = url.searchParams.get('issuer')
      let issuer = issuerParam?.trim() || null
      let account: string | null = label || null
      if (label.includes(':')) {
        const idx = label.indexOf(':')
        const fromLabel = label.slice(0, idx).trim()
        const rest = label.slice(idx + 1).trim()
        if (!issuer && fromLabel) issuer = fromLabel
        account = rest || null
      }
      const secret = url.searchParams.get('secret') || ''
      return {
        value: trimmed,
        kind: 'otpauth',
        issuer,
        account,
        digits: url.searchParams.get('digits'),
        period: url.searchParams.get('period'),
        secretMasked: maskSecretFragment(secret || trimmed),
      }
    } catch {
      return {
        value: trimmed,
        kind: 'otpauth',
        issuer: null,
        account: null,
        digits: null,
        period: null,
        secretMasked: maskSecretFragment(trimmed, 8),
      }
    }
  }

  return {
    value: trimmed,
    kind: 'secret',
    issuer: null,
    account: null,
    digits: null,
    period: null,
    secretMasked: maskSecretFragment(trimmed),
  }
}

function createHints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])
  hints.set(DecodeHintType.TRY_HARDER, true)
  hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8')
  return hints
}

function rgbaToGrayscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const a = data[i + 3]
    if (a === 0) {
      out[j] = 0xff
      continue
    }
    // ITU-R BT.601-ish integer approx (same family as ZXing browser helper)
    out[j] = (306 * data[i] + 601 * data[i + 1] + 117 * data[i + 2] + 0x200) >> 10
  }
  return out
}

function pointsFromResult(result: Result): QrPoint[] {
  const pts = result.getResultPoints() ?? []
  const out: QrPoint[] = []
  for (const p of pts) {
    if (!p) continue
    const x = p.getX()
    const y = p.getY()
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y })
  }
  return out
}

function boundsFromPoints(points: QrPoint[], width: number, height: number): QrBounds | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) return null
  return {
    minX: Math.max(0, Math.floor(minX - BOUNDS_PAD)),
    minY: Math.max(0, Math.floor(minY - BOUNDS_PAD)),
    maxX: Math.min(width - 1, Math.ceil(maxX + BOUNDS_PAD)),
    maxY: Math.min(height - 1, Math.ceil(maxY + BOUNDS_PAD)),
  }
}

function scaleDetection(det: QrDetection, scale: number): QrDetection {
  if (scale === 1) return det
  const inv = 1 / scale
  const points = det.points.map((p) => ({ x: p.x * inv, y: p.y * inv }))
  const bounds = det.bounds
    ? {
        minX: det.bounds.minX * inv,
        minY: det.bounds.minY * inv,
        maxX: det.bounds.maxX * inv,
        maxY: det.bounds.maxY * inv,
      }
    : null
  return { value: det.value, points, bounds }
}

function maskRgbaRegion(data: Uint8ClampedArray, width: number, height: number, bounds: QrBounds) {
  const minX = Math.max(0, Math.floor(bounds.minX))
  const maxX = Math.min(width - 1, Math.ceil(bounds.maxX))
  const minY = Math.max(0, Math.floor(bounds.minY))
  const maxY = Math.min(height - 1, Math.ceil(bounds.maxY))
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

function tryDecodeOnce(
  reader: QRCodeReader,
  hints: Map<DecodeHintType, unknown>,
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  inverted: boolean,
): Result | null {
  try {
    let source: RGBLuminanceSource = new RGBLuminanceSource(gray, width, height)
    if (inverted) {
      source = source.invert() as RGBLuminanceSource
    }
    const binaries = [
      new BinaryBitmap(new HybridBinarizer(source)),
      new BinaryBitmap(new GlobalHistogramBinarizer(source)),
    ]
    for (const binary of binaries) {
      try {
        const result = reader.decode(binary, hints)
        if (result?.getText()) return result
      } catch {
        reader.reset()
      }
    }
  } catch {
    reader.reset()
  }
  return null
}

/**
 * Decode all QR codes found by repeatedly masking each hit
 * (ZXing JS has no multi-QR reader for QR; mask + retry).
 */
export function decodeAllQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): QrDetection[] {
  if (width === 0 || height === 0) return []

  const copy = new Uint8ClampedArray(data)
  const found: QrDetection[] = []
  const seen = new Set<string>()
  const reader = new QRCodeReader()
  const hints = createHints()

  for (let i = 0; i < MAX_QR_CODES; i++) {
    const gray = rgbaToGrayscale(copy, width, height)
    let result = tryDecodeOnce(reader, hints, gray, width, height, false)
    if (!result) {
      result = tryDecodeOnce(reader, hints, gray, width, height, true)
    }
    if (!result) break

    const value = (result.getText() || '').trim()
    const points = pointsFromResult(result)
    let bounds = boundsFromPoints(points, width, height)

    // Fallback mask region if finder points missing: whole-image mid band is useless —
    // without bounds we cannot multi-detect further for this hit.
    if (!bounds && points.length === 0) {
      if (value && !seen.has(value)) {
        seen.add(value)
        found.push({ value, points: [], bounds: null })
      }
      break
    }

    if (!bounds) {
      // Degenerate single point
      const p = points[0]
      bounds = {
        minX: Math.max(0, Math.floor(p.x - 40)),
        minY: Math.max(0, Math.floor(p.y - 40)),
        maxX: Math.min(width - 1, Math.ceil(p.x + 40)),
        maxY: Math.min(height - 1, Math.ceil(p.y + 40)),
      }
    }

    if (value && !seen.has(value)) {
      seen.add(value)
      found.push({ value, points, bounds })
    }
    maskRgbaRegion(copy, width, height, bounds)
    reader.reset()
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
  return all[0].value
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
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
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

function rankDetections(detections: QrDetection[]): QrDetection[] {
  const rankedValues = rankTotpQrCandidates(detections.map((d) => d.value))
  const byValue = new Map<string, QrDetection>()
  for (const d of detections) {
    if (!byValue.has(d.value)) byValue.set(d.value, d)
  }
  return rankedValues.map((v) => byValue.get(v)).filter((d): d is QrDetection => d != null)
}

/** Decode all QR payloads from a data URL (multi-QR + multi-scale) with geometry. */
export async function decodeAllQrFromDataUrl(dataUrl: string): Promise<QrDecodeBatch> {
  const img = await loadImageFromDataUrl(dataUrl)
  const imageWidth = img.naturalWidth || img.width
  const imageHeight = img.naturalHeight || img.height
  const collected: QrDetection[] = []

  for (const scale of SCALE_FACTORS) {
    const scaled = drawScaledImageData(img, scale)
    if (!scaled) continue
    const hits = decodeAllQrFromImageData(scaled.data, scaled.width, scaled.height)
    for (const hit of hits) {
      collected.push(scaleDetection(hit, scale))
    }
  }

  return {
    detections: rankDetections(collected),
    imageWidth,
    imageHeight,
  }
}

/** Decode the first QR code found in a data URL image (e.g. tab screenshot). */
export async function decodeQrFromDataUrl(dataUrl: string): Promise<string> {
  const { detections } = await decodeAllQrFromDataUrl(dataUrl)
  if (detections.length === 0) {
    throw new TotpQrDecodeError('no_qr')
  }
  return detections[0].value
}

/**
 * Decode QR from data URL and validate as TOTP secret / otpauth URI.
 * Tries every detected QR until one validates.
 */
export async function decodeTotpQrFromDataUrl(
  dataUrl: string,
  validate: (value: string) => Promise<void>,
): Promise<string> {
  const { detections } = await decodeAllQrFromDataUrl(dataUrl)
  if (detections.length === 0) {
    throw new TotpQrDecodeError('no_qr')
  }

  let sawEmpty = false
  for (const det of detections) {
    let value: string
    try {
      value = normalizeTotpQrPayload(det.value)
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

  if (sawEmpty && detections.every((c) => !c.value.trim())) {
    throw new TotpQrDecodeError('empty')
  }
  throw new TotpQrDecodeError('invalid_totp')
}
