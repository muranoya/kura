import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Copy, Check, ExternalLink } from 'lucide-react'
import { useTheme } from '../../shared/ThemeContext'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { PageHeader } from '../../components/layout/PageHeader'
import * as commands from '../../commands'

export default function Settings() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  // Change Master Password Dialog
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState('')

  // Rotate DEK Dialog
  const [rotateDekOpen, setRotateDekOpen] = useState(false)
  const [rotateDekPassword, setRotateDekPassword] = useState('')
  const [rotateDekLoading, setRotateDekLoading] = useState(false)
  const [rotateDekError, setRotateDekError] = useState('')

  // Regenerate Recovery Key Dialog
  const [regenerateRecoveryOpen, setRegenerateRecoveryOpen] = useState(false)
  const [regeneratePassword, setRegeneratePassword] = useState('')
  const [regenerateLoading, setRegenerateLoading] = useState(false)
  const [regenerateError, setRegenerateError] = useState('')

  // Recovery Key Display Dialog
  const [recoveryKeyDisplayOpen, setRecoveryKeyDisplayOpen] = useState(false)
  const [recoveryKeyDisplayValue, setRecoveryKeyDisplayValue] = useState('')
  const [recoveryKeyCopied, setRecoveryKeyCopied] = useState(false)

  const handleLogoutConfirmed = async () => {
    try {
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
      window.location.href = '/'
    } catch (err) {
      console.error('Failed to logout:', err)
    }
  }

  const handleChangePassword = async () => {
    setChangePasswordError('')
    if (!oldPassword || !newPassword || !confirmPassword) {
      setChangePasswordError('すべてのフィールドを入力してください')
      return
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError('新しいパスワードが一致しません')
      return
    }
    if (newPassword === oldPassword) {
      setChangePasswordError('新しいパスワードは現在のものと異なる必要があります')
      return
    }

    setChangePasswordLoading(true)
    try {
      await commands.changeMasterPassword(oldPassword, newPassword)
      setChangePasswordOpen(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      alert('パスワードを変更しました')
    } catch (err: any) {
      setChangePasswordError(err?.message || 'パスワード変更に失敗しました')
    } finally {
      setChangePasswordLoading(false)
    }
  }

  const handleRotateDek = async () => {
    setRotateDekError('')
    if (!rotateDekPassword) {
      setRotateDekError('パスワードを入力してください')
      return
    }

    setRotateDekLoading(true)
    try {
      const newRecoveryKey = await commands.rotateDek(rotateDekPassword)
      setRotateDekOpen(false)
      setRotateDekPassword('')
      setRecoveryKeyDisplayValue(newRecoveryKey)
      setRecoveryKeyDisplayOpen(true)
    } catch (err: any) {
      setRotateDekError(err?.message || 'DEK更新に失敗しました')
    } finally {
      setRotateDekLoading(false)
    }
  }

  const handleRegenerateRecoveryKey = async () => {
    setRegenerateError('')
    if (!regeneratePassword) {
      setRegenerateError('パスワードを入力してください')
      return
    }

    setRegenerateLoading(true)
    try {
      const newRecoveryKey = await commands.regenerateRecoveryKey(regeneratePassword)
      setRegenerateRecoveryOpen(false)
      setRegeneratePassword('')
      setRecoveryKeyDisplayValue(newRecoveryKey)
      setRecoveryKeyDisplayOpen(true)
    } catch (err: any) {
      setRegenerateError(err?.message || 'リカバリーキー再生成に失敗しました')
    } finally {
      setRegenerateLoading(false)
    }
  }

  const copyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKeyDisplayValue)
      setRecoveryKeyCopied(true)
      setTimeout(() => setRecoveryKeyCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20">
      <PageHeader title="設定" showBackButton={false} />

      <div className="p-3 space-y-2">
        {/* 外観 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs font-medium">外観</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-text-primary">テーマ</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {theme === 'light' ? 'ライトモード' : 'ダークモード'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={toggleTheme} className="text-xs gap-1">
                {theme === 'light' ? (
                  <>
                    <Moon size={14} />
                    ダーク
                  </>
                ) : (
                  <>
                    <Sun size={14} />
                    ライト
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* セキュリティ */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs font-medium">セキュリティ</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(true)}
              className="w-full text-xs"
              size="sm"
            >
              マスターパスワード変更
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRotateDekOpen(true)}
              className="w-full text-xs"
              size="sm"
            >
              DEK更新
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(true)}
              className="w-full text-xs"
              size="sm"
            >
              リカバリーキー再生成
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full text-xs"
              size="sm"
            >
              ログアウト
            </Button>
          </CardContent>
        </Card>

        {/* このアプリについて */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs font-medium">このアプリについて</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <p className="text-text-muted">バージョン</p>
              <p className="text-text-primary">v0.1.0</p>
            </div>
            <div className="flex items-center justify-between text-xs">
              <p className="text-text-muted">リポジトリ</p>
              <a
                href="https://github.com/muranoya/kura"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1"
              >
                GitHub <ExternalLink size={10} />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ログアウト確認ダイアログ */}
      <ConfirmDialog
        open={logoutDialogOpen}
        title="ログアウト"
        description="ログアウトするとローカルキャッシュがクリアされます。再度ログインには設定の再入力が必要になります。"
        confirmText="ログアウト"
        cancelText="キャンセル"
        isDangerous={true}
        onConfirm={handleLogoutConfirmed}
        onCancel={() => setLogoutDialogOpen(false)}
      />

      {/* マスターパスワード変更ダイアログ */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">マスターパスワード変更</DialogTitle>
            <DialogDescription className="text-xs">
              新しいマスターパスワードを設定します。現在のパスワードで認証が必要です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="old-password" className="text-xs">
                現在のパスワード
              </Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="現在のパスワード"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-xs">
                新しいパスワード
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="新しいパスワード"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-xs">
                新しいパスワード（確認）
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="新しいパスワード（確認）"
                className="text-xs"
              />
            </div>
            {changePasswordError && (
              <div className="text-xs text-danger bg-danger/10 px-2 py-1.5 rounded">
                {changePasswordError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(false)}
              disabled={changePasswordLoading}
              size="sm"
              className="text-xs"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changePasswordLoading}
              size="sm"
              className="text-xs"
            >
              {changePasswordLoading ? '変更中...' : '変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DEK更新ダイアログ */}
      <Dialog open={rotateDekOpen} onOpenChange={setRotateDekOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">DEK更新</DialogTitle>
            <DialogDescription className="text-xs">
              データ暗号化キーを新しく生成します。マスターパスワードで認証が必要です。
              同時にリカバリーキーも更新されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rotate-dek-password" className="text-xs">
                マスターパスワード
              </Label>
              <Input
                id="rotate-dek-password"
                type="password"
                value={rotateDekPassword}
                onChange={(e) => setRotateDekPassword(e.target.value)}
                disabled={rotateDekLoading}
                placeholder="マスターパスワード"
                className="text-xs"
              />
            </div>
            {rotateDekError && (
              <div className="text-xs text-danger bg-danger/10 px-2 py-1.5 rounded">
                {rotateDekError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setRotateDekOpen(false)}
              disabled={rotateDekLoading}
              size="sm"
              className="text-xs"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleRotateDek}
              disabled={rotateDekLoading}
              size="sm"
              className="text-xs"
            >
              {rotateDekLoading ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー再生成ダイアログ */}
      <Dialog open={regenerateRecoveryOpen} onOpenChange={setRegenerateRecoveryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">リカバリーキー再生成</DialogTitle>
            <DialogDescription className="text-xs">
              新しいリカバリーキーを生成します。マスターパスワードで認証が必要です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="regenerate-password" className="text-xs">
                マスターパスワード
              </Label>
              <Input
                id="regenerate-password"
                type="password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
                disabled={regenerateLoading}
                placeholder="マスターパスワード"
                className="text-xs"
              />
            </div>
            {regenerateError && (
              <div className="text-xs text-danger bg-danger/10 px-2 py-1.5 rounded">
                {regenerateError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(false)}
              disabled={regenerateLoading}
              size="sm"
              className="text-xs"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleRegenerateRecoveryKey}
              disabled={regenerateLoading}
              size="sm"
              className="text-xs"
            >
              {regenerateLoading ? '生成中...' : '生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー表示ダイアログ */}
      <Dialog open={recoveryKeyDisplayOpen} onOpenChange={setRecoveryKeyDisplayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">新しいリカバリーキー</DialogTitle>
            <DialogDescription className="text-xs">
              新しいリカバリーキーが生成されました。安全な場所に保管してください。
              マスターパスワードを忘れた場合に使用できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-bg-elevated p-2 rounded font-mono text-xs break-all max-h-32 overflow-y-auto border border-border">
              {recoveryKeyDisplayValue}
            </div>
            <Button
              variant="secondary"
              onClick={copyRecoveryKey}
              className="w-full text-xs"
              size="sm"
            >
              {recoveryKeyCopied ? (
                <>
                  <Check size={12} className="mr-1" /> コピーしました
                </>
              ) : (
                <>
                  <Copy size={12} className="mr-1" /> コピー
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setRecoveryKeyDisplayOpen(false)}
              size="sm"
              className="text-xs"
            >
              保管しました
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
