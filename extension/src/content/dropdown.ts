// Shadow DOM dropdown UI for autofill credential candidates (design doc Section 9)

import type { AutofillCredentialCandidate } from '../shared/types'

const CONTAINER_ID = 'kura-autofill-dropdown'

let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let dropdownEl: HTMLElement | null = null
let iconEl: HTMLButtonElement | null = null
let iconClickCallback: (() => void) | null = null
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

// ========== Clickjacking protection ==========
//
// The shadow host lives in the page's DOM, so the page can try to make the
// dropdown invisible (opacity/filter on the host or its ancestors, or a
// `pointer-events: none` decoy drawn on top of it) and trick the user into
// clicking a candidate. Clicks are only honored when none of that applies.

// Minimum time the UI must have been on screen before a click is accepted,
// so a page cannot pop it up under a cursor that is already mid-click.
const MIN_INTERACTION_DELAY_MS = 300
const HOST_STYLE =
  'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important;'

let interactiveSince = 0
let hostObserver: MutationObserver | null = null
let visibilityObserver: IntersectionObserver | null = null
// Results of IntersectionObserver v2 occlusion tracking (Chrome only).
// Missing entry = unsupported or not yet reported.
let occlusion = new WeakMap<Element, boolean>()

function markShown() {
  interactiveSince = performance.now()
}

/**
 * Move the host to the top of the top layer so that page content (including
 * `pointer-events: none` overlays and modals opened earlier) cannot be drawn
 * above it. No-op on browsers without the Popover API.
 */
function bringHostToFront() {
  if (!shadowHost || typeof shadowHost.showPopover !== 'function') return
  try {
    if (shadowHost.matches(':popover-open')) shadowHost.hidePopover()
    shadowHost.showPopover()
  } catch {
    // Not fatal: fall back to z-index stacking
  }
}

/** Start occlusion tracking for an interactive element (dropdown / icon). */
function trackVisibility(el: HTMLElement) {
  if (!visibilityObserver) {
    try {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries as Array<
            IntersectionObserverEntry & { isVisible?: boolean }
          >) {
            if (typeof entry.isVisible !== 'boolean') continue
            // Restart the interaction delay whenever the UI becomes visible again
            if (entry.isVisible && occlusion.get(entry.target) === false) markShown()
            occlusion.set(entry.target, entry.isVisible)
          }
        },
        // trackVisibility/delay are IntersectionObserver v2 options (not yet in lib.dom)
        { threshold: 1, trackVisibility: true, delay: 100 } as IntersectionObserverInit,
      )
    } catch {
      // trackVisibility unsupported (e.g. Firefox): rely on the other checks
      return
    }
  }
  visibilityObserver.observe(el)
}

function hasHidingEffect(el: Element): boolean {
  const style = getComputedStyle(el)
  return style.opacity !== '1' || style.filter.includes('opacity(')
}

/**
 * Whether the UI element is plausibly what the user sees: shown long enough,
 * not reported as occluded, and not made transparent by the page.
 */
function isUiTrustworthy(target: Element | null): boolean {
  if (performance.now() - interactiveSince < MIN_INTERACTION_DELAY_MS) return false
  if (!shadowHost?.isConnected) return false
  if (target && occlusion.get(target) === false) return false
  for (const el of [shadowHost, document.body, document.documentElement]) {
    if (el && hasHidingEffect(el)) return false
  }
  return true
}

/** Whether a click on the dropdown/icon reflects a deliberate user action. */
function isGenuineActivation(e: MouseEvent, target: Element | null): boolean {
  if (!e.isTrusted || e.button !== 0) return false
  return isUiTrustworthy(target)
}

function destroyHost() {
  hostObserver?.disconnect()
  hostObserver = null
  visibilityObserver?.disconnect()
  visibilityObserver = null
  occlusion = new WeakMap()
  if (shadowHost) {
    shadowHost.remove()
    shadowHost = null
    shadowRoot = null
  }
}

function ensureShadowHost(): ShadowRoot {
  if (shadowRoot && shadowHost?.isConnected) return shadowRoot
  destroyHost()

  shadowHost = document.createElement('div')
  shadowHost.id = CONTAINER_ID
  shadowHost.setAttribute('style', HOST_STYLE)
  shadowHost.setAttribute('popover', 'manual')
  document.body.appendChild(shadowHost)

  shadowRoot = shadowHost.attachShadow({ mode: 'closed' })

  // Load styles from extension CSS file (CSP-safe)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = chrome.runtime.getURL('src/content/dropdown.css')
  shadowRoot.appendChild(link)

  // Any tampering with the host's attributes (style, popover, ...) by the
  // page tears the UI down instead of letting a disguised dropdown stay usable.
  const observedHost = shadowHost
  hostObserver = new MutationObserver(() => {
    if (shadowHost === observedHost) destroy()
  })
  hostObserver.observe(observedHost, { attributes: true })

  return shadowRoot
}

function positionDropdown(anchor: HTMLInputElement) {
  if (!dropdownEl) return
  const rect = anchor.getBoundingClientRect()
  dropdownEl.style.left = `${rect.left}px`
  dropdownEl.style.top = `${rect.bottom + 4}px`
  dropdownEl.style.minWidth = `${Math.max(rect.width, 260)}px`
}

function positionIcon(anchor: HTMLInputElement) {
  if (!iconEl) return
  const rect = anchor.getBoundingClientRect()
  const iconSize = 20
  iconEl.style.left = `${rect.right - iconSize - 4}px`
  iconEl.style.top = `${rect.top + (rect.height - iconSize) / 2}px`
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
      if (!isGenuineActivation(e, dropdownEl)) return
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
  // The listener is attached to the page's own <input>, so page scripts can
  // dispatch synthetic keydown events to it. Only real key presses may select
  // a candidate; otherwise a page could fill and read credentials without any
  // user interaction.
  if (!e.isTrusted) return

  if (lockedMode) {
    switch (e.key) {
      case 'Enter':
        if (!isUiTrustworthy(dropdownEl)) return
        e.preventDefault()
        onUnlockCallback?.()
        break
      case 'Escape':
        e.preventDefault()
        closeDropdownOnly()
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
        // A disguised dropdown can get an item selected by mere mouse hover
        if (!isUiTrustworthy(dropdownEl)) return
        e.preventDefault()
        onSelectCallback?.(currentCandidates[selectedIndex])
      }
      break
    case 'Escape':
      e.preventDefault()
      closeDropdownOnly()
      break
    case 'Tab':
      hideDropdown()
      break
  }
}

// ========== Escape-only close (keeps icon visible) ==========

function closeDropdownOnly() {
  stopTotpTimer()
  if (currentAnchor) currentAnchor.removeEventListener('keydown', handleKeydown)
  if (dropdownEl) {
    dropdownEl.remove()
    dropdownEl = null
  }
  currentCandidates = []
  selectedIndex = -1
  onSelectCallback = null
  lockedMode = false
  onUnlockCallback = null
  currentPageProtocol = null
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
  positionIcon(currentAnchor)
}

function handleResize() {
  if (!currentAnchor) return
  positionDropdown(currentAnchor)
  positionIcon(currentAnchor)
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
  preselectFirst = false,
) {
  if (candidates.length === 0) {
    hideDropdown()
    return
  }

  const root = ensureShadowHost()
  currentAnchor = anchor
  currentCandidates = candidates
  selectedIndex = preselectFirst ? 0 : -1
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
  bringHostToFront()
  trackVisibility(dropdownEl)
  markShown()

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

  if (iconEl) {
    iconEl.remove()
    iconEl = null
    iconClickCallback = null
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

function createKeyIconSvg(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '12')
  svg.setAttribute('height', '12')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  const circle = document.createElementNS(NS, 'circle')
  circle.setAttribute('cx', '7.5')
  circle.setAttribute('cy', '15.5')
  circle.setAttribute('r', '5.5')
  svg.appendChild(circle)

  const path1 = document.createElementNS(NS, 'path')
  path1.setAttribute('d', 'm21 2-9.6 9.6')
  svg.appendChild(path1)

  const path2 = document.createElementNS(NS, 'path')
  path2.setAttribute('d', 'm15.5 7.5 3 3L22 7l-3-3')
  svg.appendChild(path2)

  return svg
}

export function showInlineIcon(anchor: HTMLInputElement, onClick: () => void) {
  const root = ensureShadowHost()

  // Same anchor with icon already shown — just update callback
  if (currentAnchor === anchor && iconEl) {
    iconClickCallback = onClick
    return
  }

  // Different anchor — clean up previous state
  if (currentAnchor && currentAnchor !== anchor) {
    hideDropdown()
  }

  currentAnchor = anchor
  iconClickCallback = onClick

  if (iconEl) {
    iconEl.remove()
  }

  iconEl = document.createElement('button')
  iconEl.type = 'button'
  iconEl.className = 'kura-inline-icon'
  iconEl.appendChild(createKeyIconSvg())
  root.appendChild(iconEl)

  positionIcon(anchor)
  bringHostToFront()
  trackVisibility(iconEl)
  markShown()

  const rect = anchor.getBoundingClientRect()
  lastAnchorRect = { top: rect.top, left: rect.left }

  iconEl.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isGenuineActivation(e, iconEl)) return
    if (blurTimeout) {
      clearTimeout(blurTimeout)
      blurTimeout = null
    }
    iconClickCallback?.()
  })

  // Idempotent: same function reference won't be registered twice
  anchor.addEventListener('blur', handleAnchorBlur)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
}

export function destroy() {
  hideDropdown()
  destroyHost()
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
    if (!isGenuineActivation(e, dropdownEl)) return
    onUnlockClick()
  })

  dropdownEl.appendChild(item)

  // Footer
  const footer = document.createElement('div')
  footer.className = 'kura-dropdown-footer'
  footer.innerHTML = '<span>kura</span>'
  dropdownEl.appendChild(footer)

  positionDropdown(anchor)
  bringHostToFront()
  trackVisibility(dropdownEl)
  markShown()

  const rect = anchor.getBoundingClientRect()
  lastAnchorRect = { top: rect.top, left: rect.left }

  anchor.addEventListener('keydown', handleKeydown)
  anchor.addEventListener('blur', handleAnchorBlur)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
}
