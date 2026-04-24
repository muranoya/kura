// Content Script entry point — injected on-demand when vault is unlocked
// Handles form detection, credential suggestion, and field filling

import type { AutofillCredentialCandidate } from '../shared/types'
import { isCaptureActive, onVaultLockedDuringCapture, startCaptureMode } from './capture'
import { getEffectivePatterns, handleDevModeMessage, initDevMode } from './dev-mode-bridge'
import { hideDropdown, showDropdown, showInlineIcon, showLockedDropdown } from './dropdown'
import { fillField, fillFields } from './filler'
import { type DetectedForm, detectForm, isVisible } from './form-detector'
import {
  getCredentials,
  queryPendingFlow,
  requestCreditCards,
  requestFillData,
  requestOpenPopup,
  requestTotp,
  requestTotpCandidates,
  storePendingFlow,
} from './messaging'
import { detectFormByPattern } from './pattern-detector'
import { findMatchingPattern } from './pattern-matcher'

// Prevent double-initialization if injected multiple times
if (!(window as unknown as Record<string, boolean>).__kura_autofill_initialized) {
  ;(window as unknown as Record<string, boolean>).__kura_autofill_initialized = true
  init()
}

function init() {
  // Initialize developer mode bridge (loads custom patterns if any)
  initDevMode()

  // Listen for focus events on input fields (capture phase)
  // This handles static pages, SPAs, and dynamically added forms
  document.addEventListener('focus', onFocus, true)

  // Listen for vault lock notification from Service Worker
  // Use a separate port connection to avoid interfering with popup ↔ background messaging
  chrome.runtime.onMessage.addListener(onVaultMessage)
}

function onVaultMessage(
  message: { type?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  if (message.type === 'AUTOFILL_VAULT_LOCKED') {
    hideDropdown()
    onVaultLockedDuringCapture()
    return
  }
  if (message.type === 'AUTOFILL_VAULT_UNLOCKED') {
    hideDropdown()
    return
  }
  if (message.type === 'AUTOFILL_START_CAPTURE') {
    hideDropdown()
    startCaptureMode()
    return
  }

  // Developer mode messages
  if (message.type?.startsWith('DEV_MODE_')) {
    return handleDevModeMessage(message, sendResponse)
  }
}

// Debounce focus events to avoid rapid re-detection
let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null

function onFocus(e: Event) {
  if (isCaptureActive()) return

  // Use composedPath to get the actual target across shadow DOM boundaries
  const target = e.composedPath()[0]
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    return
  }
  // Only handle <input>, not <textarea>
  if (target instanceof HTMLTextAreaElement) return

  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer)
  }

  focusDebounceTimer = setTimeout(() => {
    handleInputFocus(target as HTMLInputElement)
  }, 50)
}

async function handleInputFocus(input: HTMLInputElement) {
  if (!isVisible(input)) {
    return
  }

  // Try pattern-based detection first, then fall back to heuristic
  let form: DetectedForm | null = null
  let strictSubdomain = false

  const hostname = window.location.hostname
  const matchedPattern = findMatchingPattern(getEffectivePatterns(), hostname)

  if (matchedPattern) {
    const patternResult = await detectFormByPattern(input, matchedPattern)
    if (patternResult) {
      form = patternResult.form
      strictSubdomain = patternResult.strictSubdomain
    } else {
      // Pattern has no forms or none matched — fall back to heuristic
      // strict_subdomain from the pattern still applies even with heuristic detection
      strictSubdomain = matchedPattern.match.strict_subdomain ?? false
      form = detectForm(input)
    }
  } else {
    form = detectForm(input)
  }

  if (!form) {
    hideDropdown()
    return
  }

  // The focused input must itself be a classified autofill target.
  // Otherwise, focusing unrelated inputs (search, comment, etc.) in the same
  // container would also trigger suggestions.
  const focusedField = form.fields.find((f) => f.element === input)
  if (!focusedField) {
    hideDropdown()
    return
  }

  const url = window.location.href

  // === TOTP: dropdown selection (or auto-fill if pending flow exists) ===
  if (form.formType === 'TOTP') {
    // Check pending flow first (split login: use the same entry selected in username step)
    const pending = await queryPendingFlow(url)
    if (pending) {
      const totpResult = await requestTotp(url, pending.entryId)
      if (totpResult) {
        const totpField = form.fields.find((f) => f.type === 'totp')
        if (totpField && isVisible(totpField.element)) {
          fillField(totpField.element, totpResult.totpCode)
        }
      }
      return
    }

    // No pending flow — show dropdown for candidate selection
    const candidates = await requestTotpCandidates(url)
    if (candidates.length === 0) {
      hideDropdown()
      return
    }

    const showTotpDropdown = () => {
      showDropdown(
        input,
        candidates,
        async (candidate) => {
          hideDropdown()
          const totpResult = await requestTotp(url, candidate.entryId)
          if (totpResult) {
            const totpField = form.fields.find((f) => f.type === 'totp')
            if (totpField && isVisible(totpField.element)) {
              fillField(totpField.element, totpResult.totpCode)
            }
          }
        },
        window.location.protocol,
      )
    }
    showInlineIcon(input, showTotpDropdown)
    if (!input.value.trim()) {
      showTotpDropdown()
    }
    return
  }

  // === Split login: check for pending flow on LOGIN_PASSWORD ===
  if (form.formType === 'LOGIN_PASSWORD') {
    const pending = await queryPendingFlow(url)
    if (pending?.password) {
      const passwordField = form.fields.find((f) => f.type === 'password')
      if (passwordField && isVisible(passwordField.element)) {
        fillField(passwordField.element, pending.password)
        return
      }
    }
    // Fall through to normal dropdown flow
  }

  // === Credit card: fetch credit card entries instead of login entries ===
  if (form.formType === 'CREDIT_CARD') {
    const creditCards = await requestCreditCards()

    if (creditCards.length === 0) {
      hideDropdown()
      return
    }

    const showCreditCardDropdown = () => {
      showDropdown(
        input,
        creditCards,
        (candidate) => {
          onCandidateSelected(candidate, form)
        },
        window.location.protocol,
      )
    }
    showInlineIcon(input, showCreditCardDropdown)
    if (!input.value.trim()) {
      showCreditCardDropdown()
    }
    return
  }

  // === Login, Registration, Password Change, Login_Username, Login_Password ===
  const result = await getCredentials(url, strictSubdomain)

  if (result.status === 'locked') {
    const showLocked = () => {
      showLockedDropdown(input, () => {
        hideDropdown()
        requestOpenPopup()
      })
    }
    showInlineIcon(input, showLocked)
    if (!input.value.trim()) {
      showLocked()
    }
    return
  }

  const candidates = result.credentials

  if (candidates.length === 0) {
    hideDropdown()
    return
  }

  const showLoginDropdown = () => {
    showDropdown(
      input,
      candidates,
      (candidate) => {
        onCandidateSelected(candidate, form)
      },
      window.location.protocol,
    )
  }
  showInlineIcon(input, showLoginDropdown)
  if (!input.value.trim()) {
    showLoginDropdown()
  }
}

async function onCandidateSelected(candidate: AutofillCredentialCandidate, form: DetectedForm) {
  hideDropdown()

  // Request full credentials from Service Worker
  const fillData = await requestFillData(candidate.entryId)
  if (!fillData) {
    console.warn('[kura:autofill:cs]', 'onCandidateSelected: no fill data returned')
    return
  }

  // Find the target fields from the detected form
  const usernameField = form.fields.find((f) => f.type === 'username')
  const passwordField = form.fields.find((f) => f.type === 'password')

  // For LOGIN_USERNAME forms, only fill username and store pending flow
  if (
    form.formType === 'LOGIN_USERNAME' &&
    usernameField &&
    fillData.username &&
    isVisible(usernameField.element)
  ) {
    fillField(usernameField.element, fillData.username)
    await storePendingFlow(candidate.entryId, fillData.username, window.location.href)
    return
  }

  // For LOGIN_PASSWORD forms, only fill password
  if (
    form.formType === 'LOGIN_PASSWORD' &&
    passwordField &&
    fillData.password &&
    isVisible(passwordField.element)
  ) {
    fillField(passwordField.element, fillData.password)
    return
  }

  // For CREDIT_CARD forms, fill all credit card fields
  if (form.formType === 'CREDIT_CARD') {
    const ccFields: Array<{ element: HTMLInputElement; value: string }> = []

    const ccNumber = form.fields.find((f) => f.type === 'cc_number')
    if (ccNumber && fillData.ccNumber && isVisible(ccNumber.element)) {
      ccFields.push({ element: ccNumber.element, value: fillData.ccNumber })
    }

    const ccExp = form.fields.find((f) => f.type === 'cc_exp')
    if (ccExp && fillData.ccExp && isVisible(ccExp.element)) {
      ccFields.push({ element: ccExp.element, value: fillData.ccExp })
    }

    const ccCvc = form.fields.find((f) => f.type === 'cc_cvc')
    if (ccCvc && fillData.ccCvc && isVisible(ccCvc.element)) {
      ccFields.push({ element: ccCvc.element, value: fillData.ccCvc })
    }

    const ccName = form.fields.find((f) => f.type === 'cc_name')
    if (ccName && fillData.ccName && isVisible(ccName.element)) {
      ccFields.push({ element: ccName.element, value: fillData.ccName })
    }

    if (ccFields.length > 0) {
      await fillFields(ccFields)
    }
    return
  }

  // For LOGIN forms, fill both fields with delay between
  const toFill: Array<{ element: HTMLInputElement; value: string }> = []

  if (usernameField && fillData.username && isVisible(usernameField.element)) {
    toFill.push({ element: usernameField.element, value: fillData.username })
  }

  if (passwordField && fillData.password && isVisible(passwordField.element)) {
    toFill.push({ element: passwordField.element, value: fillData.password })
  }

  if (toFill.length > 0) {
    await fillFields(toFill)
  }
}
