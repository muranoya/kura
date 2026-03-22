import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export default function MasterPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const passwordStrength = (pwd: string) => {
    if (!pwd) return 0
    let strength = 0
    if (pwd.length >= 8) strength++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    if (/[0-9]/.test(pwd)) strength++
    if (/[!@#$%^&*]/.test(pwd)) strength++
    return strength
  }

  const strength = passwordStrength(password)
  const strengthLabels = ['', '弱', '中弱', '中', '強']
  const strengthColors = ['', '#dc2626', '#ea580c', '#f59e0b', '#16a34a']

  const handleCreate = async () => {
    if (!confirmed) {
      alert('パスワードを忘れないことを確認してください')
      return
    }

    if (password !== confirmPassword) {
      alert('パスワードが一致しません')
      return
    }

    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'CREATE_VAULT', masterPassword: password },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        navigate('/onb/recovery', { state: { recoveryKey: response.recoveryKey } })
      } else {
        alert(response?.error || 'Vault作成に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2>マスターパスワード設定</h2>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          マスターパスワード
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="強力なパスワードを設定してください"
          style={{ width: '100%' }}
        />
        {password && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              backgroundColor: strengthColors[strength],
              color: 'white',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              textAlign: 'center',
            }}
          >
            強度: {strengthLabels[strength]}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          パスワード確認
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="パスワードを再入力してください"
          style={{ width: '100%' }}
        />
        {confirmPassword && (
          <div
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: password === confirmPassword ? '#16a34a' : '#dc2626',
            }}
          >
            {password === confirmPassword ? '✓ 一致しています' : '✗ 一致していません'}
          </div>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem', gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span style={{ fontSize: '0.875rem' }}>このパスワードを忘れないことを確認します</span>
      </label>

      <button
        className="btn-primary"
        onClick={handleCreate}
        disabled={password !== confirmPassword || !password || !confirmed}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: password !== confirmPassword || !password || !confirmed ? 0.5 : 1,
        }}
      >
        作成
      </button>
    </div>
  )
}
