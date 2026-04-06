// Content Script entry point — injected on-demand when vault is unlocked
// Handles form detection, credential suggestion, and field filling

import type { AutofillCredentialCandidate } from '../shared/types'
import { hideDropdown, showDropdown, showLockedDropdown } from './dropdown'
import { fillField, fillFields } from './filler'
import { type DetectedForm, detectForm, isVisible } from './form-detector'
import {
  getCredentials,
  queryPendingFlow,
  requestCreditCards,
  requestFillData,
  requestOpenPopup,
  requestTotp,
  storePendingFlow,
} from './messaging'

const LOG_PREFIX = '[kura:autofill:cs]'

// Prevent double-initialization if injected multiple times
if (!(window as unknown as Record<string, boolean>).__kura_autofill_initialized) {
  ;(window as unknown as Record<string, boolean>).__kura_autofill_initialized = true
  console.log(LOG_PREFIX, 'Content script initializing on', window.location.href)
  init()
} else {
  console.log(LOG_PREFIX, 'Content script already initialized, skipping')
}

function init() {
  // Listen for focus events on input fields (capture phase)
  // This handles static pages, SPAs, and dynamically added forms
  document.addEventListener('focus', onFocus, true)
  console.log(LOG_PREFIX, 'Focus event listener registered (capture phase)')

  // Listen for vault lock notification from Service Worker
  // Use a separate port connection to avoid interfering with popup ↔ background messaging
  chrome.runtime.onMessage.addListener(onVaultMessage)
}

function onVaultMessage(message: { type?: string }) {
  if (message.type === 'AUTOFILL_VAULT_LOCKED') {
    console.log(LOG_PREFIX, 'Vault locked notification received')
    hideDropdown()
  }
  if (message.type === 'AUTOFILL_VAULT_UNLOCKED') {
    console.log(LOG_PREFIX, 'Vault unlocked notification received')
    hideDropdown()
  }
  // Never return true — this listener does not send responses
}

// Debounce focus events to avoid rapid re-detection
let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null

function onFocus(e: Event) {
  const target = e.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    return
  }
  // Only handle <input>, not <textarea>
  if (target instanceof HTMLTextAreaElement) return

  console.log(
    LOG_PREFIX,
    `Focus on input: type=${(target as HTMLInputElement).type}, name=${(target as HTMLInputElement).name}, id=${(target as HTMLInputElement).id}`,
  )

  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer)
  }

  focusDebounceTimer = setTimeout(() => {
    handleInputFocus(target as HTMLInputElement)
  }, 50)
}

async function handleInputFocus(input: HTMLInputElement) {
  if (!isVisible(input)) {
    console.log(LOG_PREFIX, 'handleInputFocus: input not visible, skipping')
    return
  }

  // Detect form around the focused input
  const form = detectForm(input)
  if (!form) {
    console.log(LOG_PREFIX, 'handleInputFocus: no form detected')
    hideDropdown()
    return
  }

  console.log(
    LOG_PREFIX,
    `handleInputFocus: detected form type=${form.formType}, fields=${form.fields.map((f) => f.type).join(',')}`,
  )

  const url = window.location.href

  // === TOTP: auto-fill without dropdown ===
  if (form.formType === 'TOTP') {
    const totpResult = await requestTotp(url)
    if (totpResult) {
      const totpField = form.fields.find((f) => f.type === 'totp')
      if (totpField && isVisible(totpField.element)) {
        console.log(
          LOG_PREFIX,
          `handleInputFocus: auto-filling TOTP code from ${totpResult.totpEntryName}`,
        )
        fillField(totpField.element, totpResult.totpCode)
      }
    } else {
      console.log(LOG_PREFIX, 'handleInputFocus: no TOTP entry found for this URL')
    }
    return
  }

  // === Split login: check for pending flow on LOGIN_PASSWORD ===
  if (form.formType === 'LOGIN_PASSWORD') {
    const pending = await queryPendingFlow(url)
    if (pending?.password) {
      const passwordField = form.fields.find((f) => f.type === 'password')
      if (passwordField && isVisible(passwordField.element)) {
        console.log(LOG_PREFIX, 'handleInputFocus: auto-filling password from pending login flow')
        fillField(passwordField.element, pending.password)
        return
      }
    }
    // Fall through to normal dropdown flow
  }

  // === Credit card: fetch credit card entries instead of login entries ===
  if (form.formType === 'CREDIT_CARD') {
    const creditCards = await requestCreditCards()
    console.log(LOG_PREFIX, `handleInputFocus: ${creditCards.length} credit card entries`)

    if (creditCards.length === 0) {
      hideDropdown()
      return
    }

    showDropdown(
      input,
      creditCards,
      (candidate) => {
        onCandidateSelected(candidate, form)
      },
      window.location.protocol,
    )
    return
  }

  // === Login, Registration, Password Change, Login_Username, Login_Password ===
  const result = await getCredentials(url)

  if (result.status === 'locked') {
    console.log(LOG_PREFIX, 'handleInputFocus: vault is locked, showing locked dropdown')
    showLockedDropdown(input, () => {
      hideDropdown()
      requestOpenPopup()
    })
    return
  }

  const candidates = result.credentials
  console.log(LOG_PREFIX, `handleInputFocus: ${candidates.length} credential candidates for ${url}`)

  if (candidates.length === 0) {
    hideDropdown()
    return
  }

  // Show dropdown anchored to the focused input
  showDropdown(
    input,
    candidates,
    (candidate) => {
      onCandidateSelected(candidate, form)
    },
    window.location.protocol,
  )
}

async function onCandidateSelected(candidate: AutofillCredentialCandidate, form: DetectedForm) {
  console.log(LOG_PREFIX, `Candidate selected: ${candidate.name} (${candidate.entryId})`)
  hideDropdown()

  // Request full credentials from Service Worker
  const fillData = await requestFillData(candidate.entryId)
  if (!fillData) {
    console.warn(LOG_PREFIX, 'onCandidateSelected: no fill data returned')
    return
  }

  // Find the target fields from the detected form
  const usernameField = form.fields.find((f) => f.type === 'username')
  const passwordField = form.fields.find((f) => f.type === 'password')

  console.log(
    LOG_PREFIX,
    `onCandidateSelected: formType=${form.formType}, usernameField=${!!usernameField}, passwordField=${!!passwordField}`,
  )

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

  // For PASSWORD_CHANGE forms, only fill the current password field (not new_password)
  if (form.formType === 'PASSWORD_CHANGE') {
    if (passwordField && fillData.password && isVisible(passwordField.element)) {
      fillField(passwordField.element, fillData.password)
    }
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
      console.log(LOG_PREFIX, `onCandidateSelected: filling ${ccFields.length} credit card fields`)
      await fillFields(ccFields)
    }
    return
  }

  // For LOGIN / REGISTRATION forms, fill both fields with delay between
  const toFill: Array<{ element: HTMLInputElement; value: string }> = []

  if (usernameField && fillData.username && isVisible(usernameField.element)) {
    toFill.push({ element: usernameField.element, value: fillData.username })
  }

  if (passwordField && fillData.password && isVisible(passwordField.element)) {
    toFill.push({ element: passwordField.element, value: fillData.password })
  }

  if (toFill.length > 0) {
    console.log(LOG_PREFIX, `onCandidateSelected: filling ${toFill.length} fields`)
    await fillFields(toFill)
  }
}
