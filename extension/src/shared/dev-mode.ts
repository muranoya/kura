// Developer mode state management
// Custom patterns are stored in chrome.storage.session (memory-only, cleared on browser restart)

import type { SitePattern } from './pattern-types'
import { getFromSessionStorage, removeFromSessionStorage, saveToSessionStorage } from './storage'

const KEY_ENABLED = 'devModeEnabled'
const KEY_PATTERNS = 'devModePatterns'

export async function isDevModeEnabled(): Promise<boolean> {
  return (await getFromSessionStorage<boolean>(KEY_ENABLED)) ?? false
}

export async function setDevModeEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await saveToSessionStorage(KEY_ENABLED, true)
  } else {
    await removeFromSessionStorage(KEY_ENABLED)
    await removeFromSessionStorage(KEY_PATTERNS)
  }
}

export async function getDevModePatterns(): Promise<SitePattern[] | undefined> {
  return getFromSessionStorage<SitePattern[]>(KEY_PATTERNS)
}

export async function setDevModePatterns(patterns: SitePattern[] | null): Promise<void> {
  if (patterns) {
    await saveToSessionStorage(KEY_PATTERNS, patterns)
  } else {
    await removeFromSessionStorage(KEY_PATTERNS)
  }
}

/**
 * Validate a JSON value as SitePattern[].
 * Returns the validated patterns array, or throws with a descriptive error message.
 */
export function validatePatterns(json: unknown): SitePattern[] {
  if (!Array.isArray(json)) {
    throw new Error('JSON must be an array of site patterns')
  }

  const errors: string[] = []

  for (let i = 0; i < json.length; i++) {
    const item = json[i]
    const prefix = `patterns[${i}]`

    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}: must be an object`)
      continue
    }

    if (typeof item.description !== 'string') {
      errors.push(`${prefix}: "description" (string) is required`)
    }

    if (!item.match || typeof item.match !== 'object') {
      errors.push(`${prefix}: "match" (object) is required`)
      continue
    }

    if (!['domain', 'domain_suffix'].includes(item.match.type)) {
      errors.push(`${prefix}.match.type: must be "domain" or "domain_suffix"`)
    }

    if (typeof item.match.value !== 'string' || item.match.value.length === 0) {
      errors.push(`${prefix}.match.value: must be a non-empty string`)
    }

    if (item.forms != null) {
      if (!Array.isArray(item.forms)) {
        errors.push(`${prefix}.forms: must be an array`)
        continue
      }

      const validFormTypes = [
        'login',
        'login_username',
        'login_password',
        'totp',
        'credit_card',
      ]
      const validFieldNames = [
        'username',
        'password',
        'totp',
        'cc_number',
        'cc_exp',
        'cc_cvc',
        'cc_name',
      ]

      for (let j = 0; j < item.forms.length; j++) {
        const form = item.forms[j]
        const fp = `${prefix}.forms[${j}]`

        if (typeof form.id !== 'string') {
          errors.push(`${fp}.id: must be a string`)
        }

        if (!validFormTypes.includes(form.type)) {
          errors.push(`${fp}.type: must be one of ${validFormTypes.join(', ')}`)
        }

        if (!form.fields || typeof form.fields !== 'object') {
          errors.push(`${fp}.fields: must be an object`)
          continue
        }

        for (const [fieldName, fieldDef] of Object.entries(form.fields)) {
          if (!validFieldNames.includes(fieldName)) {
            errors.push(`${fp}.fields.${fieldName}: unknown field name`)
          }
          if (
            !fieldDef ||
            typeof fieldDef !== 'object' ||
            typeof (fieldDef as { selector?: unknown }).selector !== 'string'
          ) {
            errors.push(`${fp}.fields.${fieldName}.selector: must be a string`)
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Pattern validation failed:\n${errors.join('\n')}`)
  }

  return json as SitePattern[]
}
