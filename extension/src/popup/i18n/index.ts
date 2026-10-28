// i18n 初期化
//
// - UI は日本語のみ。文言をコードから分離しておくため i18next 経由で参照する
// - 初期化はアプリ描画前に完了させる想定で bootstrap() から呼び出す
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'

let initPromise: Promise<typeof i18n> | undefined

export function initI18n(): Promise<typeof i18n> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    await i18n.use(initReactI18next).init({
      resources: { ja: { translation: ja } },
      lng: 'ja',
      interpolation: { escapeValue: false },
      returnNull: false,
    })
    return i18n
  })()
  return initPromise
}

export default i18n
