import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

export default function SyncStatus() {
  const navigate = useNavigate()
  const [syncing, setSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'conflict' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    loadSyncStatus()
  }, [])

  const loadSyncStatus = async () => {
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_SYNC_STATUS' },
          (response) => resolve(response)
        )
      })
      if (response?.success) {
        setLastSyncTime(response.lastSyncTime || null)
        setSyncStatus(response.status || 'idle')
      }
    } catch (err) {
      console.error('Failed to get sync status:', err)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncStatus('syncing')
    setError('')

    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'SYNC' },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        setSyncStatus('success')
        setLastSyncTime(new Date().toLocaleString())
      } else if (response?.conflict) {
        setSyncStatus('conflict')
        navigate('/sync/conflict-resolver')
      } else {
        setSyncStatus('error')
        setError(response?.error || '同期に失敗しました')
      }
    } catch (err) {
      setSyncStatus('error')
      setError(String(err))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>同期状態</h2>

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#f3f4f6',
          borderRadius: '0.375rem',
          textAlign: 'center',
        }}
      >
        {syncStatus === 'success' && (
          <>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#16a34a', fontWeight: 500 }}>
              ✓ 同期成功
            </p>
            {lastSyncTime && (
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
                最終同期: {lastSyncTime}
              </p>
            )}
          </>
        )}
        {syncStatus === 'syncing' && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#2563eb' }}>同期中...</p>
        )}
        {syncStatus === 'conflict' && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#ea580c' }}>
            ⚠️ 同期コンフリクトが発生しました
          </p>
        )}
        {syncStatus === 'error' && (
          <>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#dc2626' }}>
              ✗ 同期失敗
            </p>
            {error && (
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
                {error}
              </p>
            )}
          </>
        )}
        {syncStatus === 'idle' && lastSyncTime && (
          <p style={{ margin: '0 0 0 0', fontSize: '0.75rem', color: '#666' }}>
            最終同期: {lastSyncTime}
          </p>
        )}
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: syncing ? 0.5 : 1,
        }}
        className="btn-primary"
      >
        {syncing ? '同期中...' : '今すぐ同期'}
      </button>

      {syncStatus === 'conflict' && (
        <button
          onClick={() => navigate('/sync/conflict-resolver')}
          style={{
            marginTop: '0.5rem',
            width: '100%',
            background: '#ea580c',
            color: '#fff',
          }}
        >
          コンフリクトを解決
        </button>
      )}

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
