// i18n 初期化
//
// - UI は日本語のみ。文言をコードから分離しておくため i18next 経由で参照する
// - 文言は同梱の ja.json だけなので、import した時点で同期的に初期化する
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja } },
  lng: 'ja',
  initAsync: false,
  interpolation: { escapeValue: false },
})

export default i18n
