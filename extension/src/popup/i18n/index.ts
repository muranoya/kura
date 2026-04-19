// i18n 初期化
//
// - リソースは ja / en を同梱（バンドルサイズ的に問題になる規模ではない）
// - 言語の決定順は: ユーザー設定（appSettings.language）> navigator.language の自動検出 > 'en'
// - 初期化はアプリ描画前に同期完了させ、言語のフラッシュを防ぐため bootstrap() からの呼び出しを想定する
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_VAULT_ID, STORAGE_KEYS } from '../../shared/constants'
import en from './locales/en.json'
import ja from './locales/ja.json'

export const SUPPORTED_LANGUAGES = ['ja', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const FALLBACK_LANGUAGE: SupportedLanguage = 'en'

export function detectFromNavigator(): SupportedLanguage {
  const raw = (navigator.language || '').toLowerCase()
  const primary = raw.split('-')[0]
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as SupportedLanguage)
    : FALLBACK_LANGUAGE
}

async function readSavedLanguage(): Promise<SupportedLanguage | undefined> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.APP_SETTINGS], (result) => {
      const settings = result?.[STORAGE_KEYS.APP_SETTINGS] as { language?: string } | undefined
      const lang = settings?.language
      if (lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
        resolve(lang as SupportedLanguage)
      } else {
        resolve(undefined)
      }
    })
  })
}

let initPromise: Promise<typeof i18n> | undefined

export function initI18n(): Promise<typeof i18n> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const saved = await readSavedLanguage()
    const lng = saved ?? detectFromNavigator()
    await i18n.use(initReactI18next).init({
      resources: { ja: { translation: ja }, en: { translation: en } },
      lng,
      fallbackLng: FALLBACK_LANGUAGE,
      interpolation: { escapeValue: false },
      returnNull: false,
    })
    return i18n
  })()
  return initPromise
}

export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang)
}

// vault 名（"default"）はユーザー入力ではないがUI上で参照される唯一の例外。
// i18n とは独立しているため、利便性のためにここで名前解決ヘルパを提供する。
export function defaultVaultId(): string {
  return DEFAULT_VAULT_ID
}

export default i18n
