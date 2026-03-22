import { useState } from 'react'

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
      await navigator.clipboard.writeText(text)
      setCopied(true)
      // Service Worker へメッセージを送信してクリップボードクリアタイマーを開始
      chrome.runtime.sendMessage({ type: 'CLIPBOARD_COPIED' })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={className}
      style={style}
    >
      {copied ? '✓ コピーしました' : label}
    </button>
  )
}
