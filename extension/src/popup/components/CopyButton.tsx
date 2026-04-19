import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copySensitive } from '../lib/clipboard'

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
  style?: React.CSSProperties
}

export default function CopyButton({ text, label, className, style }: CopyButtonProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await copySensitive(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const resolvedLabel = label ?? t('common.copy')

  return (
    <button type="button" onClick={handleCopy} className={className} style={style}>
      {copied ? `✓ ${t('common.copied')}` : resolvedLabel}
    </button>
  )
}
