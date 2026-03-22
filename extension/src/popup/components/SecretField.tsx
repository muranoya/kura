import { useState } from 'react'

interface SecretFieldProps {
  value: string
  label: string
  onCopy?: () => void
  style?: React.CSSProperties
}

export default function SecretField({ value, label, onCopy, style }: SecretFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
        {label}
      </label>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
        }}
      >
        <span>{visible ? value : '••••••••'}</span>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => setVisible(!visible)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#666',
              padding: 0,
            }}
          >
            {visible ? '隠す' : '表示'}
          </button>
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
      </div>
    </div>
  )
}
