import { createContext, useCallback, useContext, useState } from 'react'

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
  }, [])

  const clearErrors = useCallback(() => {
    setErrors([])
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
