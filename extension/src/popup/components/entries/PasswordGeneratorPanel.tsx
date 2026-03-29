import { useState, useEffect, useCallback } from 'react'
import * as commands from '../../commands'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label as UILabel } from '../ui/label'
import { Copy, Check, RefreshCw } from 'lucide-react'

interface PasswordGeneratorPanelProps {
  onUse?: (password: string) => void
}

export default function PasswordGeneratorPanel({ onUse }: PasswordGeneratorPanelProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // 設定
  const [length, setLength] = useState(16)
  const [includeUppercase, setIncludeUppercase] = useState(true)
  const [includeLowercase, setIncludeLowercase] = useState(true)
  const [includeNumbers, setIncludeNumbers] = useState(true)
  const [includeSymbols, setIncludeSymbols] = useState(true)

  // パスワード生成関数
  const handleGenerate = useCallback(async () => {
    setLoading(true)
    try {
      const generated = await commands.generatePassword(
        length,
        includeUppercase,
        includeLowercase,
        includeNumbers,
        includeSymbols
      )
      setPassword(generated)
      setCopied(false)
    } catch (err) {
      console.error('Failed to generate password:', err)
    } finally {
      setLoading(false)
    }
  }, [length, includeUppercase, includeLowercase, includeNumbers, includeSymbols])

  // 初期パスワード生成と設定変更時に自動生成
  useEffect(() => {
    handleGenerate()
  }, [handleGenerate])

  const handleCopy = () => {
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isInline = !!onUse

  const containerClass = isInline
    ? 'space-y-2'
    : ''

  const wrapperClass = isInline
    ? 'border border-accent/30 rounded-md p-3 space-y-3 bg-bg-surface'
    : ''

  return (
    <div className={containerClass}>
      {isInline && (
        <div className={wrapperClass}>
          {/* パスワード表示 */}
          <Card className="border-0 shadow-none bg-bg-base">
            <CardContent className="px-2 py-2">
              {password ? (
                <div className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated border border-border">
                  <span className="font-mono text-sm text-text-primary flex-1 break-all">{password}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={handleCopy}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      title="コピー"
                    >
                      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={loading}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                      title="再生成"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {onUse && (
                      <button
                        onClick={() => onUse(password)}
                        className="px-2 py-1 text-sm bg-accent text-white hover:bg-accent-hover rounded transition-colors whitespace-nowrap"
                        title="このパスワードを使用"
                      >
                        使用する
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-md bg-bg-elevated border border-border text-center text-text-secondary text-sm">
                  パスワードをまだ生成していません
                </div>
              )}
            </CardContent>
          </Card>

          {/* 設定（コンパクト版） */}
          <div className="space-y-2">
            <div className="space-y-1">
              <UILabel htmlFor={`length-${isInline ? 'inline' : 'screen'}`} className="text-sm">
                長さ: {length}
              </UILabel>
              <Input
                id={`length-${isInline ? 'inline' : 'screen'}`}
                type="range"
                min="1"
                max="128"
                value={length}
                onChange={(e) => setLength(parseInt(e.target.value))}
                className="h-2 px-0 py-0 w-full"
              />
              <div className="flex gap-2 text-sm text-text-secondary">
                <span>1</span>
                <span className="flex-1" />
                <span>128</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id={`uppercase-${isInline ? 'inline' : 'screen'}`}
                  type="checkbox"
                  checked={includeUppercase}
                  onChange={(e) => setIncludeUppercase(e.target.checked)}
                  className="w-3 h-3 rounded border-border"
                />
                <label htmlFor={`uppercase-${isInline ? 'inline' : 'screen'}`} className="text-sm text-text-primary cursor-pointer">
                  大文字 (A-Z)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id={`lowercase-${isInline ? 'inline' : 'screen'}`}
                  type="checkbox"
                  checked={includeLowercase}
                  onChange={(e) => setIncludeLowercase(e.target.checked)}
                  className="w-3 h-3 rounded border-border"
                />
                <label htmlFor={`lowercase-${isInline ? 'inline' : 'screen'}`} className="text-sm text-text-primary cursor-pointer">
                  小文字 (a-z)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id={`numbers-${isInline ? 'inline' : 'screen'}`}
                  type="checkbox"
                  checked={includeNumbers}
                  onChange={(e) => setIncludeNumbers(e.target.checked)}
                  className="w-3 h-3 rounded border-border"
                />
                <label htmlFor={`numbers-${isInline ? 'inline' : 'screen'}`} className="text-sm text-text-primary cursor-pointer">
                  数字 (0-9)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id={`symbols-${isInline ? 'inline' : 'screen'}`}
                  type="checkbox"
                  checked={includeSymbols}
                  onChange={(e) => setIncludeSymbols(e.target.checked)}
                  className="w-3 h-3 rounded border-border"
                />
                <label htmlFor={`symbols-${isInline ? 'inline' : 'screen'}`} className="text-sm text-text-primary cursor-pointer">
                  特殊文字 (!@#$%...)
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isInline && (
        <div className="space-y-3">
          {/* パスワード表示 */}
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">生成されたパスワード</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              {password ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-bg-elevated border border-border">
                  <span className="font-mono text-sm text-text-primary flex-1 break-all">{password}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={handleCopy}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      title="コピー"
                    >
                      {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={loading}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                      title="再生成"
                    >
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-bg-elevated border border-border text-center text-text-secondary text-sm">
                  パスワードをまだ生成していません
                </div>
              )}
            </CardContent>
          </Card>

          {/* 設定 */}
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">設定</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-3">
              <div className="space-y-3">
                <UILabel htmlFor="length" className="text-sm">
                  長さ: {length}
                </UILabel>
                <div>
                  <Input
                    id="length"
                    type="range"
                    min="1"
                    max="128"
                    value={length}
                    onChange={(e) => setLength(parseInt(e.target.value))}
                    className="h-2 px-0 py-0 w-full"
                  />
                </div>
                <div className="flex gap-2 text-sm text-text-secondary">
                  <span>1</span>
                  <span className="flex-1" />
                  <span>128</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="uppercase"
                    type="checkbox"
                    checked={includeUppercase}
                    onChange={(e) => setIncludeUppercase(e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <label htmlFor="uppercase" className="text-sm text-text-primary cursor-pointer">
                    大文字 (A-Z)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="lowercase"
                    type="checkbox"
                    checked={includeLowercase}
                    onChange={(e) => setIncludeLowercase(e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <label htmlFor="lowercase" className="text-sm text-text-primary cursor-pointer">
                    小文字 (a-z)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="numbers"
                    type="checkbox"
                    checked={includeNumbers}
                    onChange={(e) => setIncludeNumbers(e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <label htmlFor="numbers" className="text-sm text-text-primary cursor-pointer">
                    数字 (0-9)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="symbols"
                    type="checkbox"
                    checked={includeSymbols}
                    onChange={(e) => setIncludeSymbols(e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <label htmlFor="symbols" className="text-sm text-text-primary cursor-pointer">
                    特殊文字 (!@#$%...)
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
