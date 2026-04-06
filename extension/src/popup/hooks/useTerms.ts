import termsEn from '../assets/legal/terms_en.md?raw'
import termsJa from '../assets/legal/terms_ja.md?raw'

const termsMap: Record<string, string> = { ja: termsJa, en: termsEn }

export type TermsLang = 'ja' | 'en'

export function useTerms(lang: TermsLang) {
  return termsMap[lang]
}
