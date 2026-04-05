// Field classification using weighted signal scoring (design doc Section 3.1)

export type FieldType =
  | 'username'
  | 'password'
  | 'new_password'
  | 'totp'
  | 'cc_number'
  | 'cc_exp'
  | 'cc_cvc'
  | 'cc_name'

export interface FieldClassification {
  type: FieldType
  score: number
  element: HTMLInputElement
}

// ========== Skip patterns ==========

const SKIP_SELECTORS = ['input[type="search"]', 'input[role="searchbox"]']

const SKIP_ATTR_PATTERNS = [/search/i, /query/i, /keyword/i]

function shouldSkip(input: HTMLInputElement): boolean {
  for (const sel of SKIP_SELECTORS) {
    if (input.matches(sel)) return true
  }
  const ariaLabel = input.getAttribute('aria-label') || ''
  const name = input.name || ''
  for (const pattern of SKIP_ATTR_PATTERNS) {
    if (pattern.test(ariaLabel) || pattern.test(name)) return true
  }
  // Skip hidden/non-interactive types
  const type = input.type.toLowerCase()
  if (
    [
      'hidden',
      'submit',
      'button',
      'reset',
      'image',
      'file',
      'checkbox',
      'radio',
      'range',
      'color',
    ].includes(type)
  ) {
    return true
  }
  return false
}

// ========== Signal definitions ==========

interface SignalDef {
  autocomplete: string[]
  typeHints: string[]
  nameIdPatterns: RegExp[]
  labelPatterns: RegExp[]
}

const SIGNAL_DEFS: Record<FieldType, SignalDef> = {
  username: {
    autocomplete: ['username'],
    typeHints: ['email', 'tel', 'text'],
    nameIdPatterns: [/^(user|email|login|account|phone|id)/i],
    labelPatterns: [
      /\b(user\s?name|email|log\s?in|account|ユーザー|メール|アカウント|ログイン)\b/i,
    ],
  },
  password: {
    autocomplete: ['current-password'],
    typeHints: ['password'],
    nameIdPatterns: [/^(pass|pwd|senha|contrase)/i],
    labelPatterns: [/\b(password|パスワード)\b/i],
  },
  new_password: {
    autocomplete: ['new-password'],
    typeHints: ['password'],
    nameIdPatterns: [/^(new.?pass|confirm.?pass|retype)/i],
    labelPatterns: [/\b(new\s*password|confirm\s*password|新しいパスワード|パスワード.?確認)\b/i],
  },
  totp: {
    autocomplete: ['one-time-code'],
    typeHints: ['text', 'number', 'tel'],
    nameIdPatterns: [/^(otp|totp|code|token|verify|mfa|2fa)/i],
    labelPatterns: [/\b(otp|verification\s*code|認証コード|確認コード)\b/i],
  },
  cc_number: {
    autocomplete: ['cc-number'],
    typeHints: [],
    nameIdPatterns: [/^(card.?num|cc.?num|credit)/i],
    labelPatterns: [/\b(card\s*number|カード番号)\b/i],
  },
  cc_exp: {
    autocomplete: ['cc-exp', 'cc-exp-month', 'cc-exp-year'],
    typeHints: [],
    nameIdPatterns: [/^(exp|valid)/i],
    labelPatterns: [/\b(expir|有効期限)\b/i],
  },
  cc_cvc: {
    autocomplete: ['cc-csc', 'cc-cvc', 'cc-cvv'],
    typeHints: [],
    nameIdPatterns: [/^(cvc|cvv|csc|security.?code)/i],
    labelPatterns: [/\b(cvc|cvv|security\s*code|セキュリティコード)\b/i],
  },
  cc_name: {
    autocomplete: ['cc-name'],
    typeHints: [],
    nameIdPatterns: [/^(card.?holder|cc.?name)/i],
    labelPatterns: [/\b(card\s*holder|name\s*on\s*card|カード名義)\b/i],
  },
}

// Signal weights
const WEIGHT_AUTOCOMPLETE = 10
const WEIGHT_TYPE = 8
const WEIGHT_NAME_ID = 6
const WEIGHT_ARIA_LABEL_PLACEHOLDER = 4
const WEIGHT_LABEL = 4
const WEIGHT_URL = 2

// Minimum score to classify a field
const MIN_SCORE = 4

// ========== Signal extraction ==========

function getAutocompleteValue(input: HTMLInputElement): string {
  return (input.getAttribute('autocomplete') || '').trim().toLowerCase()
}

function getAssociatedLabelText(input: HTMLInputElement): string {
  // Try <label for="...">
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
    if (label) return label.textContent || ''
  }
  // Try parent <label>
  const parentLabel = input.closest('label')
  if (parentLabel) return parentLabel.textContent || ''
  return ''
}

function getTextSignals(input: HTMLInputElement): string {
  return [
    input.getAttribute('aria-label') || '',
    input.getAttribute('placeholder') || '',
    input.getAttribute('title') || '',
  ].join(' ')
}

// ========== Scoring ==========

function scoreField(input: HTMLInputElement): Map<FieldType, number> {
  const scores = new Map<FieldType, number>()
  const autocomplete = getAutocompleteValue(input)
  const inputType = input.type.toLowerCase()
  const nameId = `${input.name} ${input.id}`.toLowerCase()
  const textSignals = getTextSignals(input)
  const labelText = getAssociatedLabelText(input)

  for (const [fieldType, def] of Object.entries(SIGNAL_DEFS) as [FieldType, SignalDef][]) {
    let score = 0

    // 1. autocomplete attribute (weight: 10)
    if (autocomplete && def.autocomplete.includes(autocomplete)) {
      score += WEIGHT_AUTOCOMPLETE
    }

    // 2. type attribute (weight: 8)
    if (def.typeHints.includes(inputType)) {
      // For password type, distinguish between password and new_password
      if (inputType === 'password' && fieldType === 'password') {
        score += WEIGHT_TYPE
      } else if (inputType === 'password' && fieldType === 'new_password') {
        // new_password gets lower type score — it needs additional signals to win
        score += WEIGHT_TYPE - 2
      } else if (inputType !== 'password') {
        score += WEIGHT_TYPE
      }
    }

    // 3. name/id patterns (weight: 6)
    for (const pattern of def.nameIdPatterns) {
      if (pattern.test(nameId)) {
        score += WEIGHT_NAME_ID
        break
      }
    }

    // 4. aria-label / placeholder / title (weight: 4)
    for (const pattern of def.labelPatterns) {
      if (pattern.test(textSignals)) {
        score += WEIGHT_ARIA_LABEL_PLACEHOLDER
        break
      }
    }

    // 5. Associated <label> text (weight: 4)
    if (labelText) {
      for (const pattern of def.labelPatterns) {
        if (pattern.test(labelText)) {
          score += WEIGHT_LABEL
          break
        }
      }
    }

    if (score > 0) {
      scores.set(fieldType, score)
    }
  }

  // 6. URL context (weight: 2) — tiebreaker only
  const path = window.location.pathname.toLowerCase()
  if (/\/(login|signin|auth)/.test(path)) {
    addScore(scores, 'username', WEIGHT_URL)
    addScore(scores, 'password', WEIGHT_URL)
  } else if (/\/(register|signup)/.test(path)) {
    addScore(scores, 'username', WEIGHT_URL)
    addScore(scores, 'new_password', WEIGHT_URL)
  }

  return scores
}

function addScore(scores: Map<FieldType, number>, type: FieldType, amount: number) {
  scores.set(type, (scores.get(type) || 0) + amount)
}

// ========== Public API ==========

export function classifyField(input: HTMLInputElement): FieldClassification | null {
  if (shouldSkip(input)) return null

  const scores = scoreField(input)
  if (scores.size === 0) return null

  // Find the highest scoring type
  let bestType: FieldType | null = null
  let bestScore = 0
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }

  if (!bestType || bestScore < MIN_SCORE) return null

  return { type: bestType, score: bestScore, element: input }
}
