import { Shield } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { usePushError } from '../../contexts/ErrorContext'
import { useTerms } from '../../hooks/useTerms'
import { setLanguage } from '../../i18n'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../shared/constants'
import { getFromStorage, saveToStorage } from '../../shared/storage'
import type { AppSettings, LanguageSetting } from '../../shared/types'

const termsMarkdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-xl font-bold text-text-primary mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-base font-bold text-text-primary mt-3 mb-1">{children}</h2>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-sm text-text-primary mb-2 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-inside text-sm text-text-primary mb-2 space-y-1">{children}</ul>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-sm text-text-primary">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-bold text-text-primary">{children}</strong>
  ),
}

export default function Welcome() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const pushError = usePushError()
  const [agreed, setAgreed] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const terms = useTerms()

  const currentLang: LanguageSetting = i18n.language === 'ja' ? 'ja' : 'en'

  const handleLanguageChange = async (value: string) => {
    const lang = value as LanguageSetting
    try {
      await setLanguage(lang)
      const current = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
      const merged = { ...DEFAULT_SETTINGS, ...current, language: lang }
      await saveToStorage(STORAGE_KEYS.APP_SETTINGS, merged)
      window.dispatchEvent(new CustomEvent('settings-changed'))
    } catch (err) {
      pushError(t('settings.errors.saveSettings', { error: String(err) }))
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-bg-base to-bg-surface px-4">
      {/* 言語切り替え */}
      <div className="absolute top-4 right-4">
        <Select value={currentLang} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ja">{t('settings.general.languageJa')}</SelectItem>
            <SelectItem value="en">{t('settings.general.languageEn')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full max-w-md text-center">
        {/* ロゴ */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-accent/10 mb-8">
          <Shield className="w-12 h-12 text-accent" />
        </div>

        {/* タイトル */}
        <h1 className="text-4xl font-bold text-text-primary mb-4">{t('app.name')}</h1>

        {/* キャッチコピー */}
        <p className="text-lg text-text-secondary mb-2">{t('onboarding.welcome.tagline1')}</p>
        <p className="text-lg text-text-secondary mb-8">{t('onboarding.welcome.tagline2')}</p>

        {/* 利用規約 */}
        <div className="mb-6">
          {/* 同意チェックボックス */}
          <label className="flex items-center justify-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-accent"
            />
            <span className="text-sm text-text-secondary">
              {t('onboarding.welcome.agreePrefix')}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-accent hover:underline"
              >
                {t('onboarding.welcome.termsLink')}
              </button>
              {t('onboarding.welcome.agreeSuffix')}
            </span>
          </label>
        </div>

        {/* CTA */}
        <Button
          onClick={() => navigate('/onb/storage')}
          size="lg"
          className="w-full"
          disabled={!agreed}
        >
          {t('onboarding.welcome.start')}
        </Button>
      </div>

      {/* 利用規約ダイアログ */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('onboarding.welcome.termsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 max-h-[60vh] overflow-y-auto pr-4">
            <div className="py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={termsMarkdownComponents}>
                {terms}
              </ReactMarkdown>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t('onboarding.welcome.close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
