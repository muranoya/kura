import { useState, useEffect } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { getFromStorage } from '../../../shared/storage'
import { STORAGE_KEYS } from '../../../shared/constants'
import * as commands from '../../commands'

function formatRelativeTime(unixSecs: number): string {
  const diffMin = Math.floor((Date.now() / 1000 - unixSecs) / 60)
  if (diffMin < 1) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

export function SyncActions() {
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [storageConfigExists, setStorageConfigExists] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    loadLastSyncTime()
  }, [])

  // Auto-update relative time every minute
  useEffect(() => {
    if (!lastSyncTime) return
    const timer = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(timer)
  }, [lastSyncTime])

  const loadLastSyncTime = async () => {
    try {
      const config = await getFromStorage<any>(STORAGE_KEYS.S3_CONFIG)
      setStorageConfigExists(!!config)

      const stored = await getFromStorage<number | string>(STORAGE_KEYS.LAST_SYNC_TIME)
      if (stored) {
        if (typeof stored === 'string') {
          const unixSecs = Math.floor(new Date(stored).getTime() / 1000)
          setLastSyncTime(unixSecs)
        } else if (typeof stored === 'number') {
          setLastSyncTime(stored)
        }
      }
    } catch (err) {
      console.error('Failed to load sync time:', err)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await commands.sync()
      const stored = await getFromStorage<number | string>(STORAGE_KEYS.LAST_SYNC_TIME)
      if (stored) {
        if (typeof stored === 'string') {
          const unixSecs = Math.floor(new Date(stored).getTime() / 1000)
          setLastSyncTime(unixSecs)
        } else if (typeof stored === 'number') {
          setLastSyncTime(stored)
        }
      }
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }

  // Return nothing if storage not configured
  if (!storageConfigExists) return null

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-muted whitespace-nowrap">
        {lastSyncTime ? formatRelativeTime(lastSyncTime) : '未同期'}
      </span>
      <Button
        onClick={handleSync}
        disabled={syncing}
        size="sm"
        variant="ghost"
        className="text-xs px-1.5 h-6"
      >
        {syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
      </Button>
    </div>
  )
}
