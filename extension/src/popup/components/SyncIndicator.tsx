interface SyncIndicatorProps {
  status: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncTime?: string
}

export default function SyncIndicator({ status, lastSyncTime }: SyncIndicatorProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'syncing':
        return '#2563eb'
      case 'success':
        return '#16a34a'
      case 'error':
        return '#dc2626'
      default:
        return '#666'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'syncing':
        return '同期中...'
      case 'success':
        return '✓ 同期済み'
      case 'error':
        return '✗ 同期エラー'
      default:
        return 'オフライン'
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#f3f4f6',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
      }}
    >
      <span style={{ color: getStatusColor(), fontWeight: 500 }}>
        {getStatusText()}
      </span>
      {lastSyncTime && (
        <span style={{ color: '#666' }}>
          {new Date(lastSyncTime).toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}
