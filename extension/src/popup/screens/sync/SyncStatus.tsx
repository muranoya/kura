import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, XCircle, Clock } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import * as commands from '../../commands'

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
      await commands.sync()
      setSyncStatus('success')
      setLastSyncTime(new Date().toLocaleString('ja-JP'))
    } catch (err) {
      setSyncStatus('error')
      setError(String(err) || '同期に失敗しました')
    } finally {
      setSyncing(false)
    }
  }

  const getStatusDisplay = () => {
    switch (syncStatus) {
      case 'success':
        return {
          icon: <CheckCircle size={24} className="text-success" />,
          title: '同期成功',
          color: 'text-success',
        }
      case 'syncing':
        return {
          icon: <RefreshCw size={24} className="text-accent animate-spin" />,
          title: '同期中...',
          color: 'text-accent',
        }
      case 'conflict':
        return {
          icon: <AlertCircle size={24} className="text-warning" />,
          title: '同期コンフリクト',
          color: 'text-warning',
        }
      case 'error':
        return {
          icon: <XCircle size={24} className="text-danger" />,
          title: '同期失敗',
          color: 'text-danger',
        }
      default:
        return {
          icon: <Clock size={24} className="text-text-muted" />,
          title: 'アイドル状態',
          color: 'text-text-muted',
        }
    }
  }

  const display = getStatusDisplay()

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="同期" showBackButton={false} />

      <div className="p-4 space-y-4">
        {/* 同期ステータス表示 */}
        <Card>
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
            {display.icon}
            <div className="text-center">
              <p className={`text-sm font-medium ${display.color}`}>{display.title}</p>
              {lastSyncTime && syncStatus !== 'syncing' && (
                <p className="text-xs text-text-muted mt-1">
                  最終同期: {lastSyncTime}
                </p>
              )}
            </div>

            {error && (
              <div className="w-full mt-2 p-2 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-xs text-danger text-center">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 同期情報 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs font-medium">同期設定</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2 text-xs text-text-secondary">
            <p>• 自動同期: オフ（手動で実行してください）</p>
            <p>• 保存時同期: オン（エントリ保存時に自動同期）</p>
            <p>• オフラインモード: 対応</p>
          </CardContent>
        </Card>

        {/* アクションボタン */}
        <div className="space-y-2">
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="w-full text-sm gap-2"
            size="sm"
          >
            <RefreshCw size={16} />
            {syncing ? '同期中...' : '今すぐ同期'}
          </Button>

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
    </div>
  )
}
