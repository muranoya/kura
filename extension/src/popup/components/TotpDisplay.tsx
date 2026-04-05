import { useEffect, useState } from 'react'

interface TotpDisplayProps {
  totp: string
  period?: number
}

export default function TotpDisplay({ totp, period = 30 }: TotpDisplayProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now()
      const totalSeconds = Math.floor(now / 1000)
      const cycleSeconds = totalSeconds % period
      setRemainingSeconds(period - cycleSeconds)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [period])

  const progress = remainingSeconds / period
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '0.375rem',
      }}
    >
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          letterSpacing: '0.15em',
        }}
      >
        {totp}
      </span>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        role="img"
        aria-label="TOTP countdown"
        style={{ flexShrink: 0 }}
      >
        <circle cx="14" cy="14" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 14 14)"
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
        <text
          x="14"
          y="14"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '8px', fill: '#666', fontFamily: 'sans-serif' }}
        >
          {remainingSeconds}
        </text>
      </svg>
    </div>
  )
}
