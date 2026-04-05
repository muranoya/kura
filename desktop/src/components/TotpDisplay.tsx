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
    <div className="flex items-center justify-end gap-1.5">
      <span className="font-mono text-sm tracking-widest text-text-primary">{totp}</span>
      <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          className="stroke-border"
          strokeWidth="2.5"
        />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          className="stroke-accent"
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
          className="fill-text-secondary"
          style={{ fontSize: '8px', fontFamily: 'sans-serif' }}
        >
          {remainingSeconds}
        </text>
      </svg>
    </div>
  )
}
