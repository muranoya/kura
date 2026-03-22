import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'

export default function RecoveryKey() {
  const navigate = useNavigate()
  const location = useLocation()
  const passedRecoveryKey = (location.state as any)?.recoveryKey
  const [recoveryKey] = useState(passedRecoveryKey || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')
  const [confirmed, setConfirmed] = useState(false)
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('')

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryKey)
    alert('リカバリーキーをコピーしました')
  }

  const handleComplete = () => {
    if (recoveryKey.replace(/-/g, '') !== recoveryKeyInput.replace(/-/g, '')) {
      alert('リカバリーキーが一致しません')
      return
    }
    navigate('/entries')
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2>リカバリーキー</h2>

      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          color: '#991b1b',
        }}
      >
        ⚠️ このキーを失うと復旧不可能です。安全な場所に保管してください。
      </div>

      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '0.375rem',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          wordBreak: 'break-all',
        }}
      >
        {recoveryKey}
      </div>

      <button onClick={handleCopy} style={{ marginTop: '1rem', width: '100%' }}>
        コピー
      </button>

      <label style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem', gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span style={{ fontSize: '0.875rem' }}>紙に書き写しました</span>
      </label>

      {confirmed && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            リカバリーキーを入力して確認
          </label>
          <input
            type="text"
            value={recoveryKeyInput}
            onChange={(e) => setRecoveryKeyInput(e.target.value)}
            placeholder="XXXX-XXXX-..."
            style={{ width: '100%' }}
          />
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleComplete}
        disabled={!confirmed || !recoveryKeyInput}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: !confirmed || !recoveryKeyInput ? 0.5 : 1,
        }}
      >
        完了
      </button>
    </div>
  )
}
