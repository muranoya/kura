// Field filling with native setter and framework-compatible event dispatch
// (design doc Sections 7.2, 10.2, 10.3)

// In ISOLATED world, prototype is not polluted by page scripts,
// so we can safely access the native setter at any time.
// biome-ignore lint/style/noNonNullAssertion: guaranteed to exist on HTMLInputElement.prototype
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  .set!

/**
 * Fill a single input field with the given value.
 * Uses the native value setter and dispatches framework-compatible events.
 */
export function fillField(element: HTMLInputElement, value: string) {
  // 1. Focus
  element.focus()
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

  // 2. Set value via native setter (safe from page script interference)
  nativeInputValueSetter.call(element, value)

  // 3. Dispatch events for framework change detection
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))

  // 4. Keyboard events (some sites require these)
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
}

/**
 * Fill multiple fields with a delay between each to allow framework state updates.
 */
export async function fillFields(
  entries: Array<{ element: HTMLInputElement; value: string }>,
  delayMs = 30,
) {
  for (let i = 0; i < entries.length; i++) {
    fillField(entries[i].element, entries[i].value)
    if (i < entries.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
