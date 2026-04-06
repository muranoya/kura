import { Shield } from 'lucide-react'
import { type ReactNode, useState } from 'react'
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
import { type TermsLang, useTerms } from '../../hooks/useTerms'

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
  const navigate = useNavigate()
  const [lang, setLang] = useState<TermsLang>('ja')
  const [agreed, setAgreed] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const terms = useTerms(lang)

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-bg-base to-bg-surface px-4">
      <div className="w-full max-w-md text-center">
        {/* ロゴ */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-accent/10 mb-8">
          <Shield className="w-12 h-12 text-accent" />
        </div>

        {/* タイトル */}
        <h1 className="text-4xl font-bold text-text-primary mb-4">kura</h1>

        {/* キャッチコピー */}
        <p className="text-lg text-text-secondary mb-2">サーバ不要、自分一人のための</p>
        <p className="text-lg text-text-secondary mb-8">運用コストゼロのパスワードマネージャー</p>

        {/* 利用規約 */}
        <div className="mb-6 space-y-3">
          {/* 言語切替 */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setLang('ja')}
              className={`px-2 py-0.5 rounded ${lang === 'ja' ? 'text-accent font-bold' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              日本語
            </button>
            <span className="text-text-tertiary">/</span>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2 py-0.5 rounded ${lang === 'en' ? 'text-accent font-bold' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              English
            </button>
          </div>

          {/* 同意チェックボックス */}
          <label className="flex items-center justify-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-accent"
            />
            <span className="text-sm text-text-secondary">
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-accent hover:underline"
              >
                {lang === 'ja' ? '利用規約' : 'Terms of Service'}
              </button>
              {lang === 'ja' ? 'に同意する' : ' — I agree'}
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
          {lang === 'ja' ? '始める' : 'Get Started'}
        </Button>
      </div>

      {/* 利用規約ダイアログ */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{lang === 'ja' ? '利用規約' : 'Terms of Service'}</DialogTitle>
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
              <Button variant="secondary">{lang === 'ja' ? '閉じる' : 'Close'}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
