import { afterEach, describe, expect, it, vi } from 'vitest'
import { isVisible } from '../content/form-detector'

function setRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
    }),
  })
}

function createInput(parent: HTMLElement = document.body): HTMLInputElement {
  const input = document.createElement('input')
  parent.appendChild(input)
  setRect(input, { left: 10, top: 10, width: 200, height: 30 })
  return input
}

describe('isVisible', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    // biome-ignore lint/suspicious/noExplicitAny: jsdom lacks elementFromPoint; tests stub it
    delete (document as any).elementFromPoint
  })

  it('accepts a normal visible input', () => {
    expect(isVisible(createInput())).toBe(true)
  })

  it('rejects tiny inputs', () => {
    const input = createInput()
    setRect(input, { left: 10, top: 10, width: 1, height: 1 })
    expect(isVisible(input)).toBe(false)
  })

  it('rejects inputs inside a transparent ancestor', () => {
    const wrapper = document.createElement('div')
    wrapper.style.opacity = '0.01'
    document.body.appendChild(wrapper)
    expect(isVisible(createInput(wrapper))).toBe(false)
  })

  it('rejects inputs positioned off-screen to the left', () => {
    const input = createInput()
    setRect(input, { left: -9999, top: 10, width: 200, height: 30 })
    expect(isVisible(input)).toBe(false)
  })

  it('accepts inputs below the fold', () => {
    const input = createInput()
    setRect(input, { left: 10, top: window.innerHeight + 500, width: 200, height: 30 })
    expect(isVisible(input)).toBe(true)
  })

  it('rejects inputs covered by another element', () => {
    const input = createInput()
    const cover = document.createElement('div')
    document.body.appendChild(cover)
    // biome-ignore lint/suspicious/noExplicitAny: stub for jsdom
    ;(document as any).elementFromPoint = () => cover
    expect(isVisible(input)).toBe(false)
  })

  it('accepts inputs whose center is covered by their own label', () => {
    const label = document.createElement('label')
    document.body.appendChild(label)
    const input = createInput(label)
    // biome-ignore lint/suspicious/noExplicitAny: stub for jsdom
    ;(document as any).elementFromPoint = () => label
    expect(isVisible(input)).toBe(true)
  })
})
