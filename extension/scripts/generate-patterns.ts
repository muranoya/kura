import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SITES_DIR = resolve(import.meta.dirname, '../patterns/sites')
const SCHEMA_PATH = resolve(import.meta.dirname, '../patterns/schema.json')
const OUTPUT_PATH = resolve(import.meta.dirname, '../src/shared/patterns-data.generated.ts')

const VALID_MATCH_TYPES = ['domain', 'domain_suffix']
const VALID_FORM_TYPES = ['login', 'login_username', 'login_password', 'totp', 'credit_card']
const VALID_FIELD_NAMES = new Set([
  'username',
  'password',
  'totp',
  'cc_number',
  'cc_exp',
  'cc_cvc',
  'cc_name',
])

interface ValidationError {
  file: string
  message: string
}

function validate(data: unknown, file: string): ValidationError[] {
  const errors: ValidationError[] = []
  const err = (msg: string) => errors.push({ file, message: msg })

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    err('Root must be an object')
    return errors
  }

  const obj = data as Record<string, unknown>

  // Required fields
  if (typeof obj.description !== 'string' || !obj.description) {
    err('"description" is required and must be a non-empty string')
  }

  if (typeof obj.match !== 'object' || obj.match === null) {
    err('"match" is required and must be an object')
    return errors
  }

  const match = obj.match as Record<string, unknown>
  if (!VALID_MATCH_TYPES.includes(match.type as string)) {
    err(`"match.type" must be one of: ${VALID_MATCH_TYPES.join(', ')}`)
  }
  if (typeof match.value !== 'string' || !match.value) {
    err('"match.value" is required and must be a non-empty string')
  }
  if (match.strict_subdomain !== undefined && typeof match.strict_subdomain !== 'boolean') {
    err('"match.strict_subdomain" must be a boolean')
  }

  // Optional disabled
  if (obj.disabled !== undefined && typeof obj.disabled !== 'boolean') {
    err('"disabled" must be a boolean')
  }

  // Optional forms
  if (obj.forms !== undefined) {
    if (!Array.isArray(obj.forms)) {
      err('"forms" must be an array')
      return errors
    }

    for (let i = 0; i < obj.forms.length; i++) {
      const form = obj.forms[i] as Record<string, unknown>
      const prefix = `forms[${i}]`

      if (typeof form.id !== 'string' || !form.id) {
        err(`${prefix}.id is required`)
      }
      if (!VALID_FORM_TYPES.includes(form.type as string)) {
        err(`${prefix}.type must be one of: ${VALID_FORM_TYPES.join(', ')}`)
      }

      // condition
      if (form.condition !== undefined) {
        const cond = form.condition as Record<string, unknown>
        if (cond.url_path !== undefined && typeof cond.url_path !== 'string') {
          err(`${prefix}.condition.url_path must be a string`)
        }
        if (cond.element_exists !== undefined && typeof cond.element_exists !== 'string') {
          err(`${prefix}.condition.element_exists must be a string`)
        }
        if (cond.element_not_exists !== undefined && typeof cond.element_not_exists !== 'string') {
          err(`${prefix}.condition.element_not_exists must be a string`)
        }
      }

      // wait_for
      if (form.wait_for !== undefined) {
        const wf = form.wait_for as Record<string, unknown>
        if (typeof wf.selector !== 'string' || !wf.selector) {
          err(`${prefix}.wait_for.selector is required`)
        }
        if (wf.timeout_ms !== undefined && typeof wf.timeout_ms !== 'number') {
          err(`${prefix}.wait_for.timeout_ms must be a number`)
        }
      }

      // fields
      if (typeof form.fields !== 'object' || form.fields === null) {
        err(`${prefix}.fields is required and must be an object`)
      } else {
        const fields = form.fields as Record<string, unknown>
        for (const [fieldName, fieldDef] of Object.entries(fields)) {
          if (!VALID_FIELD_NAMES.has(fieldName)) {
            err(`${prefix}.fields: unknown field name "${fieldName}"`)
          }
          const fd = fieldDef as Record<string, unknown>
          if (typeof fd.selector !== 'string' || !fd.selector) {
            err(`${prefix}.fields.${fieldName}.selector is required`)
          }
          if (fd.fallback_selectors !== undefined) {
            if (
              !Array.isArray(fd.fallback_selectors) ||
              !fd.fallback_selectors.every((s: unknown) => typeof s === 'string')
            ) {
              err(`${prefix}.fields.${fieldName}.fallback_selectors must be a string array`)
            }
          }
        }
      }

      // skip_fields
      if (form.skip_fields !== undefined) {
        if (
          !Array.isArray(form.skip_fields) ||
          !form.skip_fields.every((s: unknown) => typeof s === 'string')
        ) {
          err(`${prefix}.skip_fields must be a string array`)
        }
      }
    }
  }

  // Check for unknown top-level keys
  const knownKeys = new Set(['description', 'match', 'disabled', 'forms'])
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      err(`Unknown top-level key: "${key}"`)
    }
  }

  return errors
}

function main() {
  console.log(`Schema: ${SCHEMA_PATH}`)
  console.log(`Sites directory: ${SITES_DIR}`)

  if (!existsSync(SITES_DIR)) {
    console.log('No sites directory found, generating empty patterns')
    writeOutput([])
    return
  }

  const files = readdirSync(SITES_DIR).filter((f) => f.endsWith('.json'))
  console.log(`Found ${files.length} pattern file(s)`)

  const patterns: unknown[] = []
  const allErrors: ValidationError[] = []

  for (const file of files) {
    const filePath = resolve(SITES_DIR, file)
    const content = readFileSync(filePath, 'utf-8')
    let data: unknown
    try {
      data = JSON.parse(content)
    } catch (e) {
      allErrors.push({ file, message: `Invalid JSON: ${e}` })
      continue
    }

    const errors = validate(data, file)
    if (errors.length > 0) {
      allErrors.push(...errors)
    } else {
      patterns.push(data)
    }
  }

  if (allErrors.length > 0) {
    console.error('\nValidation errors:')
    for (const error of allErrors) {
      console.error(`  ${error.file}: ${error.message}`)
    }
    process.exit(1)
  }

  writeOutput(patterns)
}

function writeOutput(patterns: unknown[]) {
  const tsCode = `// Auto-generated from extension/patterns/sites/ — do not edit manually
// Run: npx tsx scripts/generate-patterns.ts

import type { SitePattern } from './pattern-types'

export const SITE_PATTERNS: SitePattern[] = ${JSON.stringify(patterns, null, 2)} as const
`
  writeFileSync(OUTPUT_PATH, tsCode, 'utf-8')
  console.log(`Generated ${OUTPUT_PATH} (${patterns.length} pattern(s))`)
}

main()
