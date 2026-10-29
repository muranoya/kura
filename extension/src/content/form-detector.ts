// Form detection and type classification (design doc Sections 3.2, 3.3, 10.1)

import { classifyField, type FieldClassification, type FieldType } from './field-classifier'

export type FormType = 'LOGIN' | 'LOGIN_USERNAME' | 'LOGIN_PASSWORD' | 'TOTP' | 'CREDIT_CARD'

export interface DetectedForm {
  formType: FormType
  fields: FieldClassification[]
  container: HTMLElement
}

// ========== Visibility check (Section 10.1) ==========

// Fields smaller than this (in CSS px) are treated as hidden: a real input
// the user can see and type into is never this small.
const MIN_VISIBLE_SIZE = 8
// Cumulative opacity (element × all ancestors) below which a field is hidden.
const MIN_EFFECTIVE_OPACITY = 0.1

/** Parent element, crossing shadow root boundaries (ShadowRoot → host). */
function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/**
 * Opacity is not inherited in computed style, so a field inside an
 * `opacity: 0` (or 0.01) container still reports its own opacity as 1.
 * Multiply along the ancestor chain to get what the user actually sees.
 */
function effectiveOpacity(el: HTMLElement): number {
  let opacity = 1
  for (let node: Element | null = el; node; node = composedParent(node)) {
    const value = Number.parseFloat(getComputedStyle(node).opacity)
    if (!Number.isNaN(value)) opacity *= value
    if (opacity < MIN_EFFECTIVE_OPACITY) break
  }
  return opacity
}

/**
 * When the field's center is inside the viewport, check that the topmost
 * element there is the field itself (or its descendant / its <label>).
 * Catches fields hidden underneath other elements. Fields outside the
 * viewport (e.g. below the fold) cannot be hit-tested and are not rejected.
 */
function isNotCovered(el: HTMLElement, rect: DOMRect): boolean {
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return true

  const root = el.getRootNode() as Document | ShadowRoot
  if (typeof root.elementFromPoint !== 'function') return true
  const hit = root.elementFromPoint(x, y)
  if (!hit) return true
  if (hit === el || el.contains(hit)) return true

  const label = hit.closest('label')
  if (label && el instanceof HTMLInputElement && el.labels) {
    return Array.from(el.labels).includes(label)
  }
  return false
}

/**
 * Whether the user can actually see the field. Used before showing
 * suggestions and before every fill, so that credentials are never written
 * into fields an attacker has hidden (invisible form attack).
 */
export function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < MIN_VISIBLE_SIZE || rect.height < MIN_VISIBLE_SIZE) return false

  const style = getComputedStyle(el)
  if (style.visibility !== 'visible' || style.display === 'none') return false

  // Positioned entirely outside the document's scrollable area (e.g. left: -9999px)
  if (rect.right + window.scrollX <= 0 || rect.bottom + window.scrollY <= 0) return false

  if (effectiveOpacity(el) < MIN_EFFECTIVE_OPACITY) return false

  return isNotCovered(el, rect)
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
  // Crosses shadow DOM boundaries via ShadowRoot → host element
  let container: HTMLElement = input
  for (let i = 0; i < 4; i++) {
    if (container.parentElement && container.parentElement !== document.body) {
      container = container.parentElement
    } else if (container.parentNode instanceof ShadowRoot) {
      container = container.parentNode.host as HTMLElement
    } else {
      break
    }
  }
  return container
}

/**
 * Collect all visible <input> elements within a container,
 * piercing open shadow roots recursively.
 */
function collectInputs(container: HTMLElement): HTMLInputElement[] {
  const results: HTMLInputElement[] = []
  collectInputsRecursive(container, results)
  return results.filter(isVisible)
}

function collectInputsRecursive(root: HTMLElement | ShadowRoot, results: HTMLInputElement[]) {
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    results.push(input)
  }
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      collectInputsRecursive(el.shadowRoot, results)
    }
  }
}

// ========== Form type classification (Section 3.2) ==========

export function classifyFormType(fields: FieldClassification[]): FormType | null {
  const hasType = (t: FieldType) => fields.some((f) => f.type === t)
  const countType = (t: FieldType) => fields.filter((f) => f.type === t).length

  const hasUsername = hasType('username')
  const passwordCount = countType('password')
  const hasTotp = hasType('totp')
  const hasAnyCc =
    hasType('cc_number') || hasType('cc_name') || hasType('cc_exp') || hasType('cc_cvc')

  // TOTP: single short numeric input
  if (hasTotp && fields.length <= 2) {
    return 'TOTP'
  }

  // CREDIT_CARD: any cc_* field present
  if (hasAnyCc) {
    return 'CREDIT_CARD'
  }

  // LOGIN: username + password
  if (hasUsername && passwordCount >= 1) {
    return 'LOGIN'
  }

  // LOGIN_USERNAME: username only, no password
  if (hasUsername && passwordCount === 0) {
    return 'LOGIN_USERNAME'
  }

  // LOGIN_PASSWORD: password only, no username
  if (!hasUsername && passwordCount >= 1) {
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
    return null
  }

  const container = findFormContainer(focusedInput)
  const inputs = collectInputs(container)

  if (inputs.length === 0) return null

  // Classify all fields in the container
  const classifications: FieldClassification[] = []
  for (const input of inputs) {
    const classification = classifyField(input)
    if (classification) {
      classifications.push(classification)
    }
  }

  if (classifications.length === 0) {
    return null
  }

  // Determine form type
  const formType = classifyFormType(classifications)
  if (!formType) return null

  return {
    formType,
    fields: classifications,
    container,
  }
}
