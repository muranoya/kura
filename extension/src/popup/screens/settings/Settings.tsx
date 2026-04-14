import { Check, Code2, Copy, Download, ExternalLink, Send, Tags, Trash2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../../../shared/constants'
import { sendMessage } from '../../../shared/messages'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
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
import { Separator } from '../../components/ui/separator'
import TypeFilterDropdown from '../../components/ui/type-filter-dropdown'
import { usePushError } from '../../contexts/ErrorContext'
import { copySensitive } from '../../lib/clipboard'

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
  const navigate = useNavigate()
  const pushError = usePushError()
  const [storageConfig, setStorageConfig] = useState<Record<string, string> | null>(null)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  // Auto-lock settings
  const [autolockMinutes, setAutolockMinutes] = useState<number>(DEFAULT_SETTINGS.autolockMinutes)
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<number>(
    DEFAULT_SETTINGS.clipboardClearSeconds,
  )

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

  // Export
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  // Transfer Config Dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferPassword, setTransferPassword] = useState('')
  const [transferString, setTransferString] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferCopied, setTransferCopied] = useState(false)

  const handleExport = async () => {
    setExportConfirmOpen(false)
    setExportLoading(true)
    try {
      const json = await commands.exportBitwardenJson()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const today = new Date().toISOString().split('T')[0]
      const a = document.createElement('a')
      a.href = url
      a.download = `kura-export-${today}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      pushError(`エクスポートに失敗しました: ${err}`)
    } finally {
      setExportLoading(false)
    }
  }

  const loadStorageConfig = useCallback(async () => {
    try {
      const response = await new Promise<{
        success: boolean
        config: Record<string, string> | null
      }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_DECRYPTED_S3_CONFIG' }, resolve)
      })
      if (response?.success && response.config) {
        setStorageConfig(response.config)
      }
    } catch (err) {
      console.error('Failed to load storage config:', err)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const settings = await commands.getSettings()
      setAutolockMinutes(settings.autolockMinutes ?? DEFAULT_SETTINGS.autolockMinutes)
      setClipboardClearSeconds(
        settings.clipboardClearSeconds ?? DEFAULT_SETTINGS.clipboardClearSeconds,
      )
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }, [])

  useEffect(() => {
    loadStorageConfig()
    loadSettings()
  }, [loadStorageConfig, loadSettings])

  const handleAutolockChange = async (value: string) => {
    const minutes = Number(value)
    setAutolockMinutes(minutes)
    try {
      const currentSettings = await commands.getSettings()
      await commands.saveSettings({ ...currentSettings, autolockMinutes: minutes })
    } catch (err) {
      pushError(`設定の保存に失敗しました: ${err}`)
    }
  }

  const handleClipboardClearChange = async (value: string) => {
    const seconds = Number(value)
    setClipboardClearSeconds(seconds)
    try {
      const currentSettings = await commands.getSettings()
      await commands.saveSettings({ ...currentSettings, clipboardClearSeconds: seconds })
    } catch (err) {
      pushError(`設定の保存に失敗しました: ${err}`)
    }
  }

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
      window.close()
    } catch (err) {
      pushError(`ログアウトに失敗しました: ${err}`)
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
      await copySensitive(recoveryKeyDisplayValue)
      setRecoveryKeyCopied(true)
      setTimeout(() => setRecoveryKeyCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleGenerateTransferConfig = async () => {
    if (!storageConfig || !transferPassword) return
    setTransferLoading(true)
    setTransferError('')
    try {
      const response = await sendMessage({
        type: 'ENCRYPT_TRANSFER_CONFIG',
        password: transferPassword,
        configJson: JSON.stringify(storageConfig),
      })
      if (!response.success) {
        const msg = 'error' in response ? response.error : '転送コードの生成に失敗しました'
        throw new Error(msg)
      }
      if (!('transferString' in response) || !response.transferString) {
        throw new Error('転送コードが空です')
      }
      setTransferString(response.transferString)
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : String(err))
    } finally {
      setTransferLoading(false)
    }
  }

  const copyTransferString = async () => {
    if (!transferString) return
    try {
      await copySensitive(transferString)
      setTransferCopied(true)
      setTimeout(() => setTransferCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="設定" showBackButton={false} />

      <div className="p-3">
        {/* 一般 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            一般
          </h2>
          <div className="flex items-center justify-between px-1 gap-2">
            <span className="text-sm text-text-primary shrink-0">自動ロック</span>
            <div className="w-24">
              <TypeFilterDropdown
                value={String(autolockMinutes)}
                onChange={handleAutolockChange}
                options={AUTOLOCK_OPTIONS}
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-1 gap-2 mt-2">
            <span className="text-sm text-text-primary shrink-0">クリップボード自動クリア</span>
            <div className="w-24">
              <TypeFilterDropdown
                value={String(clipboardClearSeconds)}
                onChange={handleClipboardClearChange}
                options={CLIPBOARD_CLEAR_OPTIONS}
              />
            </div>
          </div>
        </section>

        <Separator className="my-3" />

        {/* 管理 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            管理
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => navigate('/labels')}
              className="w-full text-sm justify-start gap-2"
              size="sm"
            >
              <Tags size={14} />
              ラベル管理
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/trash')}
              className="w-full text-sm justify-start gap-2"
              size="sm"
            >
              <Trash2 size={14} />
              ゴミ箱
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* データ */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            データ
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => setExportConfirmOpen(true)}
              className="w-full text-sm justify-start gap-2"
              size="sm"
              disabled={exportLoading}
            >
              <Download size={14} />
              {exportLoading ? 'エクスポート中...' : 'Bitwarden形式でエクスポート'}
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* セキュリティ */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            セキュリティ
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              マスターパスワード変更
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRotateDekOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              DEK更新
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              リカバリーキー再生成
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              ログアウト
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* ストレージ設定 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            ストレージ設定
          </h2>
          {storageConfig ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-text-secondary block mb-1">バケット</span>
                <p className="text-text-primary font-mono">{storageConfig.bucket || 'N/A'}</p>
              </div>
              <div>
                <span className="font-medium text-text-secondary block mb-1">リージョン</span>
                <p className="text-text-primary font-mono">{storageConfig.region || 'N/A'}</p>
              </div>
              <div>
                <span className="font-medium text-text-secondary block mb-1">ファイルパス</span>
                <p className="text-text-primary font-mono break-all">{storageConfig.key}</p>
              </div>
              {storageConfig.endpoint && (
                <div>
                  <span className="font-medium text-text-secondary block mb-1">エンドポイント</span>
                  <p className="text-text-primary font-mono text-xs break-all">
                    {storageConfig.endpoint}
                  </p>
                </div>
              )}
              <Button
                variant="secondary"
                onClick={() => setTransferDialogOpen(true)}
                className="w-full text-sm justify-start gap-2"
                size="sm"
              >
                <Send size={14} />
                設定を別端末に転送
              </Button>
            </div>
          ) : (
            <p className="text-text-muted text-sm">ストレージ設定が見つかりません</p>
          )}
        </section>

        <Separator className="my-3" />

        {/* 開発者 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            開発者
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => navigate('/settings/dev-mode')}
              className="w-full text-sm justify-start gap-2"
              size="sm"
            >
              <Code2 size={14} />
              開発者モード
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* このアプリについて */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            このアプリについて
          </h2>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <p className="text-text-muted">バージョン</p>
              <p className="text-text-primary">v{chrome.runtime.getManifest().version}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
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
          </div>
        </section>
      </div>

      {/* エクスポート確認ダイアログ */}
      <ConfirmDialog
        open={exportConfirmOpen}
        title="データをエクスポート"
        description="Bitwarden JSON形式でエクスポートします。エクスポートされたファイルにはパスワードが平文で含まれます。取り扱いにご注意ください。"
        confirmText="エクスポート"
        onConfirm={handleExport}
        onCancel={() => setExportConfirmOpen(false)}
      />

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
            <DialogDescription className="text-sm">
              新しいマスターパスワードを設定します。現在のパスワードで認証が必要です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="old-password" className="text-sm">
                現在のパスワード
              </Label>
              <PasswordInput
                id="old-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="現在のパスワード"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-sm">
                新しいパスワード
              </Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="新しいパスワード"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-sm">
                新しいパスワード（確認）
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder="新しいパスワード（確認）"
                className="text-sm"
              />
            </div>
            {changePasswordError && (
              <div className="text-sm text-danger bg-danger/10 px-2 py-1.5 rounded">
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
              className="text-sm"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changePasswordLoading}
              size="sm"
              className="text-sm"
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
            <DialogDescription className="text-sm">
              データ暗号化キーを新しく生成します。マスターパスワードで認証が必要です。
              同時にリカバリーキーも更新されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rotate-dek-password" className="text-sm">
                マスターパスワード
              </Label>
              <PasswordInput
                id="rotate-dek-password"
                value={rotateDekPassword}
                onChange={(e) => setRotateDekPassword(e.target.value)}
                disabled={rotateDekLoading}
                placeholder="マスターパスワード"
                className="text-sm"
              />
            </div>
            {rotateDekError && (
              <div className="text-sm text-danger bg-danger/10 px-2 py-1.5 rounded">
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
              className="text-sm"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleRotateDek}
              disabled={rotateDekLoading}
              size="sm"
              className="text-sm"
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
            <DialogDescription className="text-sm">
              新しいリカバリーキーを生成します。マスターパスワードで認証が必要です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="regenerate-password" className="text-sm">
                マスターパスワード
              </Label>
              <PasswordInput
                id="regenerate-password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
                disabled={regenerateLoading}
                placeholder="マスターパスワード"
                className="text-sm"
              />
            </div>
            {regenerateError && (
              <div className="text-sm text-danger bg-danger/10 px-2 py-1.5 rounded">
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
              className="text-sm"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleRegenerateRecoveryKey}
              disabled={regenerateLoading}
              size="sm"
              className="text-sm"
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
            <DialogDescription className="text-sm">
              新しいリカバリーキーが生成されました。安全な場所に保管してください。
              マスターパスワードを忘れた場合に使用できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-bg-elevated p-2 rounded font-mono text-sm break-all max-h-32 overflow-y-auto border border-border">
              {recoveryKeyDisplayValue}
            </div>
            <Button
              variant="secondary"
              onClick={copyRecoveryKey}
              className="w-full text-sm"
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
            <Button onClick={() => setRecoveryKeyDisplayOpen(false)} size="sm" className="text-sm">
              保管しました
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">設定を別端末に転送</DialogTitle>
            <DialogDescription className="text-sm">
              転送パスワードで暗号化した転送コードを生成します。別端末のセットアップ時にこのコードと転送パスワードを入力してください。マスターパスワードとは異なるものを推奨します。
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 py-1">
            {transferString ? (
              <div className="space-y-3">
                <div className="flex justify-center p-3 bg-white rounded">
                  <QRCodeSVG value={transferString} size={180} />
                </div>
                <div className="bg-bg-elevated p-2 rounded font-mono text-xs break-all max-h-24 overflow-y-auto select-all border border-border">
                  {transferString}
                </div>
                <Button
                  variant="secondary"
                  onClick={copyTransferString}
                  className="w-full text-sm"
                  size="sm"
                >
                  {transferCopied ? (
                    <>
                      <Check size={12} className="mr-1" /> コピーしました
                    </>
                  ) : (
                    <>
                      <Copy size={12} className="mr-1" /> 転送コードをコピー
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="transfer-password" className="text-sm">
                    転送パスワード
                  </Label>
                  <PasswordInput
                    id="transfer-password"
                    value={transferPassword}
                    onChange={(e) => setTransferPassword(e.target.value)}
                    disabled={transferLoading}
                    placeholder="受信側に共有するパスワード"
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && transferPassword && !transferLoading) {
                        handleGenerateTransferConfig()
                      }
                    }}
                  />
                </div>
                {transferError && (
                  <div className="text-sm text-danger bg-danger/10 px-2 py-1.5 rounded">
                    {transferError}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {!transferString ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setTransferDialogOpen(false)}
                  disabled={transferLoading}
                  size="sm"
                  className="text-sm"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleGenerateTransferConfig}
                  disabled={transferLoading || !transferPassword}
                  size="sm"
                  className="text-sm"
                >
                  {transferLoading ? '生成中...' : '転送コードを生成'}
                </Button>
              </>
            ) : (
              <Button onClick={() => setTransferDialogOpen(false)} size="sm" className="text-sm">
                閉じる
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
