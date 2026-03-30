import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { clearStorage } from '../../shared/storage'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Lock } from 'lucide-react'

export default function LockScreen() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setError('パスワードを入力してください')
      return
    }

    setLoading(true)
    try {
      await commands.unlock(password)
      commands.syncVaultIfConfigured().catch(() => {}) // バックグラウンド
      window.location.reload()
    } catch (err) {
      setError(`ロック解除失敗: ${err}`)
      setLoading(false)
    }
  }, [password])

  const handleLogout = useCallback(() => {
    setShowLogoutDialog(true)
  }, [])

  const handleLogoutConfirm = useCallback(async () => {
    try {
      // Clear local storage and cache
      await clearStorage()

      // Delete vault file
      await commands.deleteVaultFile()

      // Page reload to reinitialize the app
      window.location.href = '/'
    } catch (err) {
      setError(`ログアウト失敗: ${err}`)
      setShowLogoutDialog(false)
    }
  }, [])

  return (
    <div className="flex items-center justify-center h-screen bg-bg-base px-4">
      <div className="w-full max-w-md">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">kura</h1>
          <p className="text-text-secondary">Vaultはロックされています</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* エラーメッセージ */}
            {error && (
              <div className="mb-4 p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* マスターパスワード入力 */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="password">マスターパスワード</Label>
              <Input
                id="password"
                type="password"
                placeholder="パスワードを入力"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              />
            </div>

            {/* ロック解除ボタン */}
            <Button
              onClick={handleUnlock}
              disabled={loading}
              className="w-full mb-2"
            >
              {loading ? 'ロック解除中...' : 'ロック解除'}
            </Button>

            {/* リカバリーキーボタン */}
            <Button
              variant="secondary"
              onClick={() => navigate('/auth/recovery')}
              className="w-full"
            >
              リカバリーキーで復旧
            </Button>
          </CardContent>
        </Card>

        {/* ログアウトセクション */}
        <div className="mt-8">
          <Separator className="mb-6" />
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="w-full"
          >
            ログアウト
          </Button>
        </div>

        <ConfirmDialog
          open={showLogoutDialog}
          title="ログアウト"
          description="設定とローカルキャッシュを削除し、初期設定から再開します。この操作は取り消せません。よろしいですか？"
          confirmText="ログアウト"
          isDangerous={true}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowLogoutDialog(false)}
        />
      </div>
    </div>
  )
}
