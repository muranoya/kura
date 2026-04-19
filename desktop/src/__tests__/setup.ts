import '@testing-library/jest-dom/vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../i18n/locales/en.json'
import ja from '../i18n/locales/ja.json'

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    lng: 'ja',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
}
