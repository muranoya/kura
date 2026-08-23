// Re-export shared TOTP QR helpers for popup / tests
export {
  decodeAllQrFromDataUrl,
  decodeAllQrFromImageData,
  decodeQrFromDataUrl,
  decodeQrFromImageData,
  decodeTotpQrFromDataUrl,
  normalizeTotpQrPayload,
  rankTotpQrCandidates,
  TotpQrDecodeError,
  type TotpQrErrorCode,
} from '../../shared/totp-qr'
