import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getFromStorage, saveToStorage } from './storage'
import { STORAGE_KEYS } from './constants'
import { AppSettings } from './types'

export type Theme = 'light' | 'dark'

export interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [loaded, setLoaded] = useState(false)

  // 初期化: ストレージから読み込み
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
        const savedTheme = settings?.theme ?? 'light'
        applyTheme(savedTheme)
        setTheme(savedTheme)
      } catch (error) {
        console.error('Failed to load theme:', error)
        applyTheme('light')
        setTheme('light')
      } finally {
        setLoaded(true)
      }
    }

    loadTheme()
  }, [])

  const applyTheme = (t: Theme) => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const toggleTheme = async () => {
    try {
      const nextTheme: Theme = theme === 'light' ? 'dark' : 'light'
      applyTheme(nextTheme)
      setTheme(nextTheme)

      // 既存の設定にマージして保存
      const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
      const updated = { ...settings, theme: nextTheme }
      await saveToStorage(STORAGE_KEYS.APP_SETTINGS, updated)
    } catch (error) {
      console.error('Failed to toggle theme:', error)
    }
  }

  // テーマロード前はちらつき防止のため何も表示しない
  if (!loaded) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
