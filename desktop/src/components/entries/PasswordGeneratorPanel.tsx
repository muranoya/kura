import { Check, ChevronDown, ChevronRight, Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import * as commands from '../../commands'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label as UILabel } from '../../components/ui/label'

interface PasswordGeneratorPanelProps {
  onUse?: (password: string) => void
}

export default function PasswordGeneratorPanel({ onUse }: PasswordGeneratorPanelProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // 設定
  const [length, setLength] = useState(16)
  const [includeLowercase, setIncludeLowercase] = useState(true)
  const [includeUppercase, setIncludeUppercase] = useState(true)
  const [includeNumbers, setIncludeNumbers] = useState(true)
  const [includeSymbols1, setIncludeSymbols1] = useState(true)
  const [includeSymbols2, setIncludeSymbols2] = useState(true)
  const [includeSymbols3, setIncludeSymbols3] = useState(true)
  const [showCharOptions, setShowCharOptions] = useState(false)

  // パスワード生成関数
  const handleGenerate = useCallback(async () => {
    setLoading(true)
    try {
      const generated = await commands.generatePassword(
        length,
        includeLowercase,
        includeUppercase,
        includeNumbers,
        includeSymbols1,
        includeSymbols2,
        includeSymbols3,
      )
      setPassword(generated)
      setCopied(false)
    } catch (err) {
      console.error('Failed to generate password:', err)
    } finally {
      setLoading(false)
    }
  }, [
    length,
    includeLowercase,
    includeUppercase,
    includeNumbers,
    includeSymbols1,
    includeSymbols2,
    includeSymbols3,
  ])

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

  const containerClass = isInline ? 'space-y-2' : ''

  const wrapperClass = isInline
    ? 'border border-accent/30 rounded-md p-3 space-y-3 bg-bg-surface'
    : ''

  const checkboxes = (prefix: string, checkboxSize: string, labelSize: string) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          id={`lowercase-${prefix}`}
          type="checkbox"
          checked={includeLowercase}
          onChange={(e) => setIncludeLowercase(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label
          htmlFor={`lowercase-${prefix}`}
          className={`${labelSize} text-text-primary cursor-pointer`}
        >
          小文字 (a-z)
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`uppercase-${prefix}`}
          type="checkbox"
          checked={includeUppercase}
          onChange={(e) => setIncludeUppercase(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label
          htmlFor={`uppercase-${prefix}`}
          className={`${labelSize} text-text-primary cursor-pointer`}
        >
          大文字 (A-Z)
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`numbers-${prefix}`}
          type="checkbox"
          checked={includeNumbers}
          onChange={(e) => setIncludeNumbers(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label
          htmlFor={`numbers-${prefix}`}
          className={`${labelSize} text-text-primary cursor-pointer`}
        >
          数字 (0-9)
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`symbols1-${prefix}`}
          type="checkbox"
          checked={includeSymbols1}
          onChange={(e) => setIncludeSymbols1(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label
          htmlFor={`symbols1-${prefix}`}
          className={`${labelSize} text-text-primary cursor-pointer`}
        >
          {'記号 (!@#$%^&*-_.)'}
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`symbols2-${prefix}`}
          type="checkbox"
          checked={includeSymbols2}
          onChange={(e) => setIncludeSymbols2(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label
          htmlFor={`symbols2-${prefix}`}
          className={`${labelSize} text-text-primary cursor-pointer`}
        >
          {'記号 (()[]{}+=~/)'}
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`symbols3-${prefix}`}
          type="checkbox"
          checked={includeSymbols3}
          onChange={(e) => setIncludeSymbols3(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label
          htmlFor={`symbols3-${prefix}`}
          className={`${labelSize} text-text-primary cursor-pointer`}
        >
          {'記号 (`<>\'"\\|;,:)'}
        </label>
      </div>
    </div>
  )

  return (
    <div className={containerClass}>
      {isInline && (
        <div className={wrapperClass}>
          {/* パスワード表示 */}
          <Card className="border-0 shadow-none bg-bg-base">
            <CardContent className="px-2 py-2">
              {password ? (
                <div className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated border border-border">
                  <span className="font-mono text-xs text-text-primary flex-1 break-all">
                    {password}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      title="コピー"
                    >
                      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={loading}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                      title="再生成"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    {onUse && (
                      <button
                        type="button"
                        onClick={() => onUse(password)}
                        className="px-2 py-1 text-xs bg-accent text-white hover:bg-accent-hover rounded transition-colors whitespace-nowrap"
                        title="このパスワードを使用"
                      >
                        使用する
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-md bg-bg-elevated border border-border text-center text-text-secondary text-xs">
                  パスワードをまだ生成していません
                </div>
              )}
            </CardContent>
          </Card>

          {/* 設定（コンパクト版） */}
          <div className="space-y-2">
            <div className="space-y-1">
              <UILabel htmlFor="length-inline" className="text-xs">
                長さ: {length}
              </UILabel>
              <Input
                id="length-inline"
                type="range"
                min="1"
                max="128"
                value={length}
                onChange={(e) => setLength(Number.parseInt(e.target.value))}
                className="h-2 px-0 py-0 w-full"
              />
              <div className="flex gap-2 text-xs text-text-secondary">
                <span>1</span>
                <span className="flex-1" />
                <span>128</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowCharOptions(!showCharOptions)}
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {showCharOptions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                文字種の設定
              </button>
              {showCharOptions && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(
                    [
                      [includeLowercase, setIncludeLowercase, 'a-z'],
                      [includeUppercase, setIncludeUppercase, 'A-Z'],
                      [includeNumbers, setIncludeNumbers, '0-9'],
                      [includeSymbols1, setIncludeSymbols1, '!@#$%^&*'],
                      [includeSymbols2, setIncludeSymbols2, '()[]{}+='],
                      [includeSymbols3, setIncludeSymbols3, '`<>\'"\\|'],
                    ] as [boolean, React.Dispatch<React.SetStateAction<boolean>>, string][]
                  ).map(([checked, setter, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setter(!checked)}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                        checked
                          ? 'bg-accent text-white border-accent'
                          : 'bg-transparent text-text-secondary border-border hover:border-text-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
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
                  <span className="font-mono text-sm text-text-primary flex-1 break-all">
                    {password}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1 text-text-muted hover:text-text-primary transition-colors"
                      title="コピー"
                    >
                      {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                    </button>
                    <button
                      type="button"
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
                <UILabel htmlFor="length" className="text-xs">
                  長さ: {length}
                </UILabel>
                <div>
                  <Input
                    id="length"
                    type="range"
                    min="1"
                    max="128"
                    value={length}
                    onChange={(e) => setLength(Number.parseInt(e.target.value))}
                    className="h-2 px-0 py-0 w-full"
                  />
                </div>
                <div className="flex gap-2 text-xs text-text-secondary">
                  <span>1</span>
                  <span className="flex-1" />
                  <span>128</span>
                </div>
              </div>

              {checkboxes('screen', 'w-4 h-4', 'text-xs')}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
