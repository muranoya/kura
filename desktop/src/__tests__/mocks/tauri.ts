import { vi } from 'vitest'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock @tauri-apps/plugin-store
vi.mock('@tauri-apps/plugin-store', () => {
  const store = new Map<string, unknown>()
  return {
    Store: {
      load: vi.fn().mockResolvedValue({
        get: vi.fn((key: string) => Promise.resolve(store.get(key))),
        set: vi.fn((key: string, value: unknown) => {
          store.set(key, value)
          return Promise.resolve()
        }),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn((key: string) => {
          store.delete(key)
          return Promise.resolve()
        }),
        entries: vi.fn(() => Promise.resolve([...store.entries()])),
      }),
    },
  }
})

// Mock @tauri-apps/plugin-clipboard-manager
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}))
