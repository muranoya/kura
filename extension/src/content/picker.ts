// カスタムフィールドのオートフィルセレクタ ピッカー — content script側
//
// 既存の手動キャプチャUI（capture.ts）のShadow DOM hostパターン・ホバーハイライト・
// トースト表示パターンを踏襲するが、role選択popoverは不要（要素を選ぶだけでクリック
// ＝即選択）。
// 詳細: docs/extension-custom-field-autofill.md 4-4節

import enLocale from '../popup/i18n/locales/en.json'
import jaLocale from '../popup/i18n/locales/ja.json'
import { STORAGE_KEYS } from '../shared/constants'
import type { CustomFieldSelector } from '../shared/types'
import { cancelPicker, sendPickerResult } from './messaging'
import overlayCss from './picker.css?inline'

const CONTAINER_ID = 'kura-picker-overlay'

let isActive = false
let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let bannerEl: HTMLElement | null = null
let toastEl: HTMLElement | null = null
let currentHoverTarget: HTMLInputElement | null = null
let activeFieldId: string | null = null

type OverlayStrings = typeof enLocale.content.picker

const STRINGS: Record<'en' | 'ja', OverlayStrings> = {
  en: enLocale.content.picker,
  ja: jaLocale.content.picker,
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

// ========== Shadow DOM host ==========

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

  const style = document.createElement('style')
  style.textContent = overlayCss
  shadowRoot.appendChild(style)

  return shadowRoot
}

function renderBanner() {
  if (!shadowRoot) return
  if (bannerEl) bannerEl.remove()

  bannerEl = document.createElement('div')
  bannerEl.className = 'kura-picker-banner'
  bannerEl.style.pointerEvents = 'auto'

  const text = document.createElement('span')
  text.className = 'kura-picker-banner-text'
  text.textContent = t.banner
  bannerEl.appendChild(text)

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'kura-picker-cancel-btn'
  cancelBtn.textContent = t.cancel
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void cancelPicker()
    stopPickerMode()
  })
  bannerEl.appendChild(cancelBtn)

  shadowRoot.appendChild(bannerEl)
}

/**
 * shadowRootが既に片付け済み（ピッカー終了後）でも表示できるよう、その場合は
 * 専用の一時シャドウホストを作ってそこにトーストを出す（capture.tsのshowToastと
 * 同じフォールバックパターン）。
 */
function showToast(message: string) {
  if (!shadowRoot) {
    const tempHost = document.createElement('div')
    tempHost.setAttribute(
      'style',
      'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;',
    )
    document.body.appendChild(tempHost)
    const tempRoot = tempHost.attachShadow({ mode: 'closed' })

    const style = document.createElement('style')
    style.textContent = overlayCss
    tempRoot.appendChild(style)

    const toast = document.createElement('div')
    toast.className = 'kura-picker-toast'
    toast.textContent = message
    tempRoot.appendChild(toast)

    setTimeout(() => tempHost.remove(), 2500)
    return
  }

  if (toastEl) toastEl.remove()

  toastEl = document.createElement('div')
  toastEl.className = 'kura-picker-toast'
  toastEl.textContent = message
  shadowRoot.appendChild(toastEl)

  setTimeout(() => {
    if (toastEl) {
      toastEl.remove()
      toastEl = null
    }
  }, 2500)
}

// ========== Field highlight ==========

function clearHoverStyle(el: HTMLInputElement) {
  el.style.outline = ''
  el.style.outlineOffset = ''
  el.style.backgroundColor = ''
}

function onMouseOver(e: Event) {
  if (!isActive) return
  const target = e.target
  // V1では <input> 以外（<select>, <textarea>）は選択不可
  if (!(target instanceof HTMLInputElement)) return
  if (target === currentHoverTarget) return

  currentHoverTarget = target
  target.style.outline = '2px solid #4f46e5'
  target.style.outlineOffset = '1px'
  target.style.backgroundColor = 'rgba(79, 70, 229, 0.05)'
}

function onMouseOut(e: Event) {
  if (!isActive) return
  const target = e.target
  if (!(target instanceof HTMLInputElement)) return
  if (target === currentHoverTarget) {
    currentHoverTarget = null
    clearHoverStyle(target)
  }
}

// ========== Field click → confirm selection ==========

function onFieldClick(e: Event) {
  if (!isActive) return
  const target = e.target
  if (!(target instanceof HTMLInputElement)) {
    // <input> 以外はV1では選択不可（クリックは無視するが、ページ本来の動作は
    // 妨げない方が安全なため preventDefault はしない）
    return
  }

  e.preventDefault()
  e.stopPropagation()

  // element.id ではなく getAttribute('id') を使うことで、id属性が空文字/未設定
  // であることを明確に区別する
  const selector: CustomFieldSelector = {
    tag: target.tagName.toLowerCase(),
    name: target.getAttribute('name') ?? undefined,
    id: target.getAttribute('id') ?? undefined,
    type: target.getAttribute('type') ?? undefined,
  }

  void applySelection(selector)
}

async function applySelection(selector: CustomFieldSelector) {
  if (!activeFieldId) return
  const fieldId = activeFieldId

  stopPickerMode()

  const result = await sendPickerResult(fieldId, selector)
  if (result.success) {
    showToast(t.success)
  } else {
    console.error('[kura:picker:cs]', 'sendPickerResult failed:', result.error)
    showToast(t.applyFailed)
  }
}

// ========== Keyboard ==========

function onKeydown(e: KeyboardEvent) {
  if (!isActive) return
  if (e.key === 'Escape') {
    e.preventDefault()
    void cancelPicker()
    stopPickerMode()
  }
}

// ========== Public API ==========

export async function startPickerMode(fieldId: string) {
  if (isActive) return
  isActive = true
  activeFieldId = fieldId
  currentHoverTarget = null

  t = await resolveOverlayStrings()

  ensureShadowHost()
  renderBanner()

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('mouseout', onMouseOut, true)
  document.addEventListener('click', onFieldClick, true)
  document.addEventListener('keydown', onKeydown, true)
}

export function stopPickerMode() {
  if (!isActive) return
  isActive = false
  activeFieldId = null

  document.removeEventListener('mouseover', onMouseOver, true)
  document.removeEventListener('mouseout', onMouseOut, true)
  document.removeEventListener('click', onFieldClick, true)
  document.removeEventListener('keydown', onKeydown, true)

  if (currentHoverTarget) {
    clearHoverStyle(currentHoverTarget)
    currentHoverTarget = null
  }

  if (bannerEl) {
    bannerEl.remove()
    bannerEl = null
  }

  if (shadowHost) {
    shadowHost.remove()
    shadowHost = null
    shadowRoot = null
  }
}

export function isPickerActive(): boolean {
  return isActive
}

export function onVaultLockedDuringPicker() {
  if (!isActive) return
  stopPickerMode()
  showToast(t.locked)
}
