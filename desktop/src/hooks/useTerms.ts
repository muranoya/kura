import { useTranslation } from 'react-i18next'
import termsEn from '../assets/legal/terms_en.md?raw'
import termsJa from '../assets/legal/terms_ja.md?raw'

export function useTerms(): string {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? termsEn : termsJa
}
