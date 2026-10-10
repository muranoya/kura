import { afterEach, describe, expect, it, vi } from 'vitest'
import { destroy, showDropdown } from '../content/dropdown'

describe('autofill dropdown', () => {
  afterEach(() => {
    destroy()
    document.body.innerHTML = ''
  })

  function setup() {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const onSelect = vi.fn()
    showDropdown(input, [{ entryId: 'e1', name: 'Example', username: 'user' }], onSelect, 'https:')
    return { input, onSelect }
  }

  it('ignores synthetic keyboard events dispatched by page scripts', () => {
    const { input, onSelect } = setup()

    // dispatchEvent で生成したイベントは isTrusted === false になる
    for (const key of ['ArrowDown', 'Enter']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      expect(event.isTrusted).toBe(false)
      input.dispatchEvent(event)
    }

    expect(onSelect).not.toHaveBeenCalled()
  })
})
