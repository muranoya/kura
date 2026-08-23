// TOTP QR scan mode — page overlay + screenshot decode

import enLocale from '../popup/i18n/locales/en.json'
import jaLocale from '../popup/i18n/locales/ja.json'
import { STORAGE_KEYS } from '../shared/constants'
import {
  decodeAllQrFromDataUrl,
  normalizeTotpQrPayload,
  summarizeTotpQrCandidate,
  TotpQrDecodeError,
} from '../shared/totp-qr'
import { applyTotpQrValue, cancelTotpQrScan, captureTotpQrScreenshot } from './messaging'
import overlayCss from './totp-qr-scan.css?inline'

const CONTAINER_ID = 'kura-totp-qr-overlay'

const RESCAN_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>'

let isActive = false
let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let toolbarEl: HTMLElement | null = null
let headerEl: HTMLElement | null = null
let titleEl: HTMLElement | null = null
let descEl: HTMLElement | null = null
let statusEl: HTMLElement | null = null
let buttonsEl: HTMLElement | null = null
let pickListEl: HTMLElement | null = null
let scanBtn: HTMLButtonElement | null = null
let saveBtn: HTMLButtonElement | null = null
let rescanBtn: HTMLButtonElement | null = null
let cancelBtn: HTMLButtonElement | null = null
let scanning = false
let applying = false
let selectedValue: string | null = null

type OverlayStrings = typeof enLocale.content.totpQr

const STRINGS: Record<'en' | 'ja', OverlayStrings> = {
  en: enLocale.content.totpQr,
  ja: jaLocale.content.totpQr,
}

let t: OverlayStrings = STRINGS.en

function detectLangFromNavigator(): 'en' | 'ja' {
  const raw = (navigator.language || '').toLowerCase()
  return raw.split('-')[0] === 'ja' ? 'ja' : 'en'
}

async function resolveOverlayStrings(): Promise<OverlayStrings> {
  let lang: 'en' | 'ja' = detectLangFromNavigator()
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get([STORAGE_KEYS.APP_SETTINGS])
      const settings = result?.[STORAGE_KEYS.APP_SETTINGS] as { language?: string } | undefined
      if (settings?.language === 'ja' || settings?.language === 'en') {
        lang = settings.language
      }
    }
  } catch {
    // fall back to navigator
  }
  return STRINGS[lang]
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

  // Inline the CSS into the shadow root so the overlay never depends on an
  // external stylesheet fetch (avoids stale/unloaded CSS breaking layout).
  const style = document.createElement('style')
  style.textContent = overlayCss
  shadowRoot.appendChild(style)

  return shadowRoot
}

function setStatus(text: string, kind: 'idle' | 'error' | 'success' | 'busy') {
  if (!statusEl) return
  statusEl.textContent = text
  statusEl.className = `kura-totp-qr-status kura-totp-qr-status-${kind}`
}

function setScanBtnVisible(visible: boolean) {
  if (!scanBtn) return
  scanBtn.style.display = visible ? '' : 'none'
  scanBtn.hidden = !visible
}

function setRescanBtnVisible(visible: boolean) {
  if (!rescanBtn) return
  rescanBtn.style.display = visible ? '' : 'none'
  rescanBtn.hidden = !visible
}

function clearPickUi() {
  pickListEl?.remove()
  pickListEl = null
  selectedValue = null
  saveBtn?.remove()
  saveBtn = null
  setRescanBtnVisible(false)
  toolbarEl?.classList.remove('kura-totp-qr-toolbar-pick')
}

function restoreScanButtons() {
  if (!buttonsEl) return
  buttonsEl.replaceChildren()
  if (scanBtn) {
    setScanBtnVisible(true)
    scanBtn.disabled = false
    scanBtn.textContent = t.scan
    buttonsEl.append(scanBtn)
  }
  if (cancelBtn) buttonsEl.append(cancelBtn)
}

function setScanMode() {
  clearPickUi()
  if (descEl) descEl.textContent = t.desc
  setStatus(t.idle, 'idle')
  restoreScanButtons()
}

function formatCandidateTitle(summary: ReturnType<typeof summarizeTotpQrCandidate>): string {
  if (summary.kind === 'secret') return t.secretKind
  return summary.issuer || summary.account || t.otpauthKind
}

function formatCandidateMeta(summary: ReturnType<typeof summarizeTotpQrCandidate>): string {
  const parts: string[] = []
  if (summary.kind === 'otpauth') {
    const digits = summary.digits || '6'
    const period = summary.period || '30'
    parts.push(t.digitsPeriod.replace('{{digits}}', digits).replace('{{period}}', period))
  }
  parts.push(t.secretLabel.replace('{{masked}}', summary.secretMasked))
  return parts.join(' · ')
}

function setSelectedValue(value: string) {
  selectedValue = value
  if (saveBtn) saveBtn.disabled = false
  for (const el of pickListEl?.querySelectorAll('.kura-totp-qr-pick-item') ?? []) {
    const item = el as HTMLElement
    const match = item.dataset.value === value
    item.classList.toggle('kura-totp-qr-pick-item-selected', match)
    item.setAttribute('aria-selected', match ? 'true' : 'false')
  }
}

function showCandidatePicker(values: string[]) {
  if (!toolbarEl || !buttonsEl || !scanBtn) return

  clearPickUi()
  toolbarEl.classList.add('kura-totp-qr-toolbar-pick')

  if (descEl) {
    descEl.textContent =
      values.length === 1 ? t.selectOne : t.selectMany.replace('{{count}}', String(values.length))
  }
  setStatus(t.idle, 'idle')
  setScanBtnVisible(false)
  setRescanBtnVisible(true)

  pickListEl = document.createElement('div')
  pickListEl.className = 'kura-totp-qr-pick-list'
  pickListEl.setAttribute('role', 'listbox')
  pickListEl.setAttribute('aria-label', t.title)

  values.forEach((value, index) => {
    const summary = summarizeTotpQrCandidate(value)
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'kura-totp-qr-pick-item'
    item.dataset.value = value
    item.setAttribute('role', 'option')
    item.setAttribute('aria-selected', 'false')

    // "1. ACME Co" — number inline with title (no wasted row)
    const title = document.createElement('div')
    title.className = 'kura-totp-qr-pick-title'
    title.textContent = `${index + 1}. ${formatCandidateTitle(summary)}`

    item.appendChild(title)

    if (summary.kind === 'otpauth' && summary.account && summary.account !== summary.issuer) {
      const account = document.createElement('div')
      account.className = 'kura-totp-qr-pick-account'
      account.textContent = summary.account
      item.appendChild(account)
    }

    const meta = document.createElement('div')
    meta.className = 'kura-totp-qr-pick-meta'
    meta.textContent = formatCandidateMeta(summary)
    item.appendChild(meta)

    item.addEventListener('click', () => {
      setSelectedValue(value)
    })
    pickListEl?.appendChild(item)
  })

  if (statusEl) {
    toolbarEl.insertBefore(pickListEl, statusEl)
  } else {
    toolbarEl.appendChild(pickListEl)
  }

  if (values.length === 1) {
    setSelectedValue(values[0])
  }

  saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'kura-totp-qr-btn kura-totp-qr-btn-primary'
  saveBtn.textContent = t.save
  saveBtn.disabled = selectedValue == null
  saveBtn.addEventListener('click', () => {
    void onSaveClick()
  })

  // Button row: Save + Cancel side by side (rescan lives in the header)
  buttonsEl.replaceChildren()
  buttonsEl.append(saveBtn)
  if (cancelBtn) buttonsEl.append(cancelBtn)
}

function renderToolbar() {
  if (!shadowRoot) return

  if (toolbarEl) toolbarEl.remove()
  clearPickUi()

  toolbarEl = document.createElement('div')
  toolbarEl.className = 'kura-totp-qr-toolbar'
  toolbarEl.style.pointerEvents = 'auto'

  headerEl = document.createElement('div')
  headerEl.className = 'kura-totp-qr-header'

  titleEl = document.createElement('div')
  titleEl.className = 'kura-totp-qr-title'
  titleEl.textContent = t.title

  rescanBtn = document.createElement('button')
  rescanBtn.type = 'button'
  rescanBtn.className = 'kura-totp-qr-icon-btn'
  rescanBtn.title = t.rescan
  rescanBtn.setAttribute('aria-label', t.rescan)
  rescanBtn.innerHTML = RESCAN_ICON_SVG
  rescanBtn.addEventListener('click', () => {
    setScanMode()
  })
  setRescanBtnVisible(false)

  headerEl.append(titleEl, rescanBtn)

  descEl = document.createElement('div')
  descEl.className = 'kura-totp-qr-desc'
  descEl.textContent = t.desc

  statusEl = document.createElement('div')
  statusEl.className = 'kura-totp-qr-status kura-totp-qr-status-idle'
  statusEl.textContent = t.idle

  buttonsEl = document.createElement('div')
  buttonsEl.className = 'kura-totp-qr-buttons'

  scanBtn = document.createElement('button')
  scanBtn.type = 'button'
  scanBtn.className = 'kura-totp-qr-btn kura-totp-qr-btn-primary'
  scanBtn.textContent = t.scan
  scanBtn.addEventListener('click', () => {
    void onScanClick()
  })

  cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'kura-totp-qr-btn kura-totp-qr-btn-secondary'
  cancelBtn.textContent = t.cancel
  cancelBtn.addEventListener('click', () => {
    void stopTotpQrScanMode(true)
  })

  buttonsEl.append(scanBtn, cancelBtn)
  toolbarEl.append(headerEl, descEl, statusEl, buttonsEl)
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

async function onSaveClick() {
  if (applying || !selectedValue || !saveBtn) return
  applying = true
  saveBtn.disabled = true
  if (rescanBtn) rescanBtn.disabled = true
  saveBtn.textContent = t.saving
  setStatus(t.saving, 'busy')

  try {
    const applyResult = await applyTotpQrValue(selectedValue)
    if (applyResult.success) {
      setStatus(t.success, 'success')
      showToast(t.success)
      setTimeout(() => {
        void stopTotpQrScanMode(false)
      }, 800)
      return
    }

    const err = applyResult.error || ''
    if (err === 'empty') setStatus(t.empty, 'error')
    else if (err === 'invalid_totp') setStatus(t.invalid, 'error')
    else setStatus(t.applyFailed, 'error')

    saveBtn.disabled = false
    if (rescanBtn) rescanBtn.disabled = false
    saveBtn.textContent = t.save
  } catch {
    setStatus(t.applyFailed, 'error')
    saveBtn.disabled = false
    if (rescanBtn) rescanBtn.disabled = false
    saveBtn.textContent = t.save
  } finally {
    applying = false
  }
}

async function onScanClick() {
  if (scanning || !scanBtn) return
  scanning = true
  clearPickUi()
  restoreScanButtons()
  if (descEl) descEl.textContent = t.desc
  scanBtn.disabled = true
  scanBtn.textContent = t.scanning
  setStatus(t.scanning, 'busy')
  // Hide overlay so it is not baked into the screenshot / does not cover QRs
  setToolbarVisible(false)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const dataUrl = await captureTotpQrScreenshot()
    setToolbarVisible(true)
    if (!dataUrl) {
      setStatus(t.captureFailed, 'error')
      return
    }

    let batch: Awaited<ReturnType<typeof decodeAllQrFromDataUrl>>
    try {
      batch = await decodeAllQrFromDataUrl(dataUrl)
    } catch {
      setStatus(t.noQr, 'error')
      return
    }

    if (batch.detections.length === 0) {
      setStatus(t.noQr, 'error')
      return
    }

    const values: string[] = []
    let sawEmpty = false
    for (const det of batch.detections) {
      try {
        values.push(normalizeTotpQrPayload(det.value))
      } catch (err) {
        if (err instanceof TotpQrDecodeError && err.code === 'empty') sawEmpty = true
      }
    }

    if (values.length === 0) {
      if (sawEmpty) setStatus(t.empty, 'error')
      else setStatus(t.invalid, 'error')
      return
    }

    // Always confirm — never auto-apply (malicious page QR risk)
    showCandidatePicker(values)
  } catch {
    setToolbarVisible(true)
    setStatus(t.captureFailed, 'error')
  } finally {
    setToolbarVisible(true)
    scanning = false
    if (scanBtn && !pickListEl) {
      scanBtn.disabled = false
      scanBtn.textContent = t.scan
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

export async function startTotpQrScanMode() {
  if (isActive) return
  isActive = true
  scanning = false
  applying = false
  t = await resolveOverlayStrings()
  if (!isActive) return
  ensureShadowHost()
  renderToolbar()
  document.addEventListener('keydown', onKeydown, true)
}

export async function stopTotpQrScanMode(notifyCancel: boolean) {
  if (!isActive && !shadowHost) return
  isActive = false
  scanning = false
  applying = false
  document.removeEventListener('keydown', onKeydown, true)
  if (notifyCancel) {
    await cancelTotpQrScan()
  }
  clearPickUi()
  toolbarEl?.remove()
  toolbarEl = null
  headerEl = null
  titleEl = null
  descEl = null
  statusEl = null
  buttonsEl = null
  scanBtn = null
  rescanBtn = null
  cancelBtn = null
  shadowHost?.remove()
  shadowHost = null
  shadowRoot = null
}

export function onVaultLockedDuringTotpQrScan() {
  if (!isActive) return
  showToast(t.locked)
  void stopTotpQrScanMode(false)
}
