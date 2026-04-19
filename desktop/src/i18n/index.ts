import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getFromStorage } from '../shared/storage'
import type { LanguageSetting } from '../shared/types'
import en from './locales/en.json'
import ja from './locales/ja.json'

const SUPPORTED: ReadonlyArray<'ja' | 'en'> = ['ja', 'en']

export function resolveLanguage(setting: LanguageSetting): 'ja' | 'en' {
  if (setting === 'ja' || setting === 'en') return setting
  const detected = (typeof navigator !== 'undefined' ? navigator.language : '')
    .toLowerCase()
    .split('-')[0]
  return (SUPPORTED as readonly string[]).includes(detected) ? (detected as 'ja' | 'en') : 'en'
}

export async function initI18n(): Promise<void> {
  const stored = await getFromStorage<{ language?: LanguageSetting }>('appSettings')
  const lng = resolveLanguage(stored?.language ?? 'system')

  await i18n.use(initReactI18next).init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
}

export async function setLanguage(setting: LanguageSetting): Promise<void> {
  const lng = resolveLanguage(setting)
  await i18n.changeLanguage(lng)
}

export default i18n
