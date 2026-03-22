import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export default function Recovery() {
  const navigate = useNavigate()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRecover = async () => {
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません')
      return
    }

    setLoading(true)
    setError('')
    try {
      // リカバリーキーでアンロック
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'RECOVER', recoveryKey, newPassword },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        navigate('/entries')
      } else {
        setError(response?.error || 'リカバリー失敗')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2>リカバリーキーで復旧</h2>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          リカバリーキー
        </label>
        <input
          type="text"
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value)}
          placeholder="XXXX-XXXX-..."
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          新しいマスターパスワード
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="新しいパスワード"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          パスワード確認
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="パスワードを再入力"
          style={{ width: '100%' }}
        />
      </div>

      {error && (
        <div
          style={{
            marginTop: '1rem',
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
        onClick={handleRecover}
        disabled={loading || !recoveryKey || !newPassword}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: loading || !recoveryKey || !newPassword ? 0.5 : 1,
        }}
      >
        {loading ? '復旧中...' : '復旧'}
      </button>

      <button
        onClick={() => navigate('/auth/lock')}
        style={{
          marginTop: '0.5rem',
          width: '100%',
          background: 'none',
          color: '#2563eb',
          fontSize: '0.875rem',
          padding: '0.5rem',
        }}
      >
        戻る
      </button>
    </div>
  )
}
