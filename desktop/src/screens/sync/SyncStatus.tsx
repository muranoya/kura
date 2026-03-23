import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getFromStorage } from '../../shared/storage'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { CheckCircle2 } from 'lucide-react'

export default function SyncStatus() {
  const navigate = useNavigate()
  const [storageConfig, setStorageConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="同期状態" />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="font-semibold text-text-primary">同期準備完了</p>
                <p className="text-sm text-text-muted">クラウドストレージが正常に接続されています</p>
              </div>
            </div>

            <Button onClick={() => navigate('/entries')} className="w-full">
              戻る
            </Button>
          </CardContent>
        </Card>

        {/* ストレージ設定 */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">ストレージ設定</h2>
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
        </div>
      </div>
    </div>
  )
}
