import { vi } from 'vitest'

// Global mocks for Chrome Extension APIs
// These are needed for background script tests that reference chrome.*

const noop = () => {}
const noopPromise = () => Promise.resolve()

globalThis.chrome = {
  runtime: {
    sendMessage: vi.fn(noopPromise),
    onMessage: {
      addListener: vi.fn(noop),
      removeListener: vi.fn(noop),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
  },
  tabs: {
    query: vi.fn((_query: unknown, callback: (tabs: unknown[]) => void) => {
      callback([])
    }),
    sendMessage: vi.fn(noopPromise),
    onRemoved: {
      addListener: vi.fn(noop),
    },
  },
  action: {
    openPopup: vi.fn(noopPromise),
  },
} as unknown as typeof chrome
