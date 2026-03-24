import { useState, useEffect } from 'react'
import { getFromStorage } from '../../shared/storage'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { CheckCircle2, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { syncVault } from '../../commands'

export default function SyncStatus() {
  const [storageConfig, setStorageConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState<string>('')

  useEffect(() => {
    const loadStorageConfig = async () => {
      try {
        const config = await getFromStorage<any>('s3Config')
        if (config) {
          setStorageConfig(config)
        }
      } catch (err) {
        console.error('Failed to load storage config:', err)
      } finally {
        setLoading(false)
      }
    }
    loadStorageConfig()
  }, [])

  const handleSync = async () => {
    if (!storageConfig) return

    setSyncStatus('syncing')
    setSyncMessage('')

    try {
      const configJson = JSON.stringify(storageConfig)
      const result = await syncVault(configJson)

      setSyncStatus('success')
      setSyncMessage('同期が完了しました')

      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        setSyncStatus('idle')
        setSyncMessage('')
      }, 3000)
    } catch (err) {
      setSyncStatus('error')
      setSyncMessage(err instanceof Error ? err.message : '同期に失敗しました')
      console.error('Sync failed:', err)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary">同期状態</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-text-primary">同期準備完了</p>
                <p className="text-sm text-text-muted">クラウドストレージが正常に接続されています</p>
              </div>
              <Button
                onClick={handleSync}
                disabled={syncStatus === 'syncing' || !storageConfig}
                size="sm"
              >
                {syncStatus === 'syncing' ? (
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

        {/* Sync status message */}
        {syncMessage && (
          <Card className={syncStatus === 'error' ? 'border-error/30' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {syncStatus === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                )}
                <p className={syncStatus === 'error' ? 'text-error' : 'text-success'}>
                  {syncMessage}
                </p>
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
            <Card>
              <CardContent className="py-8 text-center text-text-muted">読み込み中...</CardContent>
            </Card>
          ) : storageConfig ? (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-text-secondary block mb-1">バケット</label>
                  <p className="text-text-primary font-mono">{storageConfig.bucket || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary block mb-1">リージョン</label>
                  <p className="text-text-primary font-mono">{storageConfig.region || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary block mb-1">ファイルパス</label>
                  <p className="text-text-primary font-mono text-sm">{storageConfig.key || 'vault.json'}</p>
                </div>
                {storageConfig.endpoint && (
                  <div>
                    <label className="text-sm font-medium text-text-secondary block mb-1">エンドポイント</label>
                    <p className="text-text-primary font-mono text-sm break-all">{storageConfig.endpoint}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-text-muted text-sm">ストレージ設定が見つかりません</p>
              </CardContent>
            </Card>
          )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
