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

const SKIP_ATTR_PATTERNS = [/search/i, /query/i, /keyword/i, /検索/]

const SKIP_INPUT_TYPES = new Set([
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
])

export interface SkipCheckInput {
  type: string
  name: string
  ariaLabel: string
  matchesSearchSelector: boolean
}

export function shouldSkipField(input: SkipCheckInput): boolean {
  if (input.matchesSearchSelector) return true
  for (const pattern of SKIP_ATTR_PATTERNS) {
    if (pattern.test(input.ariaLabel) || pattern.test(input.name)) return true
  }
  if (SKIP_INPUT_TYPES.has(input.type.toLowerCase())) {
    return true
  }
  return false
}

function shouldSkip(input: HTMLInputElement): boolean {
  let matchesSearchSelector = false
  for (const sel of SKIP_SELECTORS) {
    if (input.matches(sel)) {
      matchesSearchSelector = true
      break
    }
  }
  return shouldSkipField({
    type: input.type,
    name: input.name || '',
    ariaLabel: input.getAttribute('aria-label') || '',
    matchesSearchSelector,
  })
}

// ========== Signal definitions ==========

interface SignalDef {
  autocomplete: string[]
  typeHints: string[]
  nameIdPatterns: RegExp[]
  labelPatterns: RegExp[]
}

// Label patterns are split into ASCII (\b word-boundary protected) and
// Japanese (no-boundary) sets. JavaScript's \b only recognizes ASCII word
// boundaries; CJK characters are all \W, so /\bログイン\b/ never matches.
const SIGNAL_DEFS: Record<FieldType, SignalDef> = {
  username: {
    autocomplete: ['username'],
    typeHints: ['email', 'tel'],
    nameIdPatterns: [/^(user|email|login|account|phone|id)/i],
    labelPatterns: [
      /\b(user\s?name|email|log\s?in|account)\b/i,
      /(ユーザー(?:名|ID)|メール(?:アドレス)?|アカウント|ログイン(?:ID)?)/,
    ],
  },
  password: {
    autocomplete: ['current-password'],
    typeHints: ['password'],
    nameIdPatterns: [/^(pass|pwd|senha|contrase)/i],
    // The Japanese pattern must not match "新しいパスワード" / "パスワード確認" /
    // "パスワード（確認）" — those belong to new_password. Excluded via
    // lookbehind/lookahead.
    labelPatterns: [/\bpassword\b/i, /(?<!新しい)パスワード(?!\s*(?:確認|（確認）|\(確認\)))/],
  },
  new_password: {
    autocomplete: ['new-password'],
    typeHints: ['password'],
    nameIdPatterns: [/^(new.?pass|confirm.?pass)/i],
    labelPatterns: [
      /\b(new\s*password|confirm\s*password)\b/i,
      /(新しいパスワード|パスワード\s*\(?\s*確認\s*\)?|パスワード（確認）)/,
    ],
  },
  totp: {
    autocomplete: ['one-time-code'],
    typeHints: ['number', 'tel'],
    nameIdPatterns: [/^(otp|totp|code|token|verify|mfa|2fa)/i],
    labelPatterns: [
      /\b(otp|verification\s*code)\b/i,
      /(認証コード|確認コード|ワンタイムパスワード)/,
    ],
  },
  cc_number: {
    autocomplete: ['cc-number'],
    typeHints: [],
    nameIdPatterns: [/^(card.?num|cc.?num|credit)/i],
    labelPatterns: [/\b(card\s*number)\b/i, /カード番号/],
  },
  cc_exp: {
    autocomplete: ['cc-exp', 'cc-exp-month', 'cc-exp-year'],
    typeHints: [],
    nameIdPatterns: [/^(exp|valid)/i],
    labelPatterns: [/\bexpir/i, /有効期限/],
  },
  cc_cvc: {
    autocomplete: ['cc-csc', 'cc-cvc', 'cc-cvv'],
    typeHints: [],
    nameIdPatterns: [/^(cvc|cvv|csc|security.?code)/i],
    labelPatterns: [/\b(cvc|cvv|security\s*code)\b/i, /セキュリティコード/],
  },
  cc_name: {
    autocomplete: ['cc-name'],
    typeHints: [],
    nameIdPatterns: [/^(card.?holder|cc.?name)/i],
    labelPatterns: [/\b(card\s*holder|name\s*on\s*card)\b/i, /カード名義/],
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
  // Use getRootNode() to search within shadow roots as well as the main document
  const rootNode = input.getRootNode() as Document | ShadowRoot
  // Try <label for="...">
  if (input.id) {
    const label = rootNode.querySelector(`label[for="${CSS.escape(input.id)}"]`)
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

export interface FieldSignals {
  autocomplete: string
  inputType: string
  name: string
  id: string
  textSignals: string
  labelText: string
  urlPath: string
}

export function computeScores(signals: FieldSignals): Map<FieldType, number> {
  const scores = new Map<FieldType, number>()

  for (const [fieldType, def] of Object.entries(SIGNAL_DEFS) as [FieldType, SignalDef][]) {
    let score = 0

    // 1. autocomplete attribute (weight: 10)
    if (signals.autocomplete && def.autocomplete.includes(signals.autocomplete)) {
      score += WEIGHT_AUTOCOMPLETE
    }

    // 2. type attribute (weight: 8)
    if (def.typeHints.includes(signals.inputType)) {
      score += WEIGHT_TYPE
    }

    // 3. name/id patterns (weight: 6) — name and id are tested independently
    // so that a match on either scores. Joining them with a space would let
    // a non-matching name hide a matching id from the leading-anchor regex.
    const nameIdHit = def.nameIdPatterns.some(
      (pattern) =>
        (signals.name && pattern.test(signals.name)) || (signals.id && pattern.test(signals.id)),
    )
    if (nameIdHit) {
      score += WEIGHT_NAME_ID
    }

    // 4. aria-label / placeholder / title (weight: 4)
    for (const pattern of def.labelPatterns) {
      if (pattern.test(signals.textSignals)) {
        score += WEIGHT_ARIA_LABEL_PLACEHOLDER
        break
      }
    }

    // 5. Associated <label> text (weight: 4)
    if (signals.labelText) {
      for (const pattern of def.labelPatterns) {
        if (pattern.test(signals.labelText)) {
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
  if (/\/(login|signin|auth|register|signup)/.test(signals.urlPath)) {
    addScore(scores, 'username', WEIGHT_URL)
    addScore(scores, 'password', WEIGHT_URL)
  }

  return scores
}

function scoreField(input: HTMLInputElement): Map<FieldType, number> {
  return computeScores({
    autocomplete: getAutocompleteValue(input),
    inputType: input.type.toLowerCase(),
    name: (input.name || '').toLowerCase(),
    id: (input.id || '').toLowerCase(),
    textSignals: getTextSignals(input),
    labelText: getAssociatedLabelText(input),
    urlPath: window.location.pathname.toLowerCase(),
  })
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
