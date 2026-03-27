import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getFromStorage, saveToStorage } from '../../shared/storage'
import { STORAGE_KEYS } from '../../shared/constants'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [isLoading, setIsLoading] = useState(true)

  // 初期化: ストレージからテーマを読み込む
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await getFromStorage(STORAGE_KEYS.APP_SETTINGS)
        const savedTheme: Theme = settings?.theme ?? 'light'
        setTheme(savedTheme)
        applyTheme(savedTheme)
      } catch (err) {
        console.error('Failed to load theme:', err)
        applyTheme('light')
      } finally {
        setIsLoading(false)
      }
    }
    loadTheme()
  }, [])

  const toggleTheme = async () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    applyTheme(newTheme)

    // ストレージに保存
    try {
      const settings = await getFromStorage(STORAGE_KEYS.APP_SETTINGS)
      await saveToStorage(STORAGE_KEYS.APP_SETTINGS, {
        ...settings,
        theme: newTheme,
      })
    } catch (err) {
      console.error('Failed to save theme:', err)
    }
  }

  const applyTheme = (newTheme: Theme) => {
    const htmlElement = document.documentElement
    if (newTheme === 'dark') {
      htmlElement.classList.add('dark')
    } else {
      htmlElement.classList.remove('dark')
    }
  }

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
