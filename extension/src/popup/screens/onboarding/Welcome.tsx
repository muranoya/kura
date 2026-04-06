import { Lock } from 'lucide-react'
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
    <h1 className="text-base font-bold text-text-primary mt-3 mb-1">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-sm font-bold text-text-primary mt-2 mb-1">{children}</h2>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-xs text-text-primary mb-1.5 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-inside text-xs text-text-primary mb-1.5 space-y-0.5">{children}</ul>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-xs text-text-primary">{children}</li>
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

  const handleStart = () => {
    navigate('/onb/storage')
  }

  return (
    <div className="flex items-center justify-center h-full bg-bg-base px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">kura</h1>
          <p className="text-sm text-text-secondary">
            サーバ不要、自分一人のための
            <br />
            運用コストゼロのパスワードマネージャー
          </p>
        </div>

        {/* 利用規約 */}
        <div className="mb-4 space-y-2">
          {/* 言語切替 */}
          <div className="flex items-center justify-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setLang('ja')}
              className={`px-1.5 py-0.5 rounded ${lang === 'ja' ? 'text-accent font-bold' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              日本語
            </button>
            <span className="text-text-tertiary">/</span>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-1.5 py-0.5 rounded ${lang === 'en' ? 'text-accent font-bold' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              English
            </button>
          </div>

          {/* 同意チェックボックス */}
          <label className="flex items-center justify-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-accent"
            />
            <span className="text-xs text-text-secondary">
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
        <Button onClick={handleStart} className="w-full text-sm" size="sm" disabled={!agreed}>
          {lang === 'ja' ? '始める' : 'Get Started'}
        </Button>
      </div>

      {/* 利用規約ダイアログ */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {lang === 'ja' ? '利用規約' : 'Terms of Service'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 max-h-[55vh] overflow-y-auto pr-1">
            <div className="py-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={termsMarkdownComponents}>
                {terms}
              </ReactMarkdown>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                {lang === 'ja' ? '閉じる' : 'Close'}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
