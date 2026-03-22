import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getFromStorage, clearStorage } from '../../shared/storage'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ArrowLeft, AlertCircle } from 'lucide-react'

export default function Settings() {
  const navigate = useNavigate()
  const [storageConfig, setStorageConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

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

  const handleLogoutConfirmed = async () => {
    try {
      // ローカルストレージをクリア
      await clearStorage()
      // ページをリロードしてアプリを初期化
      window.location.reload()
    } catch (err) {
      console.error('Failed to logout:', err)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="設定" />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
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

        {/* セキュリティ */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">セキュリティ</h2>

          <div className="mb-6 p-4 bg-danger/10 rounded-lg border border-danger/20 flex gap-3">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-danger font-medium mb-1">ログアウトについて</p>
              <p className="text-text-muted">
                ログアウトするとローカルキャッシュとS3設定がクリアされます。
                再度ログインには設定の再入力が必要になります。
              </p>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={() => setLogoutDialogOpen(true)}
            className="w-full"
          >
            ログアウト
          </Button>
        </div>

        {/* 情報 */}
        <div className="pt-6 border-t border-border">
          <p className="text-xs text-text-muted text-center">
            kura v0.1.0 — サーバ不要のゼロ知識パスワードマネージャー
          </p>
        </div>
      </div>

      {/* ログアウト確認ダイアログ */}
      <ConfirmDialog
        open={logoutDialogOpen}
        title="ログアウト"
        description="ログアウトするとローカルキャッシュとS3設定がクリアされます。再度ログインには設定の再入力が必要になります。"
        confirmText="ログアウト"
        cancelText="キャンセル"
        isDangerous={true}
        onConfirm={handleLogoutConfirmed}
        onCancel={() => setLogoutDialogOpen(false)}
      />
    </div>
  )
}
