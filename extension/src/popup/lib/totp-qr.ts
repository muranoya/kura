// Re-export shared TOTP QR helpers for popup / tests
export {
  decodeAllQrFromDataUrl,
  decodeAllQrFromImageData,
  decodeQrFromDataUrl,
  decodeQrFromImageData,
  decodeTotpQrFromDataUrl,
  maskSecretFragment,
  normalizeTotpQrPayload,
  type QrBounds,
  type QrDecodeBatch,
  type QrDetection,
  type QrPoint,
  rankTotpQrCandidates,
  summarizeTotpQrCandidate,
  type TotpQrCandidateSummary,
  TotpQrDecodeError,
  type TotpQrErrorCode,
} from '../../shared/totp-qr'
