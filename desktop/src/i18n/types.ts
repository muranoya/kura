import 'react-i18next'
import type ja from './locales/ja.json'

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof ja }
  }
}
