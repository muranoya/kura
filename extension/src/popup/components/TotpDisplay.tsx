import { useState, useEffect } from 'react'

interface TotpDisplayProps {
  totp: string
  onCopy?: () => void
}

export default function TotpDisplay({ totp, onCopy }: TotpDisplayProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now()
      const totalSeconds = Math.floor(now / 1000)
      const cycleSeconds = totalSeconds % 30
      setRemainingSeconds(30 - cycleSeconds)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [])

  const progressPercentage = (remainingSeconds / 30) * 100

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          fontFamily: 'monospace',
        }}
      >
        <span>{totp}</span>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#2563eb',
              padding: 0,
            }}
          >
            コピー
          </button>
        )}
      </div>
      <div
        style={{
          marginTop: '0.25rem',
          height: '4px',
          backgroundColor: '#e5e7eb',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            backgroundColor: '#2563eb',
            width: `${progressPercentage}%`,
            transition: 'width 0.1s linear',
          }}
        />
      </div>
      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
        {remainingSeconds}秒で更新
      </p>
    </div>
  )
}
