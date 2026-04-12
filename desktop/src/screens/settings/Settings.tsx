import { save } from '@tauri-apps/plugin-dialog'
import { Check, Copy, ExternalLink, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
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
import { copySensitive } from '../../lib/clipboard'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../shared/constants'
import { clearStorage, getFromStorage, saveToStorage } from '../../shared/storage'
import type { AppSettings } from '../../shared/types'
import Import1puxDialog from './Import1puxDialog'

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

const CLIPBOARD_CLEAR_OPTIONS = [
  { value: '0', label: '無効' },
  { value: '30', label: '30秒' },
  { value: '60', label: '1分' },
  { value: '120', label: '2分' },
]

export default function Settings() {
  const pushError = usePushError()
  const [appVersion, setAppVersion] = useState('...')
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [storageConfig, setStorageConfig] = useState<Record<string, string> | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)

  // Auto-lock settings
  const [autolockMinutes, setAutolockMinutes] = useState<number>(DEFAULT_SETTINGS.autolockMinutes)
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<number>(
    DEFAULT_SETTINGS.clipboardClearSeconds,
  )

  // Load storage config and settings
  useEffect(() => {
    const loadStorageConfig = async () => {
      try {
        const configJson = await commands.getS3ConfigSession()
        setStorageConfig(configJson ? JSON.parse(configJson) : null)
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
          setClipboardClearSeconds(
            settings.clipboardClearSeconds ?? DEFAULT_SETTINGS.clipboardClearSeconds,
          )
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      }
    }
    loadStorageConfig()
    loadSettings()
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then((v) => setAppVersion(`v${v}`))
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

  const handleClipboardClearChange = (value: string) => {
    const seconds = Number(value)
    setClipboardClearSeconds(seconds)
    saveSettings({ clipboardClearSeconds: seconds })
  }

  // Import Dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Export
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  const handleExport = async () => {
    setExportConfirmOpen(false)
    setExportLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const filePath = await save({
        defaultPath: `kura-export-${today}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!filePath) return
      const json = await commands.exportBitwardenJson()
      await commands.saveExportFile(filePath, json)
    } catch (err) {
      pushError(`エクスポートに失敗しました: ${err}`)
    } finally {
      setExportLoading(false)
    }
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

  // Transfer Config Dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferPassword, setTransferPassword] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferString, setTransferString] = useState('')
  const [transferCopied, setTransferCopied] = useState(false)

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
    const configJson = await commands.getS3ConfigSession()
    if (configJson) {
      await commands.pushVaultAndTrack()
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
      // S3設定を新しいパスワードで再暗号化
      const configJson = await commands.getS3ConfigSession()
      if (configJson) {
        const encrypted = await commands.encryptConfig(newPassword, configJson)
        await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
      }
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

  const handleGenerateTransferConfig = async () => {
    setTransferError('')
    if (!transferPassword) {
      setTransferError('パスワードを入力してください')
      return
    }
    setTransferLoading(true)
    try {
      const configJson = await commands.getS3ConfigSession()
      if (!configJson) {
        throw new Error('S3設定が見つかりません')
      }
      const result = await commands.encryptTransferConfig(transferPassword, configJson)
      setTransferString(result)
    } catch (err: unknown) {
      setTransferError(err instanceof Error ? err.message : '転送コードの生成に失敗しました')
    } finally {
      setTransferLoading(false)
    }
  }

  const copyTransferString = async () => {
    try {
      await copySensitive(transferString)
      setTransferCopied(true)
      setTimeout(() => setTransferCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const copyRecoveryKey = async () => {
    try {
      await copySensitive(recoveryKeyDisplayValue)
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">クリップボード自動クリア</p>
                <p className="text-xs text-text-muted">コピー後の自動クリアまでの時間</p>
              </div>
              <Select
                value={String(clipboardClearSeconds)}
                onValueChange={handleClipboardClearChange}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIPBOARD_CLEAR_OPTIONS.map((opt) => (
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

        {/* データ */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">データ</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <Button
              variant="secondary"
              onClick={() => setImportDialogOpen(true)}
              className="w-full"
            >
              1Passwordからインポート
            </Button>
            <Button
              variant="secondary"
              onClick={() => setExportConfirmOpen(true)}
              className="w-full"
              disabled={exportLoading}
            >
              {exportLoading ? 'エクスポート中...' : 'Bitwarden形式でエクスポート'}
            </Button>
          </CardContent>
        </Card>

        {/* ストレージ設定 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">ストレージ設定</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
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
                  <p className="text-sm text-text-primary font-mono">{storageConfig.key}</p>
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
                <Button
                  variant="secondary"
                  onClick={() => setTransferDialogOpen(true)}
                  className="w-full"
                >
                  <Smartphone size={16} className="mr-2" />
                  設定を別端末に転送
                </Button>
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
              <p className="text-sm text-text-primary">{appVersion}</p>
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

      {/* エクスポート確認ダイアログ */}
      <ConfirmDialog
        open={exportConfirmOpen}
        title="データをエクスポート"
        description="Bitwarden JSON形式でエクスポートします。エクスポートされたファイルにはパスワードが平文で含まれます。取り扱いにご注意ください。"
        confirmText="エクスポート"
        onConfirm={handleExport}
        onCancel={() => setExportConfirmOpen(false)}
      />

      {/* インポートダイアログ */}
      <Import1puxDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          // Trigger a refresh if needed
          window.dispatchEvent(new CustomEvent('entries-changed'))
        }}
      />

      {/* 設定転送ダイアログ */}
      <Dialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open)
          if (!open) {
            setTransferPassword('')
            setTransferString('')
            setTransferError('')
            setTransferCopied(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>設定を別端末に転送</DialogTitle>
            <DialogDescription>
              転送パスワードで暗号化した転送コードを生成します。別の端末のセットアップ時にこのコードと転送パスワードを入力してください。
            </DialogDescription>
          </DialogHeader>
          {transferString ? (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded">
                <QRCodeSVG value={transferString} size={200} />
              </div>
              <div className="bg-bg-muted p-3 rounded font-mono text-xs break-all max-h-24 overflow-y-auto select-all">
                {transferString}
              </div>
              <Button variant="secondary" onClick={copyTransferString} className="w-full">
                {transferCopied ? (
                  <>
                    <Check size={16} className="mr-2" /> コピーしました
                  </>
                ) : (
                  <>
                    <Copy size={16} className="mr-2" /> 転送コードをコピー
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transfer-password" className="text-sm">
                  転送パスワード
                </Label>
                <PasswordInput
                  id="transfer-password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  disabled={transferLoading}
                  placeholder="受信側に共有するパスワードを設定"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && transferPassword) {
                      handleGenerateTransferConfig()
                    }
                  }}
                />
              </div>
              {transferError && (
                <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded">
                  {transferError}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {!transferString && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setTransferDialogOpen(false)}
                  disabled={transferLoading}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleGenerateTransferConfig}
                  disabled={transferLoading || !transferPassword}
                >
                  {transferLoading ? '生成中...' : '転送コードを生成'}
                </Button>
              </>
            )}
            {transferString && <Button onClick={() => setTransferDialogOpen(false)}>閉じる</Button>}
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
