import { useState } from 'react'
import { copySensitive } from '../lib/clipboard'

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
  style?: React.CSSProperties
}

export default function CopyButton({ text, label = 'コピー', className, style }: CopyButtonProps) {
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

  return (
    <button type="button" onClick={handleCopy} className={className} style={style}>
      {copied ? '✓ コピーしました' : label}
    </button>
  )
}
