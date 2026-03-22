import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const ENTRY_TYPES = ['login', 'bank', 'ssh_key', 'secure_note', 'credit_card']

export default function EntryCreate() {
  const navigate = useNavigate()
  const [type, setType] = useState('login')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    notes: '',
  })

  const handleCreate = async () => {
    if (!formData.name) {
      setError('名前は必須です')
      return
    }

    setSaving(true)
    setError('')
    try {
      const typed_value = {
        url: formData.url || null,
        username: formData.username || null,
        password: formData.password || null,
        totp: null,
      }

      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'CREATE_ENTRY',
            entryType: type,
            name: formData.name,
            typed_value,
            notes: formData.notes || null,
          },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        navigate('/entries')
      } else {
        setError(response?.error || '作成に失敗しました')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>新しいエントリを作成</h2>

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

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          タイプ
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{ width: '100%' }}
        >
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'login' && 'ログイン'}
              {t === 'bank' && '銀行口座'}
              {t === 'ssh_key' && 'SSHキー'}
              {t === 'secure_note' && 'セキュアノート'}
              {t === 'credit_card' && 'クレジットカード'}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          名前
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="エントリの名前"
          style={{ width: '100%' }}
        />
      </div>

      {type === 'login' && (
        <>
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              URL
            </label>
            <input
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              ユーザー名
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              パスワード
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
        </>
      )}

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          メモ
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="メモを入力..."
          style={{ width: '100%', height: '100px', fontFamily: 'inherit' }}
        />
      </div>

      <button
        className="btn-primary"
        onClick={handleCreate}
        disabled={saving || !formData.name}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: saving || !formData.name ? 0.5 : 1,
        }}
      >
        {saving ? '作成中...' : '作成'}
      </button>

      <button
        onClick={() => navigate('/entries')}
        style={{
          marginTop: '0.5rem',
          width: '100%',
          background: 'none',
          color: '#2563eb',
          fontSize: '0.875rem',
          padding: '0.5rem',
        }}
      >
        キャンセル
      </button>
    </div>
  )
}
