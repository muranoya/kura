import { describe, expect, it } from 'vitest'
import { detectFormByPattern } from '../content/pattern-detector'
import type { SitePattern } from '../shared/pattern-types'

function createInput(attrs: Record<string, string> = {}): HTMLInputElement {
  const input = document.createElement('input')
  for (const [key, value] of Object.entries(attrs)) {
    input.setAttribute(key, value)
  }
  makeVisible(input)
  return input
}

function makeVisible(el: HTMLElement) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 }),
  })
}

describe('detectFormByPattern', () => {
  it('returns null when pattern has no forms', async () => {
    const pattern: SitePattern = {
      description: 'No forms',
      match: { type: 'domain', value: 'example.com' },
    }
    const input = createInput({ id: 'user' })
    document.body.appendChild(input)

    const result = await detectFormByPattern(input, pattern)
    expect(result).toBeNull()

    input.remove()
  })

  it('returns null when pattern has empty forms array', async () => {
    const pattern: SitePattern = {
      description: 'Empty forms',
      match: { type: 'domain', value: 'example.com' },
      forms: [],
    }
    const input = createInput({ id: 'user' })
    document.body.appendChild(input)

    const result = await detectFormByPattern(input, pattern)
    expect(result).toBeNull()

    input.remove()
  })

  it('detects login form with matching selectors', async () => {
    const usernameInput = createInput({ id: 'user-input' })
    const passwordInput = createInput({ id: 'pass-input', type: 'password' })
    makeVisible(passwordInput)
    document.body.appendChild(usernameInput)
    document.body.appendChild(passwordInput)

    const pattern: SitePattern = {
      description: 'Test login',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'login',
          type: 'login',
          fields: {
            username: { selector: '#user-input' },
            password: { selector: '#pass-input' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(usernameInput, pattern)
    expect(result).not.toBeNull()
    expect(result?.form.formType).toBe('LOGIN')
    expect(result?.form.fields).toHaveLength(2)
    expect(result?.form.fields.map((f) => f.type)).toContain('username')
    expect(result?.form.fields.map((f) => f.type)).toContain('password')
    expect(result?.strictSubdomain).toBe(false)

    usernameInput.remove()
    passwordInput.remove()
  })

  it('returns strict_subdomain from pattern match', async () => {
    const input = createInput({ id: 'strict-user' })
    document.body.appendChild(input)

    const pattern: SitePattern = {
      description: 'Strict subdomain',
      match: { type: 'domain_suffix', value: 'example.com', strict_subdomain: true },
      forms: [
        {
          id: 'login_username',
          type: 'login_username',
          fields: {
            username: { selector: '#strict-user' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(input, pattern)
    expect(result).not.toBeNull()
    expect(result?.strictSubdomain).toBe(true)

    input.remove()
  })

  it('skips form when condition element_exists fails', async () => {
    const input = createInput({ id: 'cond-user' })
    document.body.appendChild(input)

    const pattern: SitePattern = {
      description: 'Condition fail',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'step1',
          type: 'login_username',
          condition: { element_exists: '#nonexistent-marker' },
          fields: {
            username: { selector: '#cond-user' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(input, pattern)
    expect(result).toBeNull()

    input.remove()
  })

  it('selects correct form based on condition', async () => {
    const marker = document.createElement('div')
    marker.id = 'password-marker'
    document.body.appendChild(marker)

    const passwordInput = createInput({ id: 'cond-pass', type: 'password' })
    document.body.appendChild(passwordInput)

    const pattern: SitePattern = {
      description: 'Multi-form condition',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'username-step',
          type: 'login_username',
          condition: { element_exists: '#username-marker' },
          fields: {
            username: { selector: '#cond-user' },
          },
        },
        {
          id: 'password-step',
          type: 'login_password',
          condition: { element_exists: '#password-marker' },
          fields: {
            password: { selector: '#cond-pass' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(passwordInput, pattern)
    expect(result).not.toBeNull()
    expect(result?.form.formType).toBe('LOGIN_PASSWORD')

    marker.remove()
    passwordInput.remove()
  })

  it('returns null when focused input is not in any form fields', async () => {
    const usernameInput = createInput({ id: 'form-user' })
    const unrelatedInput = createInput({ id: 'unrelated' })
    document.body.appendChild(usernameInput)
    document.body.appendChild(unrelatedInput)

    const pattern: SitePattern = {
      description: 'Focused not in form',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'login',
          type: 'login_username',
          fields: {
            username: { selector: '#form-user' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(unrelatedInput, pattern)
    expect(result).toBeNull()

    usernameInput.remove()
    unrelatedInput.remove()
  })

  it('skips form when field selector does not resolve', async () => {
    const input = createInput({ id: 'existing-input' })
    document.body.appendChild(input)

    const pattern: SitePattern = {
      description: 'Missing field',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'login',
          type: 'login',
          fields: {
            username: { selector: '#existing-input' },
            password: { selector: '#nonexistent-pass' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(input, pattern)
    expect(result).toBeNull()

    input.remove()
  })

  it('excludes fields matching skip_fields', async () => {
    const userInput = createInput({ id: 'skip-user', class: 'skip-me' })
    const passInput = createInput({ id: 'skip-pass', type: 'password' })
    makeVisible(passInput)
    document.body.appendChild(userInput)
    document.body.appendChild(passInput)

    const pattern: SitePattern = {
      description: 'Skip fields',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'login',
          type: 'login',
          fields: {
            username: { selector: '#skip-user' },
            password: { selector: '#skip-pass' },
          },
          skip_fields: ['.skip-me'],
        },
      ],
    }

    // Focus on password field — username is skipped, but password resolves
    const result = await detectFormByPattern(passInput, pattern)
    expect(result).not.toBeNull()
    expect(result?.form.fields).toHaveLength(1)
    expect(result?.form.fields[0].type).toBe('password')

    userInput.remove()
    passInput.remove()
  })

  it('returns the first form when multiple forms all satisfy their conditions', async () => {
    // 2つのformが両方とも、condition・全フィールド解決・focusedInput包含を満たす場合、
    // 配列先頭のformが採用される（First-Match-Wins）ことを保証する。
    const sharedInput = createInput({ id: 'shared-user' })
    document.body.appendChild(sharedInput)

    const pattern: SitePattern = {
      description: 'Two matching forms',
      match: { type: 'domain', value: 'example.com' },
      forms: [
        {
          id: 'first-form',
          type: 'login_username',
          fields: {
            username: { selector: '#shared-user' },
          },
        },
        {
          id: 'second-form',
          type: 'login_password',
          fields: {
            password: { selector: '#shared-user' },
          },
        },
      ],
    }

    const result = await detectFormByPattern(sharedInput, pattern)
    expect(result).not.toBeNull()
    expect(result?.form.formType).toBe('LOGIN_USERNAME')

    sharedInput.remove()
  })

  it('maps all form types correctly', async () => {
    const typeMap: Record<string, string> = {
      login: 'LOGIN',
      login_username: 'LOGIN_USERNAME',
      login_password: 'LOGIN_PASSWORD',
      totp: 'TOTP',
      credit_card: 'CREDIT_CARD',
    }

    for (const [jsonType, expectedFormType] of Object.entries(typeMap)) {
      const input = createInput({ id: `type-test-${jsonType}` })
      document.body.appendChild(input)

      const fieldName =
        jsonType === 'totp' ? 'totp' : jsonType === 'credit_card' ? 'cc_number' : 'username'

      const pattern: SitePattern = {
        description: `Type map test: ${jsonType}`,
        match: { type: 'domain', value: 'example.com' },
        forms: [
          {
            id: 'test',
            type: jsonType,
            fields: {
              [fieldName]: { selector: `#type-test-${jsonType}` },
            },
          },
        ],
      }

      const result = await detectFormByPattern(input, pattern)
      expect(result).not.toBeNull()
      expect(result?.form.formType).toBe(expectedFormType)

      input.remove()
    }
  })
})
