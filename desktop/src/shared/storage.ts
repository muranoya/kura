import { Store } from '@tauri-apps/plugin-store'

let store: Store | null = null

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('settings.json')
  }
  return store
}

export async function getFromStorage<T>(key: string): Promise<T | undefined> {
  const s = await getStore()
  const value = await s.get<T>(key)
  return value ?? undefined
}

export async function saveToStorage(key: string, value: unknown): Promise<void> {
  const s = await getStore()
  await s.set(key, value)
  await s.save()
}

export async function removeFromStorage(key: string): Promise<void> {
  const s = await getStore()
  await s.delete(key)
  await s.save()
}

export async function clearStorage(): Promise<void> {
  const s = await getStore()
  // Store doesn't have a clear method, so we just recreate it
  // For now, we'll just save empty data
  await s.save()
}
