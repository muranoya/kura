import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface Entry {
  id: string
  type: string
  name: string
}

export default function Trash() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTrash()
  }, [])

  const loadTrash = async () => {
    setLoading(true)
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'LIST_TRASH', filter: {} },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setEntries(response.entries || [])
      }
    } catch (err) {
      console.error('Failed to load trash:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'RESTORE_ENTRY', id },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setEntries(entries.filter((e) => e.id !== id))
      } else {
        alert(response?.error || '復元に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    }
  }

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm('このエントリを完全に削除しますか？この操作は取り消せません。')) return

    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'PURGE_ENTRY', id },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setEntries(entries.filter((e) => e.id !== id))
      } else {
        alert(response?.error || '削除に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>ゴミ箱</h2>

      {loading && <p style={{ textAlign: 'center', color: '#666' }}>読み込み中...</p>}

      <div style={{ marginTop: '1rem' }}>
        {entries.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', fontSize: '0.875rem' }}>
            削除済みのエントリはありません
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: '0.75rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 500, fontSize: '0.875rem' }}>
                  {entry.name}
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
                  {entry.type}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  onClick={() => handleRestore(entry.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                  }}
                >
                  復元
                </button>
                <button
                  onClick={() => handlePermanentDelete(entry.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => navigate('/entries')}
        style={{
          marginTop: '1.5rem',
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
