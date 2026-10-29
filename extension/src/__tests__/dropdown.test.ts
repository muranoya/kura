import { afterEach, describe, expect, it, vi } from 'vitest'
import { hideDropdown, showDropdown } from '../content/dropdown'

describe('dropdown keyboard selection', () => {
  afterEach(() => {
    hideDropdown()
    document.body.innerHTML = ''
  })

  it('ignores synthetic keydown events dispatched by page scripts', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const onSelect = vi.fn()

    showDropdown(input, [{ entryId: 'entry-1', name: 'Example', username: 'user' }], onSelect)

    // Events created via `new KeyboardEvent` are untrusted (isTrusted === false)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(onSelect).not.toHaveBeenCalled()
  })
})
