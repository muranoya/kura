import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface Conflict {
  entryId: string
  entryName: string
  conflictType: 'local_modified_remote_deleted' | 'remote_modified_local_deleted' | 'both_modified'
  localValue?: any
  remoteValue?: any
}

export default function ConflictResolver() {
  const navigate = useNavigate()
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolutions, setResolutions] = useState<Record<string, 'local' | 'remote'>>({})

  useEffect(() => {
    loadConflicts()
  }, [])

  const loadConflicts = async () => {
    setLoading(true)
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_SYNC_CONFLICTS' },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setConflicts(response.conflicts || [])
        const initialResolutions: Record<string, 'local' | 'remote'> = {}
        (response.conflicts || []).forEach((conflict: Conflict) => {
          initialResolutions[conflict.entryId] = 'local'
        })
        setResolutions(initialResolutions)
      }
    } catch (err) {
      console.error('Failed to load conflicts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async () => {
    setResolving(true)
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'RESOLVE_SYNC_CONFLICTS', resolutions },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        navigate('/entries')
      } else {
        alert(response?.error || 'コンフリクト解決に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center' }}>読み込み中...</div>
  }

  if (conflicts.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>解決するコンフリクトはありません</p>
        <button onClick={() => navigate('/sync')} style={{ marginTop: '1rem' }}>
          戻る
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>コンフリクトを解決</h2>
      <p style={{ margin: '0.5rem 0 1rem 0', fontSize: '0.875rem', color: '#666' }}>
        複数のデバイスで同時に変更されました。以下のエントリについて、どちらの変更を採用するか選択してください。
      </p>

      <div style={{ marginTop: '1rem' }}>
        {conflicts.map((conflict) => (
          <div
            key={conflict.entryId}
            style={{
              padding: '0.75rem',
              marginBottom: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500, fontSize: '0.875rem' }}>
              {conflict.entryName}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#666' }}>
              {conflict.conflictType === 'local_modified_remote_deleted' &&
                'ローカルで編集、リモートで削除'}
              {conflict.conflictType === 'remote_modified_local_deleted' &&
                'リモートで編集、ローカルで削除'}
              {conflict.conflictType === 'both_modified' && '両方で編集'}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="radio"
                  name={`conflict-${conflict.entryId}`}
                  value="local"
                  checked={resolutions[conflict.entryId] === 'local'}
                  onChange={() =>
                    setResolutions({ ...resolutions, [conflict.entryId]: 'local' })
                  }
                />
                <span style={{ fontSize: '0.875rem' }}>ローカル版</span>
              </label>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="radio"
                  name={`conflict-${conflict.entryId}`}
                  value="remote"
                  checked={resolutions[conflict.entryId] === 'remote'}
                  onChange={() =>
                    setResolutions({ ...resolutions, [conflict.entryId]: 'remote' })
                  }
                />
                <span style={{ fontSize: '0.875rem' }}>リモート版</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleResolve}
        disabled={resolving}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: resolving ? 0.5 : 1,
        }}
        className="btn-primary"
      >
        {resolving ? '解決中...' : '解決'}
      </button>

      <button
        onClick={() => navigate('/sync')}
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
