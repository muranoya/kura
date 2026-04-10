// chrome.storage ラッパー

export async function getFromStorage<T = unknown>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] as T)
    })
  })
}

export async function saveToStorage(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve()
    })
  })
}

export async function removeFromStorage(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], () => {
      resolve()
    })
  })
}

export async function clearStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      resolve()
    })
  })
}

// chrome.storage.session ラッパー（MV3 セッションストレージ）
// メモリのみ、ディスク書き込みなし、ブラウザセッション終了時にクリア
//
// Firefox では chrome.storage.session がエイリアスされていないことがあるため
// browser.storage.session にフォールバックする

const globalWithBrowser = globalThis as unknown as {
  browser?: { storage?: { session?: chrome.storage.StorageArea } }
}
const sessionStorageArea: chrome.storage.StorageArea | undefined =
  chrome?.storage?.session ?? globalWithBrowser.browser?.storage?.session

export async function getFromSessionStorage<T = unknown>(key: string): Promise<T | undefined> {
  if (!sessionStorageArea) return undefined
  return new Promise((resolve) => {
    sessionStorageArea.get([key], (result) => {
      resolve(result[key] as T)
    })
  })
}

export async function saveToSessionStorage(key: string, value: unknown): Promise<void> {
  if (!sessionStorageArea) return
  return new Promise((resolve) => {
    sessionStorageArea.set({ [key]: value }, () => {
      resolve()
    })
  })
}

export async function removeFromSessionStorage(key: string): Promise<void> {
  if (!sessionStorageArea) return
  return new Promise((resolve) => {
    sessionStorageArea.remove([key], () => {
      resolve()
    })
  })
}
