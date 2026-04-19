import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { STORAGE_KEYS } from '../../../shared/constants'
import { getFromStorage } from '../../../shared/storage'
import * as commands from '../../commands'
import { usePushError } from '../../contexts/ErrorContext'
import { Button } from '../ui/button'

interface SyncActionsProps {
  onSyncComplete?: () => void
}

export function SyncActions({ onSyncComplete }: SyncActionsProps) {
  const { t } = useTranslation()
  const pushError = usePushError()
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [storageConfigExists, setStorageConfigExists] = useState(true)
  const [_tick, setTick] = useState(0)

  const formatRelativeTime = useCallback(
    (unixSecs: number): string => {
      const diffMin = Math.floor((Date.now() / 1000 - unixSecs) / 60)
      if (diffMin < 1) return t('components.syncActions.justNow')
      if (diffMin < 60) return t('components.syncActions.minutesAgo', { count: diffMin })
      const h = Math.floor(diffMin / 60)
      if (h < 24) return t('components.syncActions.hoursAgo', { count: h })
      return t('components.syncActions.daysAgo', { count: Math.floor(h / 24) })
    },
    [t],
  )

  const loadLastSyncTime = useCallback(async () => {
    try {
      const config = await getFromStorage<Record<string, string>>(STORAGE_KEYS.S3_CONFIG)
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
  }, [])

  useEffect(() => {
    loadLastSyncTime()
  }, [loadLastSyncTime])

  useEffect(() => {
    if (!lastSyncTime) return
    const timer = setInterval(() => setTick((tick) => tick + 1), 60000)
    return () => clearInterval(timer)
  }, [lastSyncTime])

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
      onSyncComplete?.()
    } catch (err) {
      pushError(t('errors.syncFailed', { error: String(err) }), 'manual-sync')
    } finally {
      setSyncing(false)
    }
  }

  if (!storageConfigExists) return null

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-muted whitespace-nowrap">
        {lastSyncTime ? formatRelativeTime(lastSyncTime) : t('components.syncActions.neverSynced')}
      </span>
      <Button
        onClick={handleSync}
        disabled={syncing}
        size="sm"
        variant="ghost"
        className="text-xs px-1.5 h-6"
      >
        {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
      </Button>
    </div>
  )
}
