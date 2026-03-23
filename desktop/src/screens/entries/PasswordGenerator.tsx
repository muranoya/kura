import { useState, useEffect, useCallback } from 'react'
import * as commands from '../../commands'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label as UILabel } from '../../components/ui/label'
import { Copy } from 'lucide-react'

export default function PasswordGenerator() {
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

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary">パスワードジェネレータ</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* パスワード表示 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">生成されたパスワード</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            {password ? (
              <div className="flex items-center gap-2 p-3 rounded-md bg-bg-elevated border border-border">
                <span className="font-mono text-sm text-text-primary flex-1 break-all">{password}</span>
                <button
                  onClick={handleCopy}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
                >
                  {copied ? <span className="text-xs text-success">✓</span> : <Copy size={16} />}
                </button>
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
                  onChange={(e) => setLength(parseInt(e.target.value))}
                  className="h-2 px-0 py-0 w-full"
                />
              </div>
              <div className="flex gap-2 text-xs text-text-secondary">
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
                <label htmlFor="uppercase" className="text-xs text-text-primary cursor-pointer">
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
                <label htmlFor="lowercase" className="text-xs text-text-primary cursor-pointer">
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
                <label htmlFor="numbers" className="text-xs text-text-primary cursor-pointer">
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
                <label htmlFor="symbols" className="text-xs text-text-primary cursor-pointer">
                  特殊文字 (!@#$%...)
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
