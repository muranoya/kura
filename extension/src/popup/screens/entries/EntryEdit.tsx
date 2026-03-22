import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface EntryData {
  id: string
  type: string
  name: string
  typed_value: any
  notes?: string
}

export default function EntryEdit() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<EntryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    notes: '',
  })

  useEffect(() => {
    loadEntry()
  }, [id])

  const loadEntry = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_ENTRY', id },
          (response) => resolve(response)
        )
      })
      if (response?.success && response.entry) {
        const e = response.entry
        setEntry(e)
        setFormData({
          name: e.name || '',
          url: e.typed_value?.url || '',
          username: e.typed_value?.username || '',
          password: e.typed_value?.password || '',
          notes: e.notes || '',
        })
      } else {
        setError(response?.error || 'エントリの読み込みに失敗しました')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!entry || !formData.name) {
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
            type: 'UPDATE_ENTRY',
            id: entry.id,
            name: formData.name,
            typed_value,
            notes: formData.notes || null,
          },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        navigate(`/entries/${entry.id}`)
      } else {
        setError(response?.error || '保存に失敗しました')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center' }}>読み込み中...</div>
  }

  if (!entry) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>エントリが見つかりません</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>エントリを編集</h2>

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
          名前
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          style={{ width: '100%' }}
        />
      </div>

      {entry.type === 'login' && (
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
        onClick={handleSave}
        disabled={saving || !formData.name}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: saving || !formData.name ? 0.5 : 1,
        }}
      >
        {saving ? '保存中...' : '保存'}
      </button>

      <button
        onClick={() => navigate(`/entries/${entry.id}`)}
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
