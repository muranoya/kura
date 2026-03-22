import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface Label {
  id: string
  name: string
}

export default function LabelManager() {
  const navigate = useNavigate()
  const [labels, setLabels] = useState<Label[]>([])
  const [newLabelName, setNewLabelName] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadLabels()
  }, [])

  const loadLabels = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'LIST_LABELS' },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setLabels(response.labels || [])
      } else {
        setError(response?.error || 'ラベルの読み込みに失敗しました')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) {
      setError('ラベル名を入力してください')
      return
    }

    setCreating(true)
    setError('')
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'CREATE_LABEL', name: newLabelName },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        setLabels([...labels, response.label])
        setNewLabelName('')
      } else {
        setError(response?.error || 'ラベルの作成に失敗しました')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteLabel = async (id: string) => {
    if (!window.confirm('このラベルを削除しますか？')) return

    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'DELETE_LABEL', id },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        setLabels(labels.filter((label) => label.id !== id))
      } else {
        alert(response?.error || '削除に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>ラベル管理</h2>

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
          新しいラベル
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            placeholder="ラベル名を入力"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleCreateLabel}
            disabled={creating || !newLabelName.trim()}
            style={{
              padding: '0.5rem 1rem',
              opacity: creating || !newLabelName.trim() ? 0.5 : 1,
            }}
          >
            {creating ? '作成中...' : '追加'}
          </button>
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#666' }}>読み込み中...</p>}

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>ラベル一覧</h3>
        {labels.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', fontSize: '0.875rem' }}>
            ラベルがありません
          </p>
        ) : (
          labels.map((label) => (
            <div
              key={label.id}
              style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.875rem' }}>{label.name}</span>
              <button
                onClick={() => handleDeleteLabel(label.id)}
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
