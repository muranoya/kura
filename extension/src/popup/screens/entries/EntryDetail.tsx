import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface Entry {
  id: string
  type: string
  name: string
  is_favorite: boolean
  typed_value: any
  notes?: string
  label_ids: string[]
}

export default function EntryDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
      if (response?.success) {
        setEntry(response.entry)
      } else {
        setError(response?.error || 'エントリの読み込みに失敗しました')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!entry) return
    try {
      await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'SET_FAVORITE', id, isFavorite: !entry.is_favorite },
          (response) => resolve(response)
        )
      })
      setEntry({ ...entry, is_favorite: !entry.is_favorite })
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    alert(`${label}をコピーしました`)
    // Service Workerへメッセージを送信してクリップボードクリアタイマーを開始
    chrome.runtime.sendMessage({ type: 'CLIPBOARD_COPIED' })
  }

  const handleDelete = async () => {
    if (!window.confirm('このエントリをゴミ箱に移動しますか？')) return
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'DELETE_ENTRY', id },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        navigate('/entries')
      } else {
        alert(response?.error || '削除に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    }
  }

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center' }}>読み込み中...</div>
  }

  if (!entry) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>{error || 'エントリが見つかりません'}</p>
        <button onClick={() => navigate('/entries')} style={{ marginTop: '1rem' }}>
          戻る
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{entry.name}</h2>
        <button
          onClick={handleToggleFavorite}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {entry.is_favorite ? '★' : '☆'}
        </button>
      </div>

      <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#666' }}>
        {entry.type}
      </p>

      {/* Display entry fields based on type */}
      <div style={{ marginTop: '1rem' }}>
        {entry.type === 'login' && (
          <>
            {entry.typed_value?.url && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
                  URL
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
                  <span>{entry.typed_value.url}</span>
                  <button
                    onClick={() => handleCopy(entry.typed_value.url, 'URL')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#2563eb' }}
                  >
                    コピー
                  </button>
                </div>
              </div>
            )}
            {entry.typed_value?.username && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
                  ユーザー名
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
                  <span>{entry.typed_value.username}</span>
                  <button
                    onClick={() => handleCopy(entry.typed_value.username, 'ユーザー名')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#2563eb' }}
                  >
                    コピー
                  </button>
                </div>
              </div>
            )}
            {entry.typed_value?.password && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
                  パスワード
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
                  <span>{showPassword ? entry.typed_value.password : '••••••••'}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#666' }}
                    >
                      {showPassword ? '隠す' : '表示'}
                    </button>
                    <button
                      onClick={() => handleCopy(entry.typed_value.password, 'パスワード')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#2563eb' }}
                    >
                      コピー
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {entry.notes && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
            メモ
          </label>
          <div
            style={{
              padding: '0.5rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {entry.notes}
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => navigate(`/entries/${id}/edit`)}
          style={{ flex: 1, padding: '0.5rem' }}
          className="btn-primary"
        >
          編集
        </button>
        <button
          onClick={handleDelete}
          style={{ flex: 1, padding: '0.5rem', color: '#dc2626', border: '1px solid #dc2626', background: '#fff' }}
        >
          削除
        </button>
      </div>

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
        戻る
      </button>
    </div>
  )
}
