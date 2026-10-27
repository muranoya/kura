import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'

export async function initI18n(): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: {
      ja: { translation: ja },
    },
    lng: 'ja',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
}

export default i18n
