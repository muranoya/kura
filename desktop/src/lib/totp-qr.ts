import jsQR from 'jsqr'

export type TotpQrErrorCode = 'no_qr' | 'empty' | 'invalid_totp'

export class TotpQrDecodeError extends Error {
  readonly code: TotpQrErrorCode

  constructor(code: TotpQrErrorCode) {
    super(code)
    this.name = 'TotpQrDecodeError'
    this.code = code
  }
}

/** Trim QR payload; empty after trim is rejected. */
export function normalizeTotpQrPayload(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new TotpQrDecodeError('empty')
  }
  return value
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new TotpQrDecodeError('no_qr'))
    }
    img.src = url
  })
}

/** Decode the first QR code found in an image file. */
export async function decodeQrFromImageFile(file: File): Promise<string> {
  const img = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  if (canvas.width === 0 || canvas.height === 0) {
    throw new TotpQrDecodeError('no_qr')
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new TotpQrDecodeError('no_qr')
  }
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = jsQR(imageData.data, imageData.width, imageData.height)
  if (!result?.data) {
    throw new TotpQrDecodeError('no_qr')
  }
  return result.data
}

/**
 * Decode QR from image and validate as TOTP secret / otpauth URI.
 * `validate` should throw if the value cannot generate a TOTP code.
 */
export async function decodeTotpQrFromImageFile(
  file: File,
  validate: (value: string) => Promise<void>,
): Promise<string> {
  const payload = await decodeQrFromImageFile(file)
  const value = normalizeTotpQrPayload(payload)
  try {
    await validate(value)
  } catch {
    throw new TotpQrDecodeError('invalid_totp')
  }
  return value
}
