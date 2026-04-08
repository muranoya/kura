// Manual credential capture mode (design doc Sections 1-6, 3-7)
// Allows users to select fields on a page and save credentials to vault.

import { saveCapturedCredential } from './messaging'

const LOG_PREFIX = '[kura:autofill:capture]'
const CONTAINER_ID = 'kura-capture-overlay'

// ========== State ==========

let isActive = false
let usernameField: HTMLInputElement | null = null
let passwordField: HTMLInputElement | null = null
let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let toolbarEl: HTMLElement | null = null
let popoverEl: HTMLElement | null = null
let toastEl: HTMLElement | null = null
let currentHoverTarget: HTMLInputElement | null = null
let nameInput: HTMLInputElement | null = null
// Badge elements attached to page DOM
const badges = new Map<HTMLInputElement, HTMLElement>()

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

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = chrome.runtime.getURL('src/content/capture.css')
  shadowRoot.appendChild(link)

  return shadowRoot
}

// ========== Toolbar ==========

function fieldLabel(field: HTMLInputElement): string {
  return field.name || field.id || '(選択済み)'
}

function renderToolbar() {
  if (!shadowRoot) return

  // Preserve current name input value before re-render
  const currentName = nameInput?.value ?? document.title

  if (toolbarEl) toolbarEl.remove()

  toolbarEl = document.createElement('div')
  toolbarEl.className = 'kura-capture-toolbar'
  toolbarEl.style.pointerEvents = 'auto'

  const title = document.createElement('div')
  title.className = 'kura-capture-title'
  title.textContent = 'kura: クレデンシャルキャプチャ'

  const desc = document.createElement('div')
  desc.className = 'kura-capture-desc'
  desc.textContent = 'ユーザー名・パスワードの入力欄を選択するとログイン情報を簡単に保存できます。'

  // Entry name input
  const nameRow = document.createElement('div')
  nameRow.className = 'kura-capture-name-row'

  const nameLabel = document.createElement('label')
  nameLabel.className = 'kura-capture-name-label'
  nameLabel.textContent = 'アイテム名'

  nameInput = document.createElement('input')
  nameInput.className = 'kura-capture-name-input'
  nameInput.type = 'text'
  nameInput.value = currentName
  nameInput.placeholder = 'アイテム名を入力'

  nameRow.appendChild(nameLabel)
  nameRow.appendChild(nameInput)

  // Summary tags
  const summary = document.createElement('div')
  summary.className = 'kura-capture-summary'

  const uField = usernameField
  const pField = passwordField
  summary.appendChild(
    createTag('ユーザー名', uField, uField ? () => unassignRole(uField) : undefined),
  )
  summary.appendChild(
    createTag('パスワード', pField, pField ? () => unassignRole(pField) : undefined),
  )

  // Buttons
  const buttons = document.createElement('div')
  buttons.className = 'kura-capture-buttons'

  const saveBtn = document.createElement('button')
  saveBtn.className = 'kura-capture-btn kura-capture-btn-save'
  saveBtn.textContent = '保存する'
  saveBtn.disabled = !passwordField
  saveBtn.addEventListener('click', onSave)

  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'kura-capture-btn kura-capture-btn-cancel'
  cancelBtn.textContent = 'キャンセル'
  cancelBtn.addEventListener('click', () => stopCaptureMode())

  buttons.appendChild(saveBtn)
  buttons.appendChild(cancelBtn)

  toolbarEl.appendChild(title)
  toolbarEl.appendChild(desc)
  toolbarEl.appendChild(nameRow)
  toolbarEl.appendChild(summary)
  toolbarEl.appendChild(buttons)
  shadowRoot.appendChild(toolbarEl)
}

function createTag(
  label: string,
  field: HTMLInputElement | null,
  onClear: (() => void) | undefined,
): HTMLElement {
  const tag = document.createElement('span')
  tag.className = field ? 'kura-capture-tag kura-capture-tag-set' : 'kura-capture-tag'

  const text = document.createElement('span')
  text.textContent = field ? `${label}: ${fieldLabel(field)}` : `${label}: 未選択`
  tag.appendChild(text)

  if (field) {
    const clearBtn = document.createElement('button')
    clearBtn.className = 'kura-capture-tag-clear'
    clearBtn.textContent = '\u00d7' // ×
    clearBtn.title = '選択を解除'
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClear()
    })
    tag.appendChild(clearBtn)
  }

  return tag
}

// ========== Field highlight ==========

function onMouseOver(e: Event) {
  if (!isActive) return
  const target = e.target
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
  }
  // Restore styles unless this field is selected
  if (target !== usernameField && target !== passwordField) {
    target.style.outline = ''
    target.style.outlineOffset = ''
    target.style.backgroundColor = ''
  }
}

// ========== Field click → role selection popover ==========

function onFieldClick(e: Event) {
  if (!isActive) return
  const target = e.target
  if (!(target instanceof HTMLInputElement)) return

  e.preventDefault()
  e.stopPropagation()

  showPopover(target)
}

function showPopover(anchor: HTMLInputElement) {
  if (!shadowRoot) return
  hidePopover()

  const field = anchor

  popoverEl = document.createElement('div')
  popoverEl.className = 'kura-capture-popover'
  popoverEl.style.pointerEvents = 'auto'

  const rect = anchor.getBoundingClientRect()
  popoverEl.style.left = `${rect.left}px`
  popoverEl.style.top = `${rect.bottom + 4}px`

  const makeBtn = (label: string, onClick: () => void) => {
    const btn = document.createElement('button')
    btn.className = 'kura-capture-popover-btn'
    btn.textContent = label
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return btn
  }

  popoverEl.appendChild(
    makeBtn('ユーザー名', () => {
      assignRole(field, 'username')
      hidePopover()
    }),
  )
  popoverEl.appendChild(
    makeBtn('パスワード', () => {
      assignRole(field, 'password')
      hidePopover()
    }),
  )
  const divider = document.createElement('div')
  divider.className = 'kura-capture-popover-divider'
  popoverEl.appendChild(divider)

  const closeBtn = makeBtn('閉じる', () => {
    hidePopover()
  })
  closeBtn.classList.add('kura-capture-popover-btn-secondary')
  popoverEl.appendChild(closeBtn)

  shadowRoot.appendChild(popoverEl)
}

function hidePopover() {
  if (popoverEl) {
    popoverEl.remove()
    popoverEl = null
  }
}

// ========== Role assignment ==========

function assignRole(field: HTMLInputElement, role: 'username' | 'password') {
  // If another field had this role, unassign it
  if (role === 'username' && usernameField && usernameField !== field) {
    unassignRole(usernameField)
  }
  if (role === 'password' && passwordField && passwordField !== field) {
    unassignRole(passwordField)
  }

  if (role === 'username') {
    usernameField = field
  } else {
    passwordField = field
  }

  // Visual feedback
  field.style.outline = '2px solid #4f46e5'
  field.style.outlineOffset = '1px'
  field.style.backgroundColor = 'rgba(79, 70, 229, 0.08)'

  updateBadge(field, role)
  renderToolbar()
}

function unassignRole(field: HTMLInputElement) {
  if (field === usernameField) usernameField = null
  if (field === passwordField) passwordField = null

  field.style.outline = ''
  field.style.outlineOffset = ''
  field.style.backgroundColor = ''

  removeBadge(field)
  renderToolbar()
}

// ========== Badges ==========

function updateBadge(field: HTMLInputElement, role: 'username' | 'password') {
  removeBadge(field)

  const badge = document.createElement('div')
  badge.className = 'kura-capture-badge'
  badge.textContent = role === 'username' ? 'ユーザー名' : 'パスワード'
  badge.style.cssText = `
    position: absolute;
    background: #4f46e5;
    color: white;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: none;
  `

  // Position badge above the field
  const rect = field.getBoundingClientRect()
  badge.style.left = `${rect.left + window.scrollX}px`
  badge.style.top = `${rect.top + window.scrollY - 18}px`

  document.body.appendChild(badge)
  badges.set(field, badge)
}

function removeBadge(field: HTMLInputElement) {
  const existing = badges.get(field)
  if (existing) {
    existing.remove()
    badges.delete(field)
  }
}

function removeAllBadges() {
  for (const [, badge] of badges) {
    badge.remove()
  }
  badges.clear()
}

// ========== Save ==========

async function onSave() {
  if (!passwordField) return

  const url = window.location.href
  const name = nameInput?.value?.trim() || null
  const username = usernameField?.value || null
  const password = passwordField.value

  if (!password) {
    showToast('パスワードが空です', false)
    return
  }

  console.log(LOG_PREFIX, `Saving captured credential for ${url}`)

  try {
    const result = await saveCapturedCredential(url, name, username, password)
    if (result.success) {
      showToast('クレデンシャルを保存しました', true)
    } else {
      showToast(`保存に失敗しました: ${result.error || '不明なエラー'}`, false)
    }
  } catch (e) {
    showToast('保存に失敗しました', false)
    console.error(LOG_PREFIX, 'Save error:', e)
  }

  stopCaptureMode()
}

// ========== Toast ==========

function showToast(message: string, isSuccess: boolean) {
  if (!shadowRoot) {
    // If shadow root was already cleaned up, create a temporary one
    const tempHost = document.createElement('div')
    tempHost.setAttribute(
      'style',
      'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;',
    )
    document.body.appendChild(tempHost)
    const tempRoot = tempHost.attachShadow({ mode: 'closed' })

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = chrome.runtime.getURL('src/content/capture.css')
    tempRoot.appendChild(link)

    const toast = document.createElement('div')
    toast.className = `kura-capture-toast ${isSuccess ? 'kura-capture-toast-success' : 'kura-capture-toast-error'}`
    toast.style.pointerEvents = 'auto'
    toast.textContent = message
    tempRoot.appendChild(toast)

    setTimeout(() => tempHost.remove(), 3000)
    return
  }

  if (toastEl) toastEl.remove()

  toastEl = document.createElement('div')
  toastEl.className = `kura-capture-toast ${isSuccess ? 'kura-capture-toast-success' : 'kura-capture-toast-error'}`
  toastEl.style.pointerEvents = 'auto'
  toastEl.textContent = message
  shadowRoot.appendChild(toastEl)

  setTimeout(() => {
    if (toastEl) {
      toastEl.remove()
      toastEl = null
    }
  }, 3000)
}

// ========== Keyboard ==========

function onKeydown(e: KeyboardEvent) {
  if (!isActive) return
  if (e.key === 'Escape') {
    e.preventDefault()
    stopCaptureMode()
  }
}

// ========== Public API ==========

export function startCaptureMode() {
  if (isActive) return
  isActive = true
  usernameField = null
  passwordField = null
  nameInput = null

  console.log(LOG_PREFIX, 'Starting capture mode')

  ensureShadowHost()
  renderToolbar()

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('mouseout', onMouseOut, true)
  document.addEventListener('click', onFieldClick, true)
  document.addEventListener('keydown', onKeydown, true)
}

export function stopCaptureMode() {
  if (!isActive) return
  isActive = false

  console.log(LOG_PREFIX, 'Stopping capture mode')

  document.removeEventListener('mouseover', onMouseOver, true)
  document.removeEventListener('mouseout', onMouseOut, true)
  document.removeEventListener('click', onFieldClick, true)
  document.removeEventListener('keydown', onKeydown, true)

  // Clean up field styles
  if (usernameField) {
    usernameField.style.outline = ''
    usernameField.style.outlineOffset = ''
    usernameField.style.backgroundColor = ''
  }
  if (passwordField) {
    passwordField.style.outline = ''
    passwordField.style.outlineOffset = ''
    passwordField.style.backgroundColor = ''
  }
  if (currentHoverTarget) {
    currentHoverTarget.style.outline = ''
    currentHoverTarget.style.outlineOffset = ''
    currentHoverTarget.style.backgroundColor = ''
    currentHoverTarget = null
  }

  removeAllBadges()
  hidePopover()

  usernameField = null
  passwordField = null
  nameInput = null

  if (toolbarEl) {
    toolbarEl.remove()
    toolbarEl = null
  }
  if (shadowHost) {
    shadowHost.remove()
    shadowHost = null
    shadowRoot = null
  }
}

export function isCaptureActive(): boolean {
  return isActive
}

export function onVaultLockedDuringCapture() {
  if (!isActive) return
  showToast('Vaultがロックされました', false)
  stopCaptureMode()
}
