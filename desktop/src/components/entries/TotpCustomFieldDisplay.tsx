import { Check, Maximize2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as commands from '../../commands'
import { copySensitive } from '../../lib/clipboard'
import TotpDisplay from '../TotpDisplay'
import { LargeTextDialog } from '../ui/large-text-dialog'

interface TotpCustomFieldDisplayProps {
  label: string
  value: string
}

export default function TotpCustomFieldDisplay({ label, value }: TotpCustomFieldDisplayProps) {
  const [totpCode, setTotpCode] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [largeTextOpen, setLargeTextOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTotp = useCallback(async () => {
    try {
      const code = await commands.generateTotpFromValue(value)
      const p = await commands.parseTotpPeriod(value)
      setTotpCode(code)
      setPeriod(p)
      setError(null)
    } catch (err) {
      setError(String(err))
      setTotpCode(null)
    }
  }, [value])

  useEffect(() => {
    fetchTotp()

    const checkAndRefresh = () => {
      const now = Math.floor(Date.now() / 1000)
      if (now % period === 0) {
        fetchTotp()
      }
    }

    intervalRef.current = setInterval(checkAndRefresh, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchTotp, period])

  const handleCopy = () => {
    if (!totpCode) return
    copySensitive(totpCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors border-l-2 ${
        totpCode
          ? 'cursor-pointer hover:bg-bg-elevated active:bg-bg-elevated/80 border-transparent'
          : 'opacity-50 border-transparent'
      } ${copied ? '!bg-accent-subtle !border-accent' : ''}`}
      onClick={handleCopy}
      role={totpCode ? 'button' : undefined}
      tabIndex={totpCode ? 0 : undefined}
      onKeyDown={
        totpCode
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') handleCopy()
            }
          : undefined
      }
    >
      <span className="text-xs text-text-secondary w-24 shrink-0 flex items-center gap-1">
        {label}
        {copied && <Check size={12} className="text-success" />}
      </span>
      <div className="flex-1 min-w-0">
        {error ? (
          <span className="text-xs text-danger">{error}</span>
        ) : totpCode ? (
          <TotpDisplay totp={totpCode} period={period} />
        ) : (
          <span className="text-xs text-text-muted">読み込み中...</span>
        )}
      </div>
      {totpCode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setLargeTextOpen(true)
          }}
          className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          <Maximize2 size={14} />
        </button>
      )}
      {totpCode && (
        <LargeTextDialog
          open={largeTextOpen}
          onOpenChange={setLargeTextOpen}
          label={label}
          value={totpCode}
        />
      )}
    </div>
  )
}
