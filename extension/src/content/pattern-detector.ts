// Pattern-based form detection using site-specific selector rules

import type { SitePattern } from '../shared/pattern-types'
import type { FieldClassification, FieldType } from './field-classifier'
import { type DetectedForm, type FormType, isVisible } from './form-detector'
import { evaluateCondition, resolveField, waitForElement } from './pattern-matcher'

const LOG_PREFIX = '[kura:autofill:pd]'

export interface PatternDetectionResult {
  form: DetectedForm
  strictSubdomain: boolean
}

const FORM_TYPE_MAP: Record<string, FormType> = {
  login: 'LOGIN',
  login_username: 'LOGIN_USERNAME',
  login_password: 'LOGIN_PASSWORD',
  totp: 'TOTP',
  credit_card: 'CREDIT_CARD',
}

/**
 * Attempt pattern-based form detection for a focused input.
 * Returns null if:
 * - The pattern has no forms defined (caller should fall back to heuristic)
 * - No form's condition matches
 * - No form contains the focused input
 */
export async function detectFormByPattern(
  focusedInput: HTMLInputElement,
  pattern: SitePattern,
): Promise<PatternDetectionResult | null> {
  if (!pattern.forms || pattern.forms.length === 0) {
    console.log(LOG_PREFIX, 'Pattern has no forms, falling back to heuristic')
    return null
  }

  const strictSubdomain = pattern.match.strict_subdomain ?? false

  for (const form of pattern.forms) {
    // Evaluate condition
    if (!evaluateCondition(form.condition)) {
      console.log(LOG_PREFIX, `Form "${form.id}": condition not met, skipping`)
      continue
    }

    // Wait for element if specified
    if (form.wait_for) {
      const timeoutMs = form.wait_for.timeout_ms ?? 5000
      const waited = await waitForElement(form.wait_for.selector, timeoutMs)
      if (!waited) {
        console.log(LOG_PREFIX, `Form "${form.id}": wait_for element not found, skipping`)
        continue
      }
    }

    // Resolve all fields
    const fields: FieldClassification[] = []
    let containsFocusedInput = false
    let allResolved = true

    for (const [fieldName, fieldDef] of Object.entries(form.fields)) {
      const element = resolveField(fieldDef)
      if (!element) {
        console.log(
          LOG_PREFIX,
          `Form "${form.id}": field "${fieldName}" selector not found, skipping form`,
        )
        allResolved = false
        break
      }

      if (!isVisible(element)) {
        console.log(
          LOG_PREFIX,
          `Form "${form.id}": field "${fieldName}" not visible, skipping form`,
        )
        allResolved = false
        break
      }

      // Check skip_fields
      if (form.skip_fields) {
        let skipped = false
        for (const skipSelector of form.skip_fields) {
          if (element.matches(skipSelector)) {
            console.log(
              LOG_PREFIX,
              `Form "${form.id}": field "${fieldName}" matches skip selector, excluding`,
            )
            skipped = true
            break
          }
        }
        if (skipped) continue
      }

      if (element === focusedInput) {
        containsFocusedInput = true
      }

      fields.push({
        type: fieldName as FieldType,
        score: 100, // Pattern-matched fields get maximum confidence
        element,
      })
    }

    if (!allResolved) continue

    if (fields.length === 0) {
      console.log(LOG_PREFIX, `Form "${form.id}": no fields resolved`)
      continue
    }

    if (!containsFocusedInput) {
      console.log(LOG_PREFIX, `Form "${form.id}": focused input not in this form`)
      continue
    }

    const formType = FORM_TYPE_MAP[form.type]
    if (!formType) {
      console.warn(LOG_PREFIX, `Form "${form.id}": unknown form type "${form.type}"`)
      continue
    }

    // Find a common container for the resolved fields
    const container = findContainer(fields.map((f) => f.element))

    console.log(
      LOG_PREFIX,
      `Form "${form.id}": matched type=${formType}, fields=${fields.map((f) => f.type).join(',')}`,
    )

    return {
      form: {
        formType,
        fields,
        container,
      },
      strictSubdomain,
    }
  }

  console.log(LOG_PREFIX, 'No pattern form matched')
  return null
}

/**
 * Find a common ancestor container for the given elements.
 */
function findContainer(elements: HTMLElement[]): HTMLElement {
  if (elements.length === 0) return document.body
  if (elements.length === 1)
    return elements[0].closest('form') || elements[0].parentElement || document.body

  // Walk up from the first element and find the closest ancestor containing all elements
  let container: HTMLElement = elements[0]
  while (container.parentElement && container.parentElement !== document.body) {
    container = container.parentElement
    if (elements.every((el) => container.contains(el))) {
      return container
    }
  }
  return container
}
