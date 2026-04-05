// Shadow DOM dropdown UI for autofill credential candidates (design doc Section 9)

import type { AutofillCredentialCandidate } from '../shared/types'

const CONTAINER_ID = 'kura-autofill-dropdown'
const MAX_VISIBLE = 5

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

function ensureShadowHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  shadowHost = document.createElement('div')
  shadowHost.id = CONTAINER_ID
  shadowHost.setAttribute(
    'style',
    'all: initial !important; position: fixed !important; z-index: 2147483647 !important;',
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

function renderItems() {
  if (!dropdownEl) return
  dropdownEl.innerHTML = ''

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

// ========== Scroll/resize handler ==========

function handleScrollResize() {
  if (currentAnchor) {
    positionDropdown(currentAnchor)
  }
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
) {
  if (candidates.length === 0) {
    hideDropdown()
    return
  }

  const root = ensureShadowHost()
  currentAnchor = anchor
  currentCandidates = candidates.slice(0, MAX_VISIBLE)
  selectedIndex = -1
  onSelectCallback = onSelect

  // Remove existing dropdown
  if (dropdownEl) {
    dropdownEl.remove()
  }

  dropdownEl = document.createElement('div')
  dropdownEl.className = 'kura-dropdown'
  root.appendChild(dropdownEl)

  renderItems()
  positionDropdown(anchor)

  // Event listeners
  anchor.addEventListener('keydown', handleKeydown)
  anchor.addEventListener('blur', handleAnchorBlur)
  window.addEventListener('scroll', handleScrollResize, true)
  window.addEventListener('resize', handleScrollResize)
}

export function hideDropdown() {
  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }

  if (currentAnchor) {
    currentAnchor.removeEventListener('keydown', handleKeydown)
    currentAnchor.removeEventListener('blur', handleAnchorBlur)
  }

  window.removeEventListener('scroll', handleScrollResize, true)
  window.removeEventListener('resize', handleScrollResize)

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

  anchor.addEventListener('keydown', handleKeydown)
  anchor.addEventListener('blur', handleAnchorBlur)
  window.addEventListener('scroll', handleScrollResize, true)
  window.addEventListener('resize', handleScrollResize)
}
