// Debug data collector for developer mode
// Inspects the current page's form detection results without filling

import type {
  DevModeDebugReport,
  DevModeFieldReport,
  DevModeFormReport,
} from '../shared/dev-mode-types'
import type { SitePattern } from '../shared/pattern-types'
import { type FieldType, classifyField, computeScores, type FieldSignals } from './field-classifier'
import { classifyFormType, isVisible } from './form-detector'
import { evaluateCondition, findMatchingPattern, resolveField } from './pattern-matcher'

/**
 * Collect a debug report for the current page.
 * Runs pattern matching and heuristic detection without performing any fill operations.
 */
export function collectDebugReport(
  builtinPatterns: SitePattern[],
  customPatterns: SitePattern[] | null,
): DevModeDebugReport {
  const hostname = window.location.hostname
  const url = window.location.href
  const effectivePatterns = customPatterns ?? builtinPatterns
  const patternSource = customPatterns ? 'custom' : 'builtin'

  const matchedPattern = findMatchingPattern(effectivePatterns, hostname)

  const report: DevModeDebugReport = {
    timestamp: Date.now(),
    url,
    hostname,
    matchType: 'none',
    patternSource: patternSource as 'builtin' | 'custom',
    forms: [],
  }

  if (matchedPattern) {
    report.matchType = matchedPattern.match.type
    report.matchedPatternDescription = matchedPattern.description
    report.matchedPatternValue = matchedPattern.match.value

    // Collect pattern-based form reports
    if (matchedPattern.forms && matchedPattern.forms.length > 0) {
      for (const form of matchedPattern.forms) {
        const formReport = collectPatternFormReport(form)
        report.forms.push(formReport)
      }
    }
  }

  // Always collect heuristic results for comparison
  const heuristicForms = collectHeuristicFormReports()
  if (heuristicForms.length > 0) {
    if (!matchedPattern) {
      report.matchType = 'heuristic'
    }
    report.forms.push(...heuristicForms)
  }

  return report
}

function collectPatternFormReport(form: {
  id: string
  type: string
  condition?: { url_path?: string; element_exists?: string; element_not_exists?: string }
  fields: Record<string, { selector: string; fallback_selectors?: string[] }>
}): DevModeFormReport {
  const conditionMet = evaluateCondition(form.condition)

  const fields: DevModeFieldReport[] = []
  for (const [fieldName, fieldDef] of Object.entries(form.fields)) {
    const element = resolveField(fieldDef)
    const matched = element !== null

    const fieldReport: DevModeFieldReport = {
      type: fieldName,
      score: matched ? 100 : 0,
      selector: fieldDef.selector,
      selectorMatched: matched,
      element: element
        ? {
            tagName: element.tagName,
            id: element.id,
            name: element.name,
            type: element.type,
            autocomplete: element.getAttribute('autocomplete') || '',
            visible: isVisible(element),
          }
        : {
            tagName: '',
            id: '',
            name: '',
            type: '',
            autocomplete: '',
            visible: false,
          },
    }
    fields.push(fieldReport)
  }

  return {
    formId: form.id,
    formType: `${form.type}${conditionMet ? '' : ' (condition not met)'}`,
    detectionMethod: 'pattern',
    fields,
  }
}

function collectHeuristicFormReports(): DevModeFormReport[] {
  // Collect all visible input elements on the page
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(isVisible)
  if (inputs.length === 0) return []

  const fields: DevModeFieldReport[] = []
  const classifications = []

  for (const input of inputs) {
    const classification = classifyField(input)

    // Compute all scores for debug display
    const signals: FieldSignals = {
      autocomplete: (input.getAttribute('autocomplete') || '').trim().toLowerCase(),
      inputType: input.type.toLowerCase(),
      nameId: `${input.name} ${input.id}`.toLowerCase(),
      textSignals: [
        input.getAttribute('aria-label') || '',
        input.getAttribute('placeholder') || '',
        input.getAttribute('title') || '',
      ].join(' '),
      labelText: getAssociatedLabelText(input),
      urlPath: window.location.pathname.toLowerCase(),
    }
    const allScores = computeScores(signals)
    const scoresObj: Record<string, number> = {}
    for (const [type, score] of allScores) {
      scoresObj[type] = score
    }

    fields.push({
      type: classification?.type || 'unknown',
      score: classification?.score || 0,
      allScores: scoresObj,
      element: {
        tagName: input.tagName,
        id: input.id,
        name: input.name,
        type: input.type,
        autocomplete: input.getAttribute('autocomplete') || '',
        visible: true,
      },
    })

    if (classification) {
      classifications.push(classification)
    }
  }

  if (fields.length === 0) return []

  const formType = classifyFormType(classifications)

  return [
    {
      formType: formType || 'unknown',
      detectionMethod: 'heuristic',
      fields,
    },
  ]
}

function getAssociatedLabelText(input: HTMLInputElement): string {
  const rootNode = input.getRootNode() as Document | ShadowRoot
  if (input.id) {
    const label = rootNode.querySelector(`label[for="${CSS.escape(input.id)}"]`)
    if (label) return label.textContent || ''
  }
  const parentLabel = input.closest('label')
  if (parentLabel) return parentLabel.textContent || ''
  return ''
}
