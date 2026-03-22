import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface Entry {
  id: string
  type: string
  name: string
  is_favorite: boolean
  label_ids: string[]
}

export default function EntryList() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<Entry[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadEntries()
  }, [])

  const loadEntries = async () => {
    setLoading(true)
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'LIST_ENTRIES', filter: {} },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setEntries(response.entries || [])
      }
    } catch (err) {
      console.error('Failed to load entries:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredEntries = entries.filter((e) =>
    e.name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>エントリ一覧</h2>
        <button
          onClick={() => navigate('/entries/create')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
        >
          + 追加
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="検索..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#666' }}>読み込み中...</p>}

      <div style={{ marginTop: '1rem' }}>
        {filteredEntries.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', fontSize: '0.875rem' }}>
            エントリがありません
          </p>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => navigate(`/entries/${entry.id}`)}
              style={{
                padding: '0.75rem',
                borderBottom: '1px solid #e5e7eb',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 500, fontSize: '0.875rem' }}>
                  {entry.is_favorite && '★ '}
                  {entry.name}
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
                  {entry.type}
                </p>
              </div>
              <span style={{ fontSize: '0.875rem', color: '#2563eb' }}>→</span>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => navigate('/sync')}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.875rem',
            background: '#f3f4f6',
          }}
        >
          同期
        </button>
        <button
          onClick={() => navigate('/trash')}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.875rem',
            background: '#f3f4f6',
          }}
        >
          ゴミ箱
        </button>
        <button
          onClick={() => navigate('/settings')}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.875rem',
            background: '#f3f4f6',
          }}
        >
          設定
        </button>
      </div>
    </div>
  )
}
