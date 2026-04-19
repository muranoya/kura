import { Check, ChevronDown, ChevronRight, Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as commands from '../../commands'
import { copySensitive } from '../../lib/clipboard'
import { Input } from '../ui/input'
import { Label as UILabel } from '../ui/label'
import { Separator } from '../ui/separator'

interface PasswordGeneratorPanelProps {
  onUse?: (password: string) => void
}

export default function PasswordGeneratorPanel({ onUse }: PasswordGeneratorPanelProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [length, setLength] = useState(16)
  const [includeLowercase, setIncludeLowercase] = useState(true)
  const [includeUppercase, setIncludeUppercase] = useState(true)
  const [includeNumbers, setIncludeNumbers] = useState(true)
  const [includeSymbols1, setIncludeSymbols1] = useState(true)
  const [includeSymbols2, setIncludeSymbols2] = useState(true)
  const [includeSymbols3, setIncludeSymbols3] = useState(true)
  const [showCharOptions, setShowCharOptions] = useState(false)

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

  useEffect(() => {
    handleGenerate()
  }, [handleGenerate])

  const handleCopy = () => {
    copySensitive(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isInline = !!onUse

  const containerClass = isInline ? 'space-y-2' : ''

  const wrapperClass = isInline
    ? 'border border-accent/30 rounded-md p-3 space-y-3 bg-bg-surface'
    : ''

  const checkboxes = (prefix: string, checkboxSize: string) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          id={`lowercase-${prefix}`}
          type="checkbox"
          checked={includeLowercase}
          onChange={(e) => setIncludeLowercase(e.target.checked)}
          className={`${checkboxSize} rounded border-border`}
        />
        <label htmlFor={`lowercase-${prefix}`} className="text-sm text-text-primary cursor-pointer">
          {t('passwordGenerator.lowercaseLabel')}
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
        <label htmlFor={`uppercase-${prefix}`} className="text-sm text-text-primary cursor-pointer">
          {t('passwordGenerator.uppercaseLabel')}
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
        <label htmlFor={`numbers-${prefix}`} className="text-sm text-text-primary cursor-pointer">
          {t('passwordGenerator.numbersLabel')}
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
        <label htmlFor={`symbols1-${prefix}`} className="text-sm text-text-primary cursor-pointer">
          {t('passwordGenerator.symbols1Label')}
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
        <label htmlFor={`symbols2-${prefix}`} className="text-sm text-text-primary cursor-pointer">
          {t('passwordGenerator.symbols2Label')}
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
        <label htmlFor={`symbols3-${prefix}`} className="text-sm text-text-primary cursor-pointer">
          {t('passwordGenerator.symbols3Label')}
        </label>
      </div>
    </div>
  )

  return (
    <div className={containerClass}>
      {isInline && (
        <div className={wrapperClass}>
          <div className="px-2 py-2">
            {password ? (
              <div className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated border border-border">
                <span className="font-mono text-sm text-text-primary flex-1 break-all">
                  {password}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1 text-text-muted hover:text-text-primary transition-colors"
                    title={t('common.copy')}
                  >
                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading}
                    className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                    title={t('passwordGenerator.regenerateButton')}
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                  {onUse && (
                    <button
                      type="button"
                      onClick={() => onUse(password)}
                      className="px-2 py-1 text-sm bg-accent text-white hover:bg-accent-hover rounded transition-colors whitespace-nowrap"
                      title={t('passwordGenerator.useThisPassword')}
                    >
                      {t('passwordGenerator.useButtonInline')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-2 rounded-md bg-bg-elevated border border-border text-center text-text-secondary text-sm">
                {t('passwordGenerator.notGeneratedYet')}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <UILabel htmlFor="length-inline" className="text-sm">
                {t('passwordGenerator.lengthLabel')}: {length}
              </UILabel>
              <Input
                id="length-inline"
                type="range"
                min="1"
                max="128"
                value={length}
                onChange={(e) => setLength(Number.parseInt(e.target.value, 10))}
                className="h-2 px-0 py-0 w-full"
              />
              <div className="flex gap-2 text-sm text-text-secondary">
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
                {t('passwordGenerator.charsetSettings')}
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
        <div>
          <section>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
              {t('passwordGenerator.generatedHeading')}
            </h2>
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
                    title={t('common.copy')}
                  >
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading}
                    className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                    title={t('passwordGenerator.regenerateButton')}
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-md bg-bg-elevated border border-border text-center text-text-secondary text-sm">
                {t('passwordGenerator.notGeneratedYet')}
              </div>
            )}
          </section>

          <Separator className="my-4" />

          <section>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
              {t('passwordGenerator.settingsHeading')}
            </h2>
            <div className="space-y-3">
              <div className="space-y-3">
                <UILabel htmlFor="length" className="text-sm">
                  {t('passwordGenerator.lengthLabel')}: {length}
                </UILabel>
                <div>
                  <Input
                    id="length"
                    type="range"
                    min="1"
                    max="128"
                    value={length}
                    onChange={(e) => setLength(Number.parseInt(e.target.value, 10))}
                    className="h-2 px-0 py-0 w-full"
                  />
                </div>
                <div className="flex gap-2 text-sm text-text-secondary">
                  <span>1</span>
                  <span className="flex-1" />
                  <span>128</span>
                </div>
              </div>

              {checkboxes('screen', 'w-4 h-4')}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
