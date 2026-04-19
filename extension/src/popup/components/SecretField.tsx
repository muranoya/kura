import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface SecretFieldProps {
  value: string
  label: string
  onCopy?: () => void
  style?: React.CSSProperties
}

export default function SecretField({ value, label, onCopy, style }: SecretFieldProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <div style={style}>
      <span
        style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}
      >
        {label}
      </span>
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
            type="button"
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
            {visible ? t('common.hide') : t('common.show')}
          </button>
          {onCopy && (
            <button
              type="button"
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
              {t('common.copy')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
