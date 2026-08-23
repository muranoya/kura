// TOTP QR scan mode — page overlay + screenshot decode

import {
  decodeAllQrFromDataUrl,
  normalizeTotpQrPayload,
  TotpQrDecodeError,
} from '../shared/totp-qr'
import { applyTotpQrValue, cancelTotpQrScan, captureTotpQrScreenshot } from './messaging'

const CONTAINER_ID = 'kura-totp-qr-overlay'

let isActive = false
let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let toolbarEl: HTMLElement | null = null
let statusEl: HTMLElement | null = null
let scanBtn: HTMLButtonElement | null = null
let scanning = false

const ja = {
  title: 'kura: TOTP QR スキャン',
  desc: 'このページに表示されている TOTP の QR コードを読み取ります。見えている位置に合わせて [スキャン] を押してください。',
  scan: 'スキャン',
  scanning: '読み取り中…',
  cancel: 'キャンセル',
  idle: '',
  success: 'TOTP を保存しました',
  noQr: 'QR コードが見つかりません。スクロールして再試行してください。',
  empty: 'QR コードが空でした',
  invalid: 'TOTP 用の QR コードではありません',
  captureFailed: '画面のキャプチャに失敗しました',
  applyFailed: '保存に失敗しました',
  locked: 'Vault がロックされたため終了しました',
}

function ensureShadowHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  shadowHost = document.createElement('div')
  shadowHost.id = CONTAINER_ID
  shadowHost.setAttribute(
    'style',
    'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;',
  )
  document.body.appendChild(shadowHost)
  shadowRoot = shadowHost.attachShadow({ mode: 'closed' })

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = chrome.runtime.getURL('src/content/totp-qr-scan.css')
  shadowRoot.appendChild(link)

  return shadowRoot
}

function setStatus(text: string, kind: 'idle' | 'error' | 'success' | 'busy') {
  if (!statusEl) return
  statusEl.textContent = text
  statusEl.className = `kura-totp-qr-status kura-totp-qr-status-${kind}`
}

function renderToolbar() {
  if (!shadowRoot) return

  if (toolbarEl) toolbarEl.remove()

  toolbarEl = document.createElement('div')
  toolbarEl.className = 'kura-totp-qr-toolbar'
  toolbarEl.style.pointerEvents = 'auto'

  const title = document.createElement('div')
  title.className = 'kura-totp-qr-title'
  title.textContent = ja.title

  const desc = document.createElement('div')
  desc.className = 'kura-totp-qr-desc'
  desc.textContent = ja.desc

  statusEl = document.createElement('div')
  statusEl.className = 'kura-totp-qr-status kura-totp-qr-status-idle'
  statusEl.textContent = ja.idle

  const buttons = document.createElement('div')
  buttons.className = 'kura-totp-qr-buttons'

  scanBtn = document.createElement('button')
  scanBtn.type = 'button'
  scanBtn.className = 'kura-totp-qr-btn kura-totp-qr-btn-scan'
  scanBtn.textContent = ja.scan
  scanBtn.addEventListener('click', () => {
    void onScanClick()
  })

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'kura-totp-qr-btn kura-totp-qr-btn-cancel'
  cancelBtn.textContent = ja.cancel
  cancelBtn.addEventListener('click', () => {
    void stopTotpQrScanMode(true)
  })

  buttons.append(scanBtn, cancelBtn)
  toolbarEl.append(title, desc, statusEl, buttons)
  shadowRoot.appendChild(toolbarEl)
}

function showToast(message: string) {
  const root = shadowRoot ?? ensureShadowHost()
  const existing = root.querySelector('.kura-totp-qr-toast')
  existing?.remove()

  const toast = document.createElement('div')
  toast.className = 'kura-totp-qr-toast'
  toast.textContent = message
  toast.style.pointerEvents = 'none'
  root.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}

function setToolbarVisible(visible: boolean) {
  if (toolbarEl) {
    toolbarEl.style.visibility = visible ? 'visible' : 'hidden'
  }
}

async function onScanClick() {
  if (scanning || !scanBtn) return
  scanning = true
  scanBtn.disabled = true
  scanBtn.textContent = ja.scanning
  setStatus(ja.scanning, 'busy')
  // Hide overlay so it is not baked into the screenshot / does not cover QRs
  setToolbarVisible(false)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const dataUrl = await captureTotpQrScreenshot()
    setToolbarVisible(true)
    if (!dataUrl) {
      setStatus(ja.captureFailed, 'error')
      return
    }

    let candidates: string[]
    try {
      candidates = await decodeAllQrFromDataUrl(dataUrl)
    } catch {
      setStatus(ja.noQr, 'error')
      return
    }

    if (candidates.length === 0) {
      setStatus(ja.noQr, 'error')
      return
    }

    let lastError: 'invalid_totp' | 'empty' | 'apply' = 'invalid_totp'
    for (const raw of candidates) {
      let value: string
      try {
        value = normalizeTotpQrPayload(raw)
      } catch (err) {
        if (err instanceof TotpQrDecodeError && err.code === 'empty') lastError = 'empty'
        continue
      }

      const applyResult = await applyTotpQrValue(value)
      if (applyResult.success) {
        setStatus(ja.success, 'success')
        showToast(ja.success)
        setTimeout(() => {
          void stopTotpQrScanMode(false)
        }, 800)
        return
      }

      const err = applyResult.error || ''
      if (err === 'empty') lastError = 'empty'
      else if (err === 'invalid_totp') lastError = 'invalid_totp'
      else lastError = 'apply'
    }

    if (lastError === 'empty') setStatus(ja.empty, 'error')
    else if (lastError === 'apply') setStatus(ja.applyFailed, 'error')
    else setStatus(ja.invalid, 'error')
  } catch {
    setToolbarVisible(true)
    setStatus(ja.captureFailed, 'error')
  } finally {
    setToolbarVisible(true)
    scanning = false
    if (scanBtn) {
      scanBtn.disabled = false
      scanBtn.textContent = ja.scan
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    void stopTotpQrScanMode(true)
  }
}

export function isTotpQrScanActive(): boolean {
  return isActive
}

export function startTotpQrScanMode() {
  if (isActive) return
  isActive = true
  scanning = false
  ensureShadowHost()
  renderToolbar()
  document.addEventListener('keydown', onKeydown, true)
}

export async function stopTotpQrScanMode(notifyCancel: boolean) {
  if (!isActive && !shadowHost) return
  isActive = false
  scanning = false
  document.removeEventListener('keydown', onKeydown, true)
  if (notifyCancel) {
    await cancelTotpQrScan()
  }
  toolbarEl?.remove()
  toolbarEl = null
  statusEl = null
  scanBtn = null
  shadowHost?.remove()
  shadowHost = null
  shadowRoot = null
}

export function onVaultLockedDuringTotpQrScan() {
  if (!isActive) return
  showToast(ja.locked)
  void stopTotpQrScanMode(false)
}
