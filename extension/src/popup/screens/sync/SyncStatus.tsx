import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { getFromStorage } from '../../../shared/storage'
import { STORAGE_KEYS } from '../../../shared/constants'
import * as commands from '../../commands'

function formatDateTime(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(unixSecs: number): string {
  const diffMin = Math.floor((Date.now() / 1000 - unixSecs) / 60)
  if (diffMin < 1) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

export default function SyncStatus() {
  const navigate = useNavigate()
  const [storageConfig, setStorageConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'conflict' | 'error'>('idle')
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    loadStorageConfig()
  }, [])

  // Auto-update relative time every minute
  useEffect(() => {
    if (!lastSyncTime) return
    const timer = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(timer)
  }, [lastSyncTime])

  const loadStorageConfig = async () => {
    try {
      const config = await getFromStorage<any>(STORAGE_KEYS.S3_CONFIG)
      if (config) {
        setStorageConfig(config)
      }
      const stored = await getFromStorage<number | string>(STORAGE_KEYS.LAST_SYNC_TIME)
      if (stored) {
        // 互換性: 古いISO文字列形式をUnix秒に変換
        if (typeof stored === 'string') {
          const unixSecs = Math.floor(new Date(stored).getTime() / 1000)
          setLastSyncTime(unixSecs)
        } else if (typeof stored === 'number') {
          setLastSyncTime(stored)
        }
      }
    } catch (err) {
      console.error('Failed to load storage config:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncStatus('syncing')
    setError('')

    try {
      await commands.sync()
      setSyncStatus('success')

      // Reload sync time from storage
      const stored = await getFromStorage<number | string>(STORAGE_KEYS.LAST_SYNC_TIME)
      if (stored) {
        // 互換性: 古いISO文字列形式をUnix秒に変換
        if (typeof stored === 'string') {
          const unixSecs = Math.floor(new Date(stored).getTime() / 1000)
          setLastSyncTime(unixSecs)
        } else if (typeof stored === 'number') {
          setLastSyncTime(stored)
        }
      }

      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)
    } catch (err) {
      setSyncStatus('error')
      setError(String(err) || '同期に失敗しました')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="同期" showBackButton={false} />

      <div className="p-4 space-y-4">
        {/* 同期ステータスと最終同期日時 */}
        <Card>
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-text-primary">
                  {lastSyncTime ? `最終同期: ${formatDateTime(lastSyncTime)}` : '未同期'}
                </p>
                <p className="text-sm text-text-muted">
                  {lastSyncTime ? formatRelativeTime(lastSyncTime) : 'まだ同期していません'}
                </p>
              </div>
              <Button
                onClick={handleSync}
                disabled={syncing || !storageConfig}
                size="sm"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    同期中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    今すぐ同期
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* エラーメッセージ */}
        {error && (
          <Card className="border-error/30">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
                <p className="text-error">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ストレージ設定 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">ストレージ設定</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            {loading ? (
              <p className="text-text-muted text-sm">読み込み中...</p>
            ) : storageConfig ? (
              <div className="space-y-3 text-sm">
                <div>
                  <label className="font-medium text-text-secondary block mb-1">バケット</label>
                  <p className="text-text-primary font-mono">{storageConfig.bucket || 'N/A'}</p>
                </div>
                <div>
                  <label className="font-medium text-text-secondary block mb-1">リージョン</label>
                  <p className="text-text-primary font-mono">{storageConfig.region || 'N/A'}</p>
                </div>
                <div>
                  <label className="font-medium text-text-secondary block mb-1">ファイルパス</label>
                  <p className="text-text-primary font-mono break-all">{storageConfig.key || 'vault.json'}</p>
                </div>
                {storageConfig.endpoint && (
                  <div>
                    <label className="font-medium text-text-secondary block mb-1">エンドポイント</label>
                    <p className="text-text-primary font-mono text-xs break-all">{storageConfig.endpoint}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-text-muted text-sm">ストレージ設定が見つかりません</p>
            )}
          </CardContent>
        </Card>

        {/* コンフリクト解決ボタン */}
        {syncStatus === 'conflict' && (
          <Button
            variant="secondary"
            onClick={() => navigate('/sync/conflict-resolver')}
            className="w-full text-sm"
            size="sm"
          >
            コンフリクトを解決
          </Button>
        )}
      </div>
    </div>
  )
}
