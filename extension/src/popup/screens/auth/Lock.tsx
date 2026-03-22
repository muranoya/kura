import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export default function Lock() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUnlock = async () => {
    setLoading(true)
    setError('')
    try {
      // Service Worker にアンロックメッセージを送信
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'UNLOCK', password },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        navigate('/entries')
      } else {
        setError(response?.error || 'アンロック失敗')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem' }}>kura</h1>
      <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.875rem' }}>
        ロックされています
      </p>

      <div style={{ marginTop: '2rem' }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="マスターパスワード"
          onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
          style={{ width: '100%' }}
        />

        {error && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleUnlock}
          disabled={loading || !password}
          style={{ marginTop: '1rem', width: '100%', opacity: loading || !password ? 0.5 : 1 }}
        >
          {loading ? 'ロック解除中...' : 'ロック解除'}
        </button>

        <button
          onClick={() => navigate('/auth/recovery')}
          style={{
            marginTop: '0.5rem',
            width: '100%',
            background: 'none',
            color: '#2563eb',
            fontSize: '0.875rem',
            padding: '0.5rem',
          }}
        >
          リカバリーキーで復旧
        </button>
      </div>
    </div>
  )
}
