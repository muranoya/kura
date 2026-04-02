import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../../shared/constants'

interface AppError {
  key: string
  message: string
  timestamp: number
}

interface ErrorContextValue {
  errors: AppError[]
  pushError: (message: string, key?: string) => void
  dismissError: (key: string) => void
  clearErrors: () => void
}

const ErrorContext = createContext<ErrorContextValue>({
  errors: [],
  pushError: () => {},
  dismissError: () => {},
  clearErrors: () => {},
})

let nextId = 0

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<AppError[]>([])

  // Load error from chrome.storage.local on mount (from Service Worker)
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return

    chrome.storage.local.get([STORAGE_KEYS.LAST_ERROR], (result) => {
      const stored = result[STORAGE_KEYS.LAST_ERROR] as AppError | undefined
      if (stored) {
        setErrors((prev) => {
          const idx = prev.findIndex((e) => e.key === stored.key)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = stored
            return updated
          }
          return [...prev, stored]
        })
      }
    })

    // Listen for new errors from Service Worker
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !changes[STORAGE_KEYS.LAST_ERROR]) return
      const newError = changes[STORAGE_KEYS.LAST_ERROR].newValue as AppError | undefined
      if (newError) {
        setErrors((prev) => {
          const idx = prev.findIndex((e) => e.key === newError.key)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = newError
            return updated
          }
          return [...prev, newError]
        })
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const pushError = useCallback((message: string, key?: string) => {
    const errorKey = key ?? `error-${nextId++}`
    setErrors((prev) => {
      const idx = prev.findIndex((e) => e.key === errorKey)
      const newError: AppError = { key: errorKey, message, timestamp: Date.now() }
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = newError
        return updated
      }
      return [...prev, newError]
    })
  }, [])

  const dismissError = useCallback((key: string) => {
    setErrors((prev) => prev.filter((e) => e.key !== key))
    // Clear from storage if it was from Service Worker
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove([STORAGE_KEYS.LAST_ERROR])
    }
  }, [])

  const clearErrors = useCallback(() => {
    setErrors([])
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove([STORAGE_KEYS.LAST_ERROR])
    }
  }, [])

  return (
    <ErrorContext.Provider value={{ errors, pushError, dismissError, clearErrors }}>
      {children}
    </ErrorContext.Provider>
  )
}

export function useErrors() {
  return useContext(ErrorContext).errors
}

export function usePushError() {
  return useContext(ErrorContext).pushError
}

export function useDismissError() {
  return useContext(ErrorContext).dismissError
}

export function useClearErrors() {
  return useContext(ErrorContext).clearErrors
}
