import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { clearStorage } from '../../shared/storage'
import { useTheme } from '../../shared/ThemeContext'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export default function Settings() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

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
        {/* 外観 */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">外観</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">テーマ</p>
                  <p className="text-xs text-text-muted mt-1">
                    {theme === 'light' ? 'ライトモード' : 'ダークモード'}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={toggleTheme}>
                  {theme === 'light'
                    ? <><Moon size={16} className="mr-2" /> ダーク</>
                    : <><Sun size={16} className="mr-2" /> ライト</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* セキュリティ */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">セキュリティ</h2>

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
