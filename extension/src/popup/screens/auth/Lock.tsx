import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
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
      // Chrome storage をクリア
      await new Promise<void>((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.clear(() => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          })
        } else {
          resolve()
        }
      })

      // ページをリロード
      window.location.href = '/'
    } catch (err) {
      setError(`ログアウト失敗: ${err}`)
      setShowLogoutDialog(false)
    }
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-base px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-3">
            <Lock className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">kura</h1>
          <p className="text-xs text-text-secondary">Vaultはロックされています</p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {/* エラーメッセージ */}
            {error && (
              <div className="mb-3 p-2 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {/* マスターパスワード入力 */}
            <div className="space-y-1.5 mb-4">
              <Label htmlFor="password" className="text-xs">
                マスターパスワード
              </Label>
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
                disabled={loading}
                autoFocus
                className="text-sm"
              />
            </div>

            {/* ロック解除ボタン */}
            <Button onClick={handleUnlock} disabled={loading} className="w-full mb-2 text-sm">
              {loading ? 'ロック解除中...' : 'ロック解除'}
            </Button>

            {/* リカバリーキーボタン */}
            <Button
              variant="secondary"
              onClick={() => navigate('/auth/recovery')}
              className="w-full text-sm"
            >
              リカバリーキーで復旧
            </Button>
          </CardContent>
        </Card>

        {/* ログアウトセクション */}
        <div className="mt-6">
          <div className="border-t border-border mb-4" />
          <Button variant="destructive" onClick={handleLogout} className="w-full text-sm">
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
