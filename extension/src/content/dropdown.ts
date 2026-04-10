// Shadow DOM dropdown UI for autofill credential candidates (design doc Section 9)

import type { AutofillCredentialCandidate } from '../shared/types'

const CONTAINER_ID = 'kura-autofill-dropdown'

let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let dropdownEl: HTMLElement | null = null
let currentAnchor: HTMLInputElement | null = null
let selectedIndex = -1
let currentCandidates: AutofillCredentialCandidate[] = []
let onSelectCallback: ((candidate: AutofillCredentialCandidate) => void) | null = null
let blurTimeout: ReturnType<typeof setTimeout> | null = null
let lockedMode = false
let onUnlockCallback: (() => void) | null = null
let currentPageProtocol: string | null = null
let lastAnchorRect: { top: number; left: number } | null = null
const SCROLL_HIDE_THRESHOLD = 100
let totpTimerInterval: ReturnType<typeof setInterval> | null = null

function ensureShadowHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  shadowHost = document.createElement('div')
  shadowHost.id = CONTAINER_ID
  shadowHost.setAttribute(
    'style',
    'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important;',
  )
  document.body.appendChild(shadowHost)

  shadowRoot = shadowHost.attachShadow({ mode: 'closed' })

  // Load styles from extension CSS file (CSP-safe)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = chrome.runtime.getURL('src/content/dropdown.css')
  shadowRoot.appendChild(link)

  return shadowRoot
}

function positionDropdown(anchor: HTMLInputElement) {
  if (!dropdownEl) return
  const rect = anchor.getBoundingClientRect()
  dropdownEl.style.left = `${rect.left}px`
  dropdownEl.style.top = `${rect.bottom + 4}px`
  dropdownEl.style.minWidth = `${Math.max(rect.width, 260)}px`
}

function getTotpRemaining(period: number): number {
  const now = Math.floor(Date.now() / 1000)
  return period - (now % period)
}

function updateTotpTimers() {
  if (!shadowRoot) return
  const timers = shadowRoot.querySelectorAll('.kura-totp-timer')
  for (const timer of timers) {
    const period = Number(timer.getAttribute('data-period'))
    if (!period) continue
    const remaining = getTotpRemaining(period)
    const ratio = remaining / period

    const textEl = timer.querySelector('.kura-totp-seconds') as HTMLElement | null
    if (textEl) textEl.textContent = `${remaining}s`

    const circle = timer.querySelector('.kura-totp-progress') as SVGCircleElement | null
    if (circle) {
      const circumference = 2 * Math.PI * 9
      circle.style.strokeDashoffset = String(circumference * (1 - ratio))
    }

    // Change color when time is running low (<= 5 seconds)
    if (remaining <= 5) {
      timer.classList.add('kura-totp-urgent')
    } else {
      timer.classList.remove('kura-totp-urgent')
    }
  }
}

function startTotpTimer() {
  stopTotpTimer()
  updateTotpTimers()
  totpTimerInterval = setInterval(updateTotpTimers, 1000)
}

function stopTotpTimer() {
  if (totpTimerInterval) {
    clearInterval(totpTimerInterval)
    totpTimerInterval = null
  }
}

function createTotpTimerEl(period: number): HTMLElement {
  const timer = document.createElement('div')
  timer.className = 'kura-totp-timer'
  timer.setAttribute('data-period', String(period))

  const circumference = 2 * Math.PI * 9
  const remaining = getTotpRemaining(period)
  const ratio = remaining / period

  timer.innerHTML =
    `<svg width="24" height="24" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="9" fill="none" stroke="#e5e7eb" stroke-width="2"/>` +
    `<circle class="kura-totp-progress" cx="12" cy="12" r="9" fill="none" stroke="#4f46e5" stroke-width="2" ` +
    `stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - ratio)}" ` +
    `stroke-linecap="round" transform="rotate(-90 12 12)"/>` +
    `</svg>` +
    `<span class="kura-totp-seconds">${remaining}s</span>`

  if (remaining <= 5) {
    timer.classList.add('kura-totp-urgent')
  }

  return timer
}

function renderItems() {
  if (!dropdownEl) return
  dropdownEl.innerHTML = ''

  // HTTP warning banner
  if (currentPageProtocol === 'http:') {
    const warning = document.createElement('div')
    warning.className = 'kura-dropdown-warning'
    warning.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
      '<span>このページは暗号化されていません</span>'
    dropdownEl.appendChild(warning)
  }

  let hasTotpCandidates = false

  for (let i = 0; i < currentCandidates.length; i++) {
    const candidate = currentCandidates[i]
    const item = document.createElement('button')
    item.className = 'kura-dropdown-item'
    item.setAttribute('data-index', String(i))
    if (i === selectedIndex) {
      item.setAttribute('data-selected', 'true')
    }

    // Icon
    const icon = document.createElement('div')
    icon.className = 'kura-item-icon'
    icon.textContent = (candidate.name || 'K')[0].toUpperCase()

    // Info
    const info = document.createElement('div')
    info.className = 'kura-item-info'

    const nameEl = document.createElement('div')
    nameEl.className = 'kura-item-name'
    nameEl.textContent = candidate.name

    info.appendChild(nameEl)

    if (candidate.username) {
      const usernameEl = document.createElement('div')
      usernameEl.className = 'kura-item-username'
      usernameEl.textContent = candidate.username
      info.appendChild(usernameEl)
    }

    item.appendChild(icon)
    item.appendChild(info)

    // TOTP remaining time indicator
    if (candidate.totpPeriod) {
      hasTotpCandidates = true
      item.appendChild(createTotpTimerEl(candidate.totpPeriod))
    }

    item.addEventListener('mousedown', (e) => {
      e.preventDefault() // Prevent blur on the input
      e.stopPropagation()
      onSelectCallback?.(candidate)
    })

    item.addEventListener('mouseenter', () => {
      selectedIndex = i
      updateSelection()
    })

    dropdownEl.appendChild(item)
  }

  // Start timer if there are TOTP candidates
  if (hasTotpCandidates) {
    startTotpTimer()
  }

  // Footer
  const footer = document.createElement('div')
  footer.className = 'kura-dropdown-footer'
  footer.innerHTML = '<span>kura</span>'
  dropdownEl.appendChild(footer)
}

function updateSelection() {
  if (!dropdownEl) return
  const items = dropdownEl.querySelectorAll('.kura-dropdown-item')
  items.forEach((item, i) => {
    if (i === selectedIndex) {
      item.setAttribute('data-selected', 'true')
      item.scrollIntoView({ block: 'nearest' })
    } else {
      item.removeAttribute('data-selected')
    }
  })
}

// ========== Keyboard handler ==========

function handleKeydown(e: KeyboardEvent) {
  if (!dropdownEl) return

  if (lockedMode) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        onUnlockCallback?.()
        break
      case 'Escape':
        e.preventDefault()
        hideDropdown()
        break
      case 'Tab':
        hideDropdown()
        break
    }
    return
  }

  if (currentCandidates.length === 0) return

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex = (selectedIndex + 1) % currentCandidates.length
      updateSelection()
      break
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex = selectedIndex <= 0 ? currentCandidates.length - 1 : selectedIndex - 1
      updateSelection()
      break
    case 'Enter':
      if (selectedIndex >= 0 && selectedIndex < currentCandidates.length) {
        e.preventDefault()
        onSelectCallback?.(currentCandidates[selectedIndex])
      }
      break
    case 'Escape':
      e.preventDefault()
      hideDropdown()
      break
    case 'Tab':
      hideDropdown()
      break
  }
}

// ========== Scroll/resize handlers ==========

function handleScroll() {
  if (!currentAnchor) return

  const rect = currentAnchor.getBoundingClientRect()
  if (lastAnchorRect) {
    const dy = Math.abs(rect.top - lastAnchorRect.top)
    const dx = Math.abs(rect.left - lastAnchorRect.left)
    if (dy > SCROLL_HIDE_THRESHOLD || dx > SCROLL_HIDE_THRESHOLD) {
      hideDropdown()
      return
    }
  }

  lastAnchorRect = { top: rect.top, left: rect.left }
  positionDropdown(currentAnchor)
}

function handleResize() {
  if (!currentAnchor) return
  positionDropdown(currentAnchor)
  const rect = currentAnchor.getBoundingClientRect()
  lastAnchorRect = { top: rect.top, left: rect.left }
}

// ========== Blur handler ==========

function handleAnchorBlur() {
  // Delay to allow click on dropdown items
  blurTimeout = setTimeout(() => {
    hideDropdown()
  }, 200)
}

// ========== Public API ==========

export function showDropdown(
  anchor: HTMLInputElement,
  candidates: AutofillCredentialCandidate[],
  onSelect: (candidate: AutofillCredentialCandidate) => void,
  pageProtocol?: string,
) {
  if (candidates.length === 0) {
    hideDropdown()
    return
  }

  const root = ensureShadowHost()
  currentAnchor = anchor
  currentCandidates = candidates
  selectedIndex = -1
  onSelectCallback = onSelect
  currentPageProtocol = pageProtocol || null

  // Remove existing dropdown
  if (dropdownEl) {
    dropdownEl.remove()
  }

  dropdownEl = document.createElement('div')
  dropdownEl.className = 'kura-dropdown'
  root.appendChild(dropdownEl)

  renderItems()
  positionDropdown(anchor)

  // Track initial anchor position for scroll-hide detection
  const rect = anchor.getBoundingClientRect()
  lastAnchorRect = { top: rect.top, left: rect.left }

  // Event listeners
  anchor.addEventListener('keydown', handleKeydown)
  anchor.addEventListener('blur', handleAnchorBlur)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
}

export function hideDropdown() {
  stopTotpTimer()

  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }

  if (currentAnchor) {
    currentAnchor.removeEventListener('keydown', handleKeydown)
    currentAnchor.removeEventListener('blur', handleAnchorBlur)
  }

  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)

  if (dropdownEl) {
    dropdownEl.remove()
    dropdownEl = null
  }

  currentAnchor = null
  currentCandidates = []
  selectedIndex = -1
  onSelectCallback = null
  lockedMode = false
  onUnlockCallback = null
  currentPageProtocol = null
  lastAnchorRect = null
}

export function isDropdownVisible(): boolean {
  return dropdownEl !== null
}

export function destroy() {
  hideDropdown()
  if (shadowHost) {
    shadowHost.remove()
    shadowHost = null
    shadowRoot = null
  }
}

export function showLockedDropdown(anchor: HTMLInputElement, onUnlockClick: () => void) {
  const root = ensureShadowHost()
  currentAnchor = anchor
  lockedMode = true
  onUnlockCallback = onUnlockClick
  currentCandidates = []
  selectedIndex = -1
  onSelectCallback = null

  if (dropdownEl) {
    dropdownEl.remove()
  }

  dropdownEl = document.createElement('div')
  dropdownEl.className = 'kura-dropdown'
  root.appendChild(dropdownEl)

  // Locked item
  const item = document.createElement('button')
  item.className = 'kura-dropdown-item kura-dropdown-locked'

  const icon = document.createElement('div')
  icon.className = 'kura-item-icon'
  // Lock icon SVG
  icon.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'

  const info = document.createElement('div')
  info.className = 'kura-item-info'

  const nameEl = document.createElement('div')
  nameEl.className = 'kura-item-name'
  nameEl.textContent = 'Vault is locked'

  const subtitleEl = document.createElement('div')
  subtitleEl.className = 'kura-item-username'
  subtitleEl.textContent = 'Click to unlock'

  info.appendChild(nameEl)
  info.appendChild(subtitleEl)
  item.appendChild(icon)
  item.appendChild(info)

  item.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onUnlockClick()
  })

  dropdownEl.appendChild(item)

  // Footer
  const footer = document.createElement('div')
  footer.className = 'kura-dropdown-footer'
  footer.innerHTML = '<span>kura</span>'
  dropdownEl.appendChild(footer)

  positionDropdown(anchor)

  const rect = anchor.getBoundingClientRect()
  lastAnchorRect = { top: rect.top, left: rect.left }

  anchor.addEventListener('keydown', handleKeydown)
  anchor.addEventListener('blur', handleAnchorBlur)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
}
