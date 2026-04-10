import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Global mocks for Chrome Extension APIs
// These are needed for background script tests that reference chrome.*

const noop = () => {}

// In-memory chrome.storage.local implementation
let storageStore: Record<string, unknown> = {}

const chromeStorageLocal = {
  get: vi.fn(
    (keys: string | string[] | null, callback: (result: Record<string, unknown>) => void) => {
      const keyList = keys === null ? Object.keys(storageStore) : Array.isArray(keys) ? keys : [keys]
      const result: Record<string, unknown> = {}
      for (const k of keyList) {
        if (k in storageStore) result[k] = storageStore[k]
      }
      callback(result)
    },
  ),
  set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
    Object.assign(storageStore, items)
    callback?.()
  }),
  remove: vi.fn((keys: string | string[], callback?: () => void) => {
    const keyList = Array.isArray(keys) ? keys : [keys]
    for (const k of keyList) {
      delete storageStore[k]
    }
    callback?.()
  }),
  clear: vi.fn((callback?: () => void) => {
    storageStore = {}
    callback?.()
  }),
}

// chrome.runtime.sendMessage with callback support
const sendMessageMock = vi.fn(
  (message: unknown, callbackOrOptions?: unknown, maybeCallback?: unknown) => {
    // Support both (message, callback) and (message, options, callback) signatures
    const callback =
      typeof callbackOrOptions === 'function'
        ? callbackOrOptions
        : typeof maybeCallback === 'function'
          ? maybeCallback
          : null
    if (callback) {
      callback({ success: true })
    }
    return Promise.resolve({ success: true })
  },
)

globalThis.chrome = {
  runtime: {
    sendMessage: sendMessageMock,
    onMessage: {
      addListener: vi.fn(noop),
      removeListener: vi.fn(noop),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    connect: vi.fn(() => ({ disconnect: vi.fn(noop) })),
    lastError: undefined,
  },
  tabs: {
    query: vi.fn((_query: unknown, callback: (tabs: unknown[]) => void) => {
      callback([])
    }),
    sendMessage: vi.fn(() => Promise.resolve()),
    onRemoved: {
      addListener: vi.fn(noop),
    },
  },
  action: {
    openPopup: vi.fn(() => Promise.resolve()),
  },
  storage: {
    local: chromeStorageLocal,
    onChanged: {
      addListener: vi.fn(noop),
      removeListener: vi.fn(noop),
    },
  },
} as unknown as typeof chrome

// navigator.clipboard mock
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve('')),
  },
  writable: true,
  configurable: true,
})

// Reset storage between tests
import { afterEach } from 'vitest'
afterEach(() => {
  storageStore = {}
})
