import { afterEach, describe, expect, it } from 'vitest'
import { matchSelector } from '../content/selector-matcher'
import type { CustomFieldSelector } from '../shared/types'

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

function makeHidden(el: HTMLElement) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
  })
}

describe('matchSelector', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('matches by name attribute, defaulting tag to input', () => {
    const container = document.createElement('div')
    const target = createInput({ name: 'account_id' })
    const other = createInput({ name: 'other' })
    container.append(target, other)
    document.body.appendChild(container)

    const selector: CustomFieldSelector = { name: 'account_id' }
    expect(matchSelector(container, selector)).toBe(target)
  })

  it('matches by id attribute', () => {
    const container = document.createElement('div')
    const target = createInput({ id: 'accountId' })
    container.appendChild(target)
    document.body.appendChild(container)

    expect(matchSelector(container, { id: 'accountId' })).toBe(target)
  })

  it('requires AND match across all specified attributes', () => {
    const container = document.createElement('div')
    const nameOnly = createInput({ name: 'account_id', type: 'text' })
    const nameAndType = createInput({ name: 'account_id', type: 'email' })
    container.append(nameOnly, nameAndType)
    document.body.appendChild(container)

    const result = matchSelector(container, { name: 'account_id', type: 'email' })
    expect(result).toBe(nameAndType)
  })

  it('treats unspecified attributes as wildcards', () => {
    const container = document.createElement('div')
    const target = createInput({ name: 'account_id', id: 'whatever', type: 'text' })
    container.appendChild(target)
    document.body.appendChild(container)

    expect(matchSelector(container, { name: 'account_id' })).toBe(target)
  })

  it('skips invisible elements and returns the first visible match', () => {
    const container = document.createElement('div')
    const hidden = createInput({ name: 'account_id' })
    makeHidden(hidden)
    const visible = createInput({ name: 'account_id' })
    container.append(hidden, visible)
    document.body.appendChild(container)

    expect(matchSelector(container, { name: 'account_id' })).toBe(visible)
  })

  it('returns null when nothing matches', () => {
    const container = document.createElement('div')
    container.appendChild(createInput({ name: 'unrelated' }))
    document.body.appendChild(container)

    expect(matchSelector(container, { name: 'account_id' })).toBeNull()
  })

  it('limits matching to elements inside the given container', () => {
    const container = document.createElement('div')
    const outside = createInput({ name: 'account_id' })
    document.body.append(container, outside)

    expect(matchSelector(container, { name: 'account_id' })).toBeNull()
  })

  it('respects an explicit non-input tag', () => {
    const container = document.createElement('div')
    const select = document.createElement('select')
    select.setAttribute('name', 'country')
    makeVisible(select)
    container.appendChild(select)
    document.body.appendChild(container)

    expect(matchSelector(container, { tag: 'select', name: 'country' })).toBe(select)
    // tag未指定（デフォルトinput）では<select>にマッチしない
    expect(matchSelector(container, { name: 'country' })).toBeNull()
  })

  it('does not match on special characters in name via string-concatenated CSS selectors', () => {
    // フレームワーク生成のname（例: user[account_id]）でも安全にマッチできることを確認
    const container = document.createElement('div')
    const target = createInput({ name: 'user[account_id]' })
    container.appendChild(target)
    document.body.appendChild(container)

    expect(matchSelector(container, { name: 'user[account_id]' })).toBe(target)
  })
})
