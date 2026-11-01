import { afterEach, describe, expect, it, vi } from 'vitest'
import { hideDropdown, showDropdown } from '../content/dropdown'

describe('dropdown preselection', () => {
  afterEach(() => {
    hideDropdown()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const candidates = [
    { entryId: 'entry-1', name: 'First', username: 'a' },
    { entryId: 'entry-2', name: 'Second', username: 'b' },
    { entryId: 'entry-3', name: 'Third', username: 'c' },
  ]

  // The dropdown uses a closed shadow root, so it is only reachable through attachShadow
  function showAndGetItems(...args: Parameters<typeof showDropdown>) {
    const attachShadow = vi.spyOn(Element.prototype, 'attachShadow')
    showDropdown(...args)
    const root = attachShadow.mock.results[0].value as ShadowRoot
    return Array.from(root.querySelectorAll('.kura-dropdown-item'))
  }

  it('selects the preselected entry without changing the candidate order', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    const items = showAndGetItems(input, candidates, vi.fn(), 'https:', 2)

    expect(items.map((item) => item.querySelector('.kura-item-name')?.textContent)).toEqual([
      'First',
      'Second',
      'Third',
    ])
    expect(items.map((item) => item.getAttribute('data-selected'))).toEqual([null, null, 'true'])
    expect(scrollIntoView).toHaveBeenCalledOnce()
  })

  it('selects nothing by default', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    const items = showAndGetItems(input, candidates, vi.fn())

    expect(items).toHaveLength(3)
    expect(items.some((item) => item.hasAttribute('data-selected'))).toBe(false)
  })
})

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
  it('tears down the UI when the page tampers with the host element', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    showDropdown(input, [{ entryId: 'entry-1', name: 'Example', username: 'user' }], vi.fn())

    const host = document.getElementById('kura-autofill-dropdown')
    expect(host).not.toBeNull()

    host?.setAttribute('style', 'opacity: 0')
    // MutationObserver callbacks run as microtasks
    await Promise.resolve()

    expect(document.getElementById('kura-autofill-dropdown')).toBeNull()
  })
})
