import { save } from '@tauri-apps/plugin-dialog'
import { Check, Copy, ExternalLink, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { setLanguage } from '../../i18n'
import { copySensitive } from '../../lib/clipboard'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../shared/constants'
import { clearStorage, getFromStorage, saveToStorage } from '../../shared/storage'
import type { AppSettings, LanguageSetting } from '../../shared/types'
import Import1puxDialog from './Import1puxDialog'

export default function Settings() {
  const { t } = useTranslation()
  const pushError = usePushError()
  const [appVersion, setAppVersion] = useState('...')
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [storageConfig, setStorageConfig] = useState<Record<string, string> | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)

  // Language / Auto-lock / Clipboard settings
  const [language, setLanguageState] = useState<LanguageSetting>(DEFAULT_SETTINGS.language)
  const [autolockMinutes, setAutolockMinutes] = useState<number>(DEFAULT_SETTINGS.autolockMinutes)
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<number>(
    DEFAULT_SETTINGS.clipboardClearSeconds,
  )

  const autolockOptions = useMemo(
    () => [
      { value: '0', label: t('settings.autolockOptions.disabled') },
      { value: '1', label: t('settings.autolockOptions.minutes1') },
      { value: '3', label: t('settings.autolockOptions.minutes3') },
      { value: '5', label: t('settings.autolockOptions.minutes5') },
      { value: '10', label: t('settings.autolockOptions.minutes10') },
      { value: '15', label: t('settings.autolockOptions.minutes15') },
      { value: '30', label: t('settings.autolockOptions.minutes30') },
      { value: '60', label: t('settings.autolockOptions.minutes60') },
    ],
    [t],
  )

  const clipboardOptions = useMemo(
    () => [
      { value: '0', label: t('settings.clipboardOptions.disabled') },
      { value: '30', label: t('settings.clipboardOptions.seconds30') },
      { value: '60', label: t('settings.clipboardOptions.minutes1') },
      { value: '120', label: t('settings.clipboardOptions.minutes2') },
    ],
    [t],
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
          setLanguageState(settings.language ?? DEFAULT_SETTINGS.language)
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
      pushError(t('settings.errors.saveSettings', { error: String(err) }))
    }
  }

  const handleLanguageChange = async (value: string) => {
    const lang = value as LanguageSetting
    setLanguageState(lang)
    await setLanguage(lang)
    await saveSettings({ language: lang })
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
      pushError(t('settings.exportDialog.errorGeneric', { error: String(err) }))
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

  // 機密操作前のマスターパスワード再認証ダイアログ
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [reauthError, setReauthError] = useState('')
  const [reauthNext, setReauthNext] = useState<(() => void) | null>(null)

  const openReauth = (next: () => void) => {
    setReauthPassword('')
    setReauthError('')
    setReauthNext(() => next)
    setReauthOpen(true)
  }

  const handleReauthConfirm = async () => {
    if (!reauthPassword) {
      setReauthError(t('settings.reauthDialog.errorRequired'))
      return
    }
    setReauthLoading(true)
    setReauthError('')
    try {
      await commands.verifyPassword(reauthPassword)
      const next = reauthNext
      setReauthOpen(false)
      setReauthPassword('')
      setReauthNext(null)
      next?.()
    } catch {
      setReauthError(t('settings.reauthDialog.errorWrongPassword'))
    } finally {
      setReauthLoading(false)
    }
  }

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
      pushError(t('settings.errors.logout', { error: String(err) }))
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
      setChangePasswordError(t('settings.changePasswordDialog.errorRequired'))
      return
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError(t('settings.changePasswordDialog.errorMismatch'))
      return
    }
    if (newPassword === oldPassword) {
      setChangePasswordError(t('settings.changePasswordDialog.errorSame'))
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
      setChangePasswordError(
        err instanceof Error ? err.message : t('settings.changePasswordDialog.errorGeneric'),
      )
    } finally {
      setChangePasswordLoading(false)
    }
  }

  const handleRotateDek = async () => {
    setRotateDekError('')
    if (!rotateDekPassword) {
      setRotateDekError(t('settings.rotateDekDialog.errorRequired'))
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
      setRotateDekError(
        err instanceof Error ? err.message : t('settings.rotateDekDialog.errorGeneric'),
      )
    } finally {
      setRotateDekLoading(false)
    }
  }

  const handleRegenerateRecoveryKey = async () => {
    setRegenerateError('')
    if (!regeneratePassword) {
      setRegenerateError(t('settings.regenerateRecoveryDialog.errorRequired'))
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
      setRegenerateError(
        err instanceof Error ? err.message : t('settings.regenerateRecoveryDialog.errorGeneric'),
      )
    } finally {
      setRegenerateLoading(false)
    }
  }

  const handleGenerateTransferConfig = async () => {
    setTransferError('')
    if (!transferPassword) {
      setTransferError(t('settings.transferDialog.errorRequired'))
      return
    }
    setTransferLoading(true)
    try {
      const configJson = await commands.getS3ConfigSession()
      if (!configJson) {
        throw new Error(t('settings.transferDialog.errorMissing'))
      }
      const result = await commands.encryptTransferConfig(transferPassword, configJson)
      setTransferString(result)
    } catch (err: unknown) {
      setTransferError(
        err instanceof Error ? err.message : t('settings.transferDialog.errorGeneric'),
      )
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
        <h1 className="text-sm font-semibold text-text-primary flex-1">{t('settings.title')}</h1>
        <SyncHeaderActions />
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 一般 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">{t('settings.general.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">{t('settings.general.language')}</p>
                <p className="text-xs text-text-muted">
                  {t('settings.general.languageDescription')}
                </p>
              </div>
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{t('settings.general.languageSystem')}</SelectItem>
                  <SelectItem value="ja">{t('settings.general.languageJa')}</SelectItem>
                  <SelectItem value="en">{t('settings.general.languageEn')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">{t('settings.general.autolock')}</p>
                <p className="text-xs text-text-muted">
                  {t('settings.general.autolockDescription')}
                </p>
              </div>
              <Select value={String(autolockMinutes)} onValueChange={handleAutolockChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {autolockOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">{t('settings.general.clipboardClear')}</p>
                <p className="text-xs text-text-muted">
                  {t('settings.general.clipboardClearDescription')}
                </p>
              </div>
              <Select
                value={String(clipboardClearSeconds)}
                onValueChange={handleClipboardClearChange}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clipboardOptions.map((opt) => (
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
            <CardTitle className="text-sm font-medium">{t('settings.security.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(true)}
              className="w-full"
            >
              {t('settings.security.changePassword')}
            </Button>
            <Button variant="secondary" onClick={() => setRotateDekOpen(true)} className="w-full">
              {t('settings.security.rotateDek')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(true)}
              className="w-full"
            >
              {t('settings.security.regenerateRecovery')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full"
            >
              {t('settings.security.logout')}
            </Button>
          </CardContent>
        </Card>

        {/* データ */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">{t('settings.data.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <Button
              variant="secondary"
              onClick={() => setImportDialogOpen(true)}
              className="w-full"
            >
              {t('settings.data.import1pux')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => openReauth(() => setExportConfirmOpen(true))}
              className="w-full"
              disabled={exportLoading}
            >
              {exportLoading ? t('settings.data.exporting') : t('settings.data.exportBitwarden')}
            </Button>
          </CardContent>
        </Card>

        {/* ストレージ設定 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">{t('settings.storage.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            {storageLoading ? (
              <p className="text-sm text-text-muted">{t('settings.storage.loading')}</p>
            ) : storageConfig ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-text-secondary block mb-1">
                    {t('settings.storage.bucket')}
                  </span>
                  <p className="text-sm text-text-primary font-mono">
                    {storageConfig.bucket || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-text-secondary block mb-1">
                    {t('settings.storage.region')}
                  </span>
                  <p className="text-sm text-text-primary font-mono">
                    {storageConfig.region || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-text-secondary block mb-1">
                    {t('settings.storage.key')}
                  </span>
                  <p className="text-sm text-text-primary font-mono">{storageConfig.key}</p>
                </div>
                {storageConfig.endpoint && (
                  <div>
                    <span className="text-xs font-medium text-text-secondary block mb-1">
                      {t('settings.storage.endpoint')}
                    </span>
                    <p className="text-sm text-text-primary font-mono break-all">
                      {storageConfig.endpoint}
                    </p>
                  </div>
                )}
                <Button
                  variant="secondary"
                  onClick={() => openReauth(() => setTransferDialogOpen(true))}
                  className="w-full"
                >
                  <Smartphone size={16} className="mr-2" />
                  {t('settings.storage.transferToOther')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-muted">{t('settings.storage.notFound')}</p>
            )}
          </CardContent>
        </Card>

        {/* このアプリについて */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">{t('settings.about.title')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">{t('settings.about.version')}</p>
              <p className="text-sm text-text-primary">{appVersion}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">{t('settings.about.repository')}</p>
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
        title={t('settings.logoutDialog.title')}
        description={t('settings.logoutDialog.description')}
        confirmText={t('settings.logoutDialog.confirm')}
        cancelText={t('common.cancel')}
        isDangerous={true}
        onConfirm={handleLogoutConfirmed}
        onCancel={() => setLogoutDialogOpen(false)}
      />

      {/* マスターパスワード変更ダイアログ */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.changePasswordDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.changePasswordDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="old-password" className="text-sm">
                {t('settings.changePasswordDialog.oldPasswordLabel')}
              </Label>
              <PasswordInput
                id="old-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder={t('settings.changePasswordDialog.oldPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm">
                {t('settings.changePasswordDialog.newPasswordLabel')}
              </Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder={t('settings.changePasswordDialog.newPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm">
                {t('settings.changePasswordDialog.confirmLabel')}
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder={t('settings.changePasswordDialog.confirmPlaceholder')}
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordLoading}>
              {changePasswordLoading
                ? t('settings.changePasswordDialog.submitting')
                : t('settings.changePasswordDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DEK更新ダイアログ */}
      <Dialog open={rotateDekOpen} onOpenChange={setRotateDekOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.rotateDekDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.rotateDekDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rotate-dek-password" className="text-sm">
                {t('settings.rotateDekDialog.passwordLabel')}
              </Label>
              <PasswordInput
                id="rotate-dek-password"
                value={rotateDekPassword}
                onChange={(e) => setRotateDekPassword(e.target.value)}
                disabled={rotateDekLoading}
                placeholder={t('settings.rotateDekDialog.passwordPlaceholder')}
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRotateDek} disabled={rotateDekLoading}>
              {rotateDekLoading
                ? t('settings.rotateDekDialog.submitting')
                : t('settings.rotateDekDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー再生成ダイアログ */}
      <Dialog open={regenerateRecoveryOpen} onOpenChange={setRegenerateRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.regenerateRecoveryDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.regenerateRecoveryDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regenerate-password" className="text-sm">
                {t('settings.regenerateRecoveryDialog.passwordLabel')}
              </Label>
              <PasswordInput
                id="regenerate-password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
                disabled={regenerateLoading}
                placeholder={t('settings.regenerateRecoveryDialog.passwordPlaceholder')}
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRegenerateRecoveryKey} disabled={regenerateLoading}>
              {regenerateLoading
                ? t('settings.regenerateRecoveryDialog.submitting')
                : t('settings.regenerateRecoveryDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* エクスポート確認ダイアログ */}
      <ConfirmDialog
        open={exportConfirmOpen}
        title={t('settings.exportDialog.title')}
        description={t('settings.exportDialog.description')}
        confirmText={t('settings.exportDialog.confirm')}
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
            <DialogTitle>{t('settings.transferDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.transferDialog.description')}</DialogDescription>
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
                    <Check size={16} className="mr-2" /> {t('settings.transferDialog.copiedCode')}
                  </>
                ) : (
                  <>
                    <Copy size={16} className="mr-2" /> {t('settings.transferDialog.copyCode')}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transfer-password" className="text-sm">
                  {t('settings.transferDialog.passwordLabel')}
                </Label>
                <PasswordInput
                  id="transfer-password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  disabled={transferLoading}
                  placeholder={t('settings.transferDialog.passwordPlaceholder')}
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
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleGenerateTransferConfig}
                  disabled={transferLoading || !transferPassword}
                >
                  {transferLoading
                    ? t('settings.transferDialog.generating')
                    : t('settings.transferDialog.generate')}
                </Button>
              </>
            )}
            {transferString && (
              <Button onClick={() => setTransferDialogOpen(false)}>
                {t('settings.transferDialog.close')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* マスターパスワード再認証ダイアログ */}
      <Dialog
        open={reauthOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReauthOpen(false)
            setReauthPassword('')
            setReauthError('')
            setReauthNext(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.reauthDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.reauthDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reauth-password" className="text-sm">
                {t('settings.reauthDialog.passwordLabel')}
              </Label>
              <PasswordInput
                id="reauth-password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                disabled={reauthLoading}
                placeholder={t('settings.reauthDialog.passwordPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reauthPassword) {
                    handleReauthConfirm()
                  }
                }}
              />
            </div>
            {reauthError && (
              <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded">
                {reauthError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setReauthOpen(false)}
              disabled={reauthLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleReauthConfirm} disabled={reauthLoading || !reauthPassword}>
              {reauthLoading
                ? t('settings.reauthDialog.submitting')
                : t('settings.reauthDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー表示ダイアログ */}
      <Dialog open={recoveryKeyDisplayOpen} onOpenChange={setRecoveryKeyDisplayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.recoveryKeyDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.recoveryKeyDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-bg-muted p-4 rounded font-mono text-sm break-all max-h-40 overflow-y-auto">
              {recoveryKeyDisplayValue}
            </div>
            <Button variant="secondary" onClick={copyRecoveryKey} className="w-full">
              {recoveryKeyCopied ? (
                <>
                  <Check size={16} className="mr-2" /> {t('settings.recoveryKeyDialog.copied')}
                </>
              ) : (
                <>
                  <Copy size={16} className="mr-2" /> {t('settings.recoveryKeyDialog.copy')}
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRecoveryKeyDisplayOpen(false)}>
              {t('settings.recoveryKeyDialog.saved')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
