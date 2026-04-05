// Form detection and type classification (design doc Sections 3.2, 3.3, 10.1)

import { classifyField, type FieldClassification, type FieldType } from './field-classifier'

const LOG_PREFIX = '[kura:autofill:fd]'

export type FormType =
  | 'LOGIN'
  | 'LOGIN_USERNAME'
  | 'LOGIN_PASSWORD'
  | 'REGISTRATION'
  | 'PASSWORD_CHANGE'
  | 'TOTP'
  | 'CREDIT_CARD'

export interface DetectedForm {
  formType: FormType
  fields: FieldClassification[]
  container: HTMLElement
}

// ========== Visibility check (Section 10.1) ==========

export function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0'
  )
}

// ========== Form container discovery ==========

/**
 * Find the form container for a given input element.
 * Returns the parent <form> if present, otherwise finds a common ancestor
 * by walking up 3-4 levels (for formless SPAs).
 */
function findFormContainer(input: HTMLInputElement): HTMLElement {
  const form = input.closest('form')
  if (form) return form

  // Walk up to find a reasonable container (3-4 levels)
  let container: HTMLElement = input
  for (let i = 0; i < 4; i++) {
    if (container.parentElement && container.parentElement !== document.body) {
      container = container.parentElement
    } else {
      break
    }
  }
  return container
}

/**
 * Collect all visible <input> elements within a container.
 */
function collectInputs(container: HTMLElement): HTMLInputElement[] {
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'))
  return inputs.filter(isVisible)
}

// ========== Form type classification (Section 3.2) ==========

function classifyFormType(fields: FieldClassification[]): FormType | null {
  const hasType = (t: FieldType) => fields.some((f) => f.type === t)
  const countType = (t: FieldType) => fields.filter((f) => f.type === t).length

  const hasUsername = hasType('username')
  const passwordCount = countType('password')
  const newPasswordCount = countType('new_password')
  const hasTotp = hasType('totp')
  const hasCcNumber = hasType('cc_number')

  // TOTP: single short numeric input
  if (hasTotp && fields.length <= 2) {
    return 'TOTP'
  }

  // CREDIT_CARD: cc_number + cc_exp + cc_cvc
  if (hasCcNumber) {
    return 'CREDIT_CARD'
  }

  // PASSWORD_CHANGE: 1 password + 2 new-passwords
  if (passwordCount >= 1 && newPasswordCount >= 2) {
    return 'PASSWORD_CHANGE'
  }

  // REGISTRATION: username + email + at least 1 password-like field
  if (hasUsername && passwordCount + newPasswordCount >= 1 && fields.length >= 3) {
    // Heuristic: if there are new-password fields, likely registration
    if (newPasswordCount >= 1) {
      return 'REGISTRATION'
    }
  }

  // LOGIN: username + password
  if (hasUsername && passwordCount >= 1) {
    return 'LOGIN'
  }

  // LOGIN_USERNAME: username only, no password
  if (hasUsername && passwordCount === 0 && newPasswordCount === 0) {
    return 'LOGIN_USERNAME'
  }

  // LOGIN_PASSWORD: password only, no username
  if (!hasUsername && passwordCount >= 1 && newPasswordCount === 0) {
    return 'LOGIN_PASSWORD'
  }

  return null
}

// ========== Public API ==========

/**
 * Detect the form type for a given focused input element.
 * Returns null if no recognizable form is found.
 */
export function detectForm(focusedInput: HTMLInputElement): DetectedForm | null {
  if (!isVisible(focusedInput)) {
    console.log(LOG_PREFIX, 'detectForm: focused input not visible')
    return null
  }

  const container = findFormContainer(focusedInput)
  const inputs = collectInputs(container)
  console.log(
    LOG_PREFIX,
    `detectForm: container=${container.tagName}, ${inputs.length} visible inputs found`,
  )

  if (inputs.length === 0) return null

  // Classify all fields in the container
  const classifications: FieldClassification[] = []
  for (const input of inputs) {
    const classification = classifyField(input)
    if (classification) {
      console.log(
        LOG_PREFIX,
        `detectForm: classified input name="${input.name}" id="${input.id}" → ${classification.type} (score=${classification.score})`,
      )
      classifications.push(classification)
    } else {
      console.log(
        LOG_PREFIX,
        `detectForm: input name="${input.name}" id="${input.id}" type="${input.type}" → unclassified`,
      )
    }
  }

  if (classifications.length === 0) {
    console.log(LOG_PREFIX, 'detectForm: no fields classified')
    return null
  }

  // Determine form type
  const formType = classifyFormType(classifications)
  console.log(LOG_PREFIX, `detectForm: formType=${formType}`)
  if (!formType) return null

  // MVP: only handle login-related forms
  if (!['LOGIN', 'LOGIN_USERNAME', 'LOGIN_PASSWORD'].includes(formType)) {
    console.log(LOG_PREFIX, `detectForm: formType ${formType} not supported in MVP`)
    return null
  }

  return {
    formType,
    fields: classifications,
    container,
  }
}
