import { Check, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { usePushError } from '../../contexts/ErrorContext'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../shared/constants'
import { clearStorage, getFromStorage, saveToStorage } from '../../shared/storage'
import type { AppSettings } from '../../shared/types'

const AUTOLOCK_OPTIONS = [
  { value: '0', label: '無効' },
  { value: '1', label: '1分' },
  { value: '3', label: '3分' },
  { value: '5', label: '5分' },
  { value: '10', label: '10分' },
  { value: '15', label: '15分' },
  { value: '30', label: '30分' },
  { value: '60', label: '60分' },
]

export default function Settings() {
  const pushError = usePushError()
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [storageConfig, setStorageConfig] = useState<Record<string, string> | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)

  // Auto-lock settings
  const [autolockMinutes, setAutolockMinutes] = useState<number>(DEFAULT_SETTINGS.autolockMinutes)

  // Load storage config and settings
  useEffect(() => {
    const loadStorageConfig = async () => {
      try {
        const config = await getFromStorage<Record<string, string>>(STORAGE_KEYS.S3_CONFIG)
        setStorageConfig(config ?? null)
      } catch (err) {
        console.error('Failed to load storage config:', err)
      } finally {
        setStorageLoading(false)
      }
    }
    const loadSettings = async () => {
      try {
        const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
        if (settings) {
          setAutolockMinutes(settings.autolockMinutes ?? DEFAULT_SETTINGS.autolockMinutes)
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      }
    }
    loadStorageConfig()
    loadSettings()
  }, [])

  const saveSettings = async (updates: Partial<AppSettings>) => {
    try {
      const current = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
      const merged = { ...DEFAULT_SETTINGS, ...current, ...updates }
      await saveToStorage(STORAGE_KEYS.APP_SETTINGS, merged)
      window.dispatchEvent(new CustomEvent('settings-changed'))
    } catch (err) {
      pushError(`設定の保存に失敗しました: ${err}`)
    }
  }

  const handleAutolockChange = (value: string) => {
    const minutes = Number(value)
    setAutolockMinutes(minutes)
    saveSettings({ autolockMinutes: minutes })
  }

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
      // バックエンドのvaultセッションをロック
      await commands.lock()
      // ローカルストレージをクリア
      await clearStorage()
      // vaultファイルを削除
      await commands.deleteVaultFile()
      // ページをリロードしてオンボーディングに戻る
      window.location.href = '/'
    } catch (err) {
      pushError(`ログアウトに失敗しました: ${err}`)
    }
  }

  // 再暗号化操作後の上書きアップロード（マージ不可のためpushを使用）
  const saveVaultAndPush = async () => {
    const vaultBytes = await commands.getVaultBytes()
    await commands.writeVaultFile(vaultBytes)
    const s3Config = await getFromStorage<Record<string, string>>('s3Config')
    if (s3Config) {
      await commands.pushVaultAndTrack(JSON.stringify(s3Config))
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
      await saveVaultAndPush()
      setChangePasswordOpen(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setChangePasswordError(err instanceof Error ? err.message : 'パスワード変更に失敗しました')
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
      await saveVaultAndPush()
      setRotateDekOpen(false)
      setRotateDekPassword('')
      setRecoveryKeyDisplayValue(newRecoveryKey)
      setRecoveryKeyDisplayOpen(true)
    } catch (err: unknown) {
      setRotateDekError(err instanceof Error ? err.message : 'DEK更新に失敗しました')
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
      await saveVaultAndPush()
      setRegenerateRecoveryOpen(false)
      setRegeneratePassword('')
      setRecoveryKeyDisplayValue(newRecoveryKey)
      setRecoveryKeyDisplayOpen(true)
    } catch (err: unknown) {
      setRegenerateError(err instanceof Error ? err.message : 'リカバリーキー再生成に失敗しました')
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
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">設定</h1>
        <SyncHeaderActions />
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 一般 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">一般</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">自動ロック</p>
                <p className="text-xs text-text-muted">ウィンドウのフォーカスが外れてからの時間</p>
              </div>
              <Select value={String(autolockMinutes)} onValueChange={handleAutolockChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOLOCK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* セキュリティ */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">セキュリティ</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(true)}
              className="w-full"
            >
              マスターパスワード変更
            </Button>
            <Button variant="secondary" onClick={() => setRotateDekOpen(true)} className="w-full">
              DEK更新
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(true)}
              className="w-full"
            >
              リカバリーキー再生成
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full"
            >
              ログアウト
            </Button>
          </CardContent>
        </Card>

        {/* ストレージ設定 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">ストレージ設定</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            {storageLoading ? (
              <p className="text-sm text-text-muted">読み込み中...</p>
            ) : storageConfig ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-text-secondary block mb-1">
                    バケット
                  </span>
                  <p className="text-sm text-text-primary font-mono">
                    {storageConfig.bucket || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-text-secondary block mb-1">
                    リージョン
                  </span>
                  <p className="text-sm text-text-primary font-mono">
                    {storageConfig.region || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-text-secondary block mb-1">
                    ファイルパス
                  </span>
                  <p className="text-sm text-text-primary font-mono">
                    {storageConfig.key}
                  </p>
                </div>
                {storageConfig.endpoint && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary block mb-1">
                      エンドポイント
                    </span>
                    <p className="text-sm text-text-primary font-mono break-all">
                      {storageConfig.endpoint}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-muted">ストレージ設定が見つかりません</p>
            )}
          </CardContent>
        </Card>

        {/* このアプリについて */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">このアプリについて</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">バージョン</p>
              <p className="text-sm text-text-primary">v0.1.0</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">リポジトリ</p>
              <a
                href="https://github.com/muranoya/kura"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline flex items-center gap-1"
              >
                GitHub <ExternalLink size={12} />
              </a>
            </div>
          </CardContent>
        </Card>
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

      {/* マスターパスワード変更ダイアログ */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>マスターパスワード変更</DialogTitle>
            <DialogDescription>
              新しいマスターパスワードを設定します。現在のパスワードで認証が必要です。
              変更後、他のセットアップ済み端末では新しいマスターパスワードでの再ログインが必要になります。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="old-password" className="text-sm">
                現在のパスワード
              </Label>
              <PasswordInput
                id="old-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="現在のパスワード"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm">
                新しいパスワード
              </Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="新しいパスワード"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm">
                新しいパスワード（確認）
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="新しいパスワード（確認）"
              />
            </div>
            {changePasswordError && (
              <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded">
                {changePasswordError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(false)}
              disabled={changePasswordLoading}
            >
              キャンセル
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordLoading}>
              {changePasswordLoading ? '変更中...' : '変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DEK更新ダイアログ */}
      <Dialog open={rotateDekOpen} onOpenChange={setRotateDekOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>DEK更新</DialogTitle>
            <DialogDescription>
              データ暗号化キーを新しく生成します。マスターパスワードで認証が必要です。
              同時にリカバリーキーも更新されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rotate-dek-password" className="text-sm">
                マスターパスワード
              </Label>
              <PasswordInput
                id="rotate-dek-password"
                value={rotateDekPassword}
                onChange={(e) => setRotateDekPassword(e.target.value)}
                disabled={rotateDekLoading}
                placeholder="マスターパスワード"
              />
            </div>
            {rotateDekError && (
              <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded">
                {rotateDekError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setRotateDekOpen(false)}
              disabled={rotateDekLoading}
            >
              キャンセル
            </Button>
            <Button onClick={handleRotateDek} disabled={rotateDekLoading}>
              {rotateDekLoading ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー再生成ダイアログ */}
      <Dialog open={regenerateRecoveryOpen} onOpenChange={setRegenerateRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>リカバリーキー再生成</DialogTitle>
            <DialogDescription>
              新しいリカバリーキーを生成します。マスターパスワードで認証が必要です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regenerate-password" className="text-sm">
                マスターパスワード
              </Label>
              <PasswordInput
                id="regenerate-password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
                disabled={regenerateLoading}
                placeholder="マスターパスワード"
              />
            </div>
            {regenerateError && (
              <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded">
                {regenerateError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(false)}
              disabled={regenerateLoading}
            >
              キャンセル
            </Button>
            <Button onClick={handleRegenerateRecoveryKey} disabled={regenerateLoading}>
              {regenerateLoading ? '生成中...' : '生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー表示ダイアログ */}
      <Dialog open={recoveryKeyDisplayOpen} onOpenChange={setRecoveryKeyDisplayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しいリカバリーキー</DialogTitle>
            <DialogDescription>
              新しいリカバリーキーが生成されました。安全な場所に保管してください。
              マスターパスワードを忘れた場合に使用できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-bg-muted p-4 rounded font-mono text-sm break-all max-h-40 overflow-y-auto">
              {recoveryKeyDisplayValue}
            </div>
            <Button variant="secondary" onClick={copyRecoveryKey} className="w-full">
              {recoveryKeyCopied ? (
                <>
                  <Check size={16} className="mr-2" /> コピーしました
                </>
              ) : (
                <>
                  <Copy size={16} className="mr-2" /> コピー
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRecoveryKeyDisplayOpen(false)}>保管しました</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
