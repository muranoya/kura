import { Store } from '@tauri-apps/plugin-store'
import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { syncVault } from '../../commands'
import { usePushError } from '../../contexts/ErrorContext'
import { useNotifySynced } from '../../contexts/SyncContext'
import { STORAGE_KEYS } from '../../shared/constants'
import { getFromStorage, saveToStorage } from '../../shared/storage'
import type { S3Config } from '../../shared/types'

function formatRelativeTime(unixSecs: number): string {
  const diffMin = Math.floor((Date.now() / 1000 - unixSecs) / 60)
  if (diffMin < 1) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

export default function SyncHeaderActions() {
  const notifySynced = useNotifySynced()
  const pushError = usePushError()
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [storageConfig, setStorageConfig] = useState<S3Config | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [_tick, setTick] = useState(0)

  // Load initial values
  useEffect(() => {
    const loadData = async () => {
      try {
        const [config, syncTime] = await Promise.all([
          getFromStorage<S3Config>(STORAGE_KEYS.S3_CONFIG),
          getFromStorage<number>(STORAGE_KEYS.LAST_SYNC_TIME),
        ])
        setStorageConfig(config ?? null)
        if (syncTime) {
          setLastSyncTime(syncTime)
        }
      } catch (err) {
        console.error('Failed to load sync data:', err)
      }
    }
    loadData()
  }, [])

  // Subscribe to storage changes for LAST_SYNC_TIME
  useEffect(() => {
    const subscribe = async () => {
      try {
        const store = await Store.load('settings.json')
        const unlisten = await store.onChange((key, value) => {
          if (key === STORAGE_KEYS.LAST_SYNC_TIME) {
            setLastSyncTime(value as number)
          }
        })
        return unlisten
      } catch (err) {
        console.error('Failed to subscribe to storage changes:', err)
      }
    }

    let unlisten: (() => void) | undefined
    subscribe().then((fn) => {
      unlisten = fn
    })

    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // Auto-update relative time every minute
  useEffect(() => {
    if (!lastSyncTime) return
    const timer = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(timer)
  }, [lastSyncTime])

  const handleSync = async () => {
    if (!storageConfig) return

    setSyncStatus('syncing')

    try {
      const configJson = JSON.stringify(storageConfig)
      const result = await syncVault(configJson)

      if (result.last_synced_at) {
        await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, result.last_synced_at)
        setLastSyncTime(result.last_synced_at)
      }

      if (result.synced) {
        notifySynced()
      }

      setSyncStatus('idle')
    } catch (err) {
      pushError(`同期に失敗しました: ${err}`, 'manual-sync')
      setSyncStatus('error')
      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)
    }
  }

  // Return nothing if storage not configured
  if (!storageConfig) return null

  return (
    <div className="flex items-center gap-1.5 ml-auto">
      {lastSyncTime && (
        <span className="text-xs text-text-muted">{formatRelativeTime(lastSyncTime)}</span>
      )}
      <button
        type="button"
        onClick={handleSync}
        disabled={syncStatus === 'syncing'}
        className="p-1 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        title="今すぐ同期"
      >
        {syncStatus === 'syncing' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}
