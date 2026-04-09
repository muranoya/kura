// Developer mode types for pattern DB debugging

export interface DevModeDebugReport {
  timestamp: number
  url: string
  hostname: string
  matchType: 'domain' | 'domain_suffix' | 'heuristic' | 'none'
  matchedPatternDescription?: string
  matchedPatternValue?: string
  patternSource: 'builtin' | 'custom'
  forms: DevModeFormReport[]
}

export interface DevModeFormReport {
  formId?: string
  formType: string
  detectionMethod: 'pattern' | 'heuristic'
  fields: DevModeFieldReport[]
}

export interface DevModeFieldReport {
  type: string
  score: number
  element: {
    tagName: string
    id: string
    name: string
    type: string
    autocomplete: string
    visible: boolean
  }
  // Pattern-based detection
  selector?: string
  selectorMatched?: boolean
  // Heuristic detection: all scores per field type
  allScores?: Record<string, number>
}
