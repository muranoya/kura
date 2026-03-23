import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { clearStorage } from '../../shared/storage'
import { useTheme } from '../../shared/ThemeContext'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export default function Settings() {
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
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary">設定</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 外観 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">外観</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
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

        {/* セキュリティ */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">セキュリティ</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            <Button
              variant="destructive"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full"
            >
              ログアウト
            </Button>
          </CardContent>
        </Card>

        {/* 情報 */}
        <div className="pt-2 border-t border-border text-center">
          <p className="text-xs text-text-muted">
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
