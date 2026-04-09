// Developer mode bridge for content scripts
// Handles pattern overrides and debug data collection

import { getDevModePatterns, isDevModeEnabled } from '../shared/dev-mode'
import type { SitePattern } from '../shared/pattern-types'
import { SITE_PATTERNS } from '../shared/patterns-data.generated'
import { collectDebugReport } from './debug-collector'

let customPatterns: SitePattern[] | null = null
let devModeEnabled = false

/**
 * Initialize developer mode bridge.
 * Checks session storage for existing custom patterns and registers message listeners.
 */
export async function initDevMode() {
  devModeEnabled = await isDevModeEnabled()
  if (devModeEnabled) {
    const patterns = await getDevModePatterns()
    if (patterns) {
      customPatterns = patterns
      console.log(
        '[kura:devmode]',
        `Loaded ${customPatterns.length} custom patterns from session storage`,
      )
    }
  }
}

/**
 * Returns the effective patterns to use for form detection.
 * If developer mode has custom patterns loaded, returns those; otherwise returns built-in patterns.
 */
export function getEffectivePatterns(): SitePattern[] {
  return customPatterns ?? SITE_PATTERNS
}

/**
 * Handle developer mode messages from background.
 * Returns true if sendResponse will be called asynchronously.
 */
export function handleDevModeMessage(
  message: { type?: string },
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.type === 'DEV_MODE_PATTERNS_UPDATED') {
    // Reload patterns from session storage
    getDevModePatterns().then((patterns) => {
      customPatterns = patterns ?? null
      devModeEnabled = true
      console.log(
        '[kura:devmode]',
        `Patterns updated: ${customPatterns?.length ?? 0} custom patterns`,
      )
    })
    return false
  }

  if (message.type === 'DEV_MODE_DISABLED') {
    customPatterns = null
    devModeEnabled = false
    console.log('[kura:devmode]', 'Developer mode disabled')
    return false
  }

  if (message.type === 'DEV_MODE_DRY_RUN') {
    const report = collectDebugReport(SITE_PATTERNS, customPatterns)
    sendResponse({ success: true, report })
    return false
  }

  return false
}
