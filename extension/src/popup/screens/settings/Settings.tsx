import { Check, Code2, Copy, Download, ExternalLink, Send, Tags, Trash2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { SUPPORTED_LANGUAGES, type SupportedLanguage, setLanguage } from '../../i18n'
import { copySensitive } from '../../lib/clipboard'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const pushError = usePushError()
  const [storageConfig, setStorageConfig] = useState<Record<string, string> | null>(null)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  // Auto-lock settings
  const [autolockMinutes, setAutolockMinutes] = useState<number>(DEFAULT_SETTINGS.autolockMinutes)
  const [clipboardClearSeconds, setClipboardClearSeconds] = useState<number>(
    DEFAULT_SETTINGS.clipboardClearSeconds,
  )
  const [language, setLanguageState] = useState<SupportedLanguage>(
    (i18n.language as SupportedLanguage) ?? 'en',
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

  // 機密操作前のマスターパスワード再認証ダイアログ
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [reauthError, setReauthError] = useState('')
  const [reauthNext, setReauthNext] = useState<(() => void) | null>(null)

  const AUTOLOCK_OPTIONS = [
    { value: '0', label: t('settings.general.autoLockOptions.disabled') },
    { value: '1', label: t('settings.general.autoLockOptions.1min') },
    { value: '3', label: t('settings.general.autoLockOptions.3min') },
    { value: '5', label: t('settings.general.autoLockOptions.5min') },
    { value: '10', label: t('settings.general.autoLockOptions.10min') },
    { value: '15', label: t('settings.general.autoLockOptions.15min') },
    { value: '30', label: t('settings.general.autoLockOptions.30min') },
    { value: '60', label: t('settings.general.autoLockOptions.60min') },
  ]

  const CLIPBOARD_CLEAR_OPTIONS = [
    { value: '0', label: t('settings.general.clipboardClearOptions.disabled') },
    { value: '30', label: t('settings.general.clipboardClearOptions.30sec') },
    { value: '60', label: t('settings.general.clipboardClearOptions.1min') },
    { value: '120', label: t('settings.general.clipboardClearOptions.2min') },
  ]

  const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((lng) => ({
    value: lng,
    label: t(`language.${lng}`),
  }))

  const openReauth = (next: () => void) => {
    setReauthPassword('')
    setReauthError('')
    setReauthNext(() => next)
    setReauthOpen(true)
  }

  const handleReauthConfirm = async () => {
    if (!reauthPassword) {
      setReauthError(t('settings.security.masterPasswordRequired'))
      return
    }
    setReauthLoading(true)
    setReauthError('')
    try {
      const response = await sendMessage({ type: 'VERIFY_PASSWORD', password: reauthPassword })
      if (!response.success) {
        throw new Error(
          'error' in response ? response.error : t('settings.security.masterPasswordIncorrect'),
        )
      }
      const next = reauthNext
      setReauthOpen(false)
      setReauthPassword('')
      setReauthNext(null)
      next?.()
    } catch {
      setReauthError(t('settings.security.masterPasswordIncorrect'))
    } finally {
      setReauthLoading(false)
    }
  }

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
      pushError(t('errors.exportFailed', { error: String(err) }))
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
      if (
        settings.language &&
        (SUPPORTED_LANGUAGES as readonly string[]).includes(settings.language)
      ) {
        setLanguageState(settings.language as SupportedLanguage)
      }
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
      pushError(t('errors.saveSettingsFailed', { error: String(err) }))
    }
  }

  const handleClipboardClearChange = async (value: string) => {
    const seconds = Number(value)
    setClipboardClearSeconds(seconds)
    try {
      const currentSettings = await commands.getSettings()
      await commands.saveSettings({ ...currentSettings, clipboardClearSeconds: seconds })
    } catch (err) {
      pushError(t('errors.saveSettingsFailed', { error: String(err) }))
    }
  }

  const handleLanguageChange = async (value: string) => {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(value)) return
    const lang = value as SupportedLanguage
    setLanguageState(lang)
    try {
      await setLanguage(lang)
      const currentSettings = await commands.getSettings()
      await commands.saveSettings({ ...currentSettings, language: lang })
    } catch (err) {
      pushError(t('errors.saveSettingsFailed', { error: String(err) }))
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
      pushError(t('errors.logoutFailed', { error: String(err) }))
    }
  }

  const handleChangePassword = async () => {
    setChangePasswordError('')
    if (!oldPassword || !newPassword || !confirmPassword) {
      setChangePasswordError(t('settings.security.passwordRequiredAll'))
      return
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError(t('settings.security.newPasswordMismatch'))
      return
    }
    if (newPassword === oldPassword) {
      setChangePasswordError(t('settings.security.newPasswordSameAsOld'))
      return
    }

    setChangePasswordLoading(true)
    try {
      await commands.changeMasterPassword(oldPassword, newPassword)
      setChangePasswordOpen(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      alert(t('settings.security.changeSuccess'))
    } catch (err: unknown) {
      setChangePasswordError(
        err instanceof Error ? err.message : t('settings.security.changeFailed'),
      )
    } finally {
      setChangePasswordLoading(false)
    }
  }

  const handleRotateDek = async () => {
    setRotateDekError('')
    if (!rotateDekPassword) {
      setRotateDekError(t('settings.security.passwordRequired'))
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
      setRotateDekError(err instanceof Error ? err.message : t('settings.security.rotateDekFailed'))
    } finally {
      setRotateDekLoading(false)
    }
  }

  const handleRegenerateRecoveryKey = async () => {
    setRegenerateError('')
    if (!regeneratePassword) {
      setRegenerateError(t('settings.security.passwordRequired'))
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
      setRegenerateError(
        err instanceof Error ? err.message : t('settings.security.regenerateFailed'),
      )
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
        const msg =
          'error' in response ? response.error : t('settings.storage.transferGenerationFailed')
        throw new Error(msg)
      }
      if (!('transferString' in response) || !response.transferString) {
        throw new Error(t('settings.storage.transferCodeEmpty'))
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
      <PageHeader title={t('settings.title')} showBackButton={false} />

      <div className="p-3">
        {/* 一般 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('settings.sections.general')}
          </h2>
          <div className="flex items-center justify-between px-1 gap-2">
            <span className="text-sm text-text-primary shrink-0">
              {t('settings.general.language')}
            </span>
            <div className="w-32">
              <TypeFilterDropdown
                value={language}
                onChange={handleLanguageChange}
                options={LANGUAGE_OPTIONS}
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-1 gap-2 mt-2">
            <span className="text-sm text-text-primary shrink-0">
              {t('settings.general.autoLock')}
            </span>
            <div className="w-24">
              <TypeFilterDropdown
                value={String(autolockMinutes)}
                onChange={handleAutolockChange}
                options={AUTOLOCK_OPTIONS}
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-1 gap-2 mt-2">
            <span className="text-sm text-text-primary shrink-0">
              {t('settings.general.clipboardClear')}
            </span>
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
            {t('settings.sections.management')}
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => navigate('/labels')}
              className="w-full text-sm justify-start gap-2"
              size="sm"
            >
              <Tags size={14} />
              {t('settings.management.labels')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/trash')}
              className="w-full text-sm justify-start gap-2"
              size="sm"
            >
              <Trash2 size={14} />
              {t('settings.management.trash')}
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* データ */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('settings.sections.data')}
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => openReauth(() => setExportConfirmOpen(true))}
              className="w-full text-sm justify-start gap-2"
              size="sm"
              disabled={exportLoading}
            >
              <Download size={14} />
              {exportLoading ? t('settings.data.exporting') : t('settings.data.exportBitwarden')}
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* セキュリティ */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('settings.sections.security')}
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => setChangePasswordOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              {t('settings.security.changePassword')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRotateDekOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              {t('settings.security.rotateDek')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRegenerateRecoveryOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              {t('settings.security.regenerateRecoveryKey')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full text-sm"
              size="sm"
            >
              {t('settings.security.logout')}
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* ストレージ設定 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('settings.sections.storage')}
          </h2>
          {storageConfig ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-text-secondary block mb-1">
                  {t('settings.storage.bucket')}
                </span>
                <p className="text-text-primary font-mono">{storageConfig.bucket || 'N/A'}</p>
              </div>
              <div>
                <span className="font-medium text-text-secondary block mb-1">
                  {t('settings.storage.region')}
                </span>
                <p className="text-text-primary font-mono">{storageConfig.region || 'N/A'}</p>
              </div>
              <div>
                <span className="font-medium text-text-secondary block mb-1">
                  {t('settings.storage.filePath')}
                </span>
                <p className="text-text-primary font-mono break-all">{storageConfig.key}</p>
              </div>
              {storageConfig.endpoint && (
                <div>
                  <span className="font-medium text-text-secondary block mb-1">
                    {t('settings.storage.endpoint')}
                  </span>
                  <p className="text-text-primary font-mono text-xs break-all">
                    {storageConfig.endpoint}
                  </p>
                </div>
              )}
              <Button
                variant="secondary"
                onClick={() => openReauth(() => setTransferDialogOpen(true))}
                className="w-full text-sm justify-start gap-2"
                size="sm"
              >
                <Send size={14} />
                {t('settings.storage.transferButton')}
              </Button>
            </div>
          ) : (
            <p className="text-text-muted text-sm">{t('settings.storage.notFound')}</p>
          )}
        </section>

        <Separator className="my-3" />

        {/* 開発者 */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('settings.sections.developer')}
          </h2>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              onClick={() => navigate('/settings/dev-mode')}
              className="w-full text-sm justify-start gap-2"
              size="sm"
            >
              <Code2 size={14} />
              {t('settings.developer.devMode')}
            </Button>
          </div>
        </section>

        <Separator className="my-3" />

        {/* このアプリについて */}
        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('settings.sections.about')}
          </h2>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <p className="text-text-muted">{t('settings.about.version')}</p>
              <p className="text-text-primary">v{chrome.runtime.getManifest().version}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-text-muted">{t('settings.about.repository')}</p>
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
        title={t('settings.data.exportConfirmTitle')}
        description={t('settings.data.exportConfirmDesc')}
        confirmText={t('settings.data.exportConfirmButton')}
        onConfirm={handleExport}
        onCancel={() => setExportConfirmOpen(false)}
      />

      {/* ログアウト確認ダイアログ */}
      <ConfirmDialog
        open={logoutDialogOpen}
        title={t('settings.security.logoutDialogTitle')}
        description={t('settings.security.logoutDialogDesc')}
        confirmText={t('settings.security.logoutButton')}
        cancelText={t('common.cancel')}
        isDangerous={true}
        onConfirm={handleLogoutConfirmed}
        onCancel={() => setLogoutDialogOpen(false)}
      />

      {/* マスターパスワード変更ダイアログ */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t('settings.security.changePasswordDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t('settings.security.changePasswordDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="old-password" className="text-sm">
                {t('settings.security.currentPasswordLabel')}
              </Label>
              <PasswordInput
                id="old-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder={t('settings.security.currentPasswordPlaceholder')}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-sm">
                {t('settings.security.newPasswordLabel')}
              </Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder={t('settings.security.newPasswordPlaceholder')}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-sm">
                {t('settings.security.confirmPasswordLabel')}
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordLoading}
                placeholder={t('settings.security.confirmPasswordPlaceholder')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changePasswordLoading}
              size="sm"
              className="text-sm"
            >
              {changePasswordLoading
                ? t('settings.security.changing')
                : t('settings.security.changeButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DEK更新ダイアログ */}
      <Dialog open={rotateDekOpen} onOpenChange={setRotateDekOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t('settings.security.rotateDekDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t('settings.security.rotateDekDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rotate-dek-password" className="text-sm">
                {t('settings.security.masterPasswordLabel')}
              </Label>
              <PasswordInput
                id="rotate-dek-password"
                value={rotateDekPassword}
                onChange={(e) => setRotateDekPassword(e.target.value)}
                disabled={rotateDekLoading}
                placeholder={t('settings.security.masterPasswordLabel')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRotateDek}
              disabled={rotateDekLoading}
              size="sm"
              className="text-sm"
            >
              {rotateDekLoading
                ? t('settings.security.rotateDekRunning')
                : t('settings.security.rotateDekButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー再生成ダイアログ */}
      <Dialog open={regenerateRecoveryOpen} onOpenChange={setRegenerateRecoveryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t('settings.security.regenerateDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t('settings.security.regenerateDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="regenerate-password" className="text-sm">
                {t('settings.security.masterPasswordLabel')}
              </Label>
              <PasswordInput
                id="regenerate-password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
                disabled={regenerateLoading}
                placeholder={t('settings.security.masterPasswordLabel')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRegenerateRecoveryKey}
              disabled={regenerateLoading}
              size="sm"
              className="text-sm"
            >
              {regenerateLoading
                ? t('settings.security.regenerateRunning')
                : t('settings.security.regenerateButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* リカバリーキー表示ダイアログ */}
      <Dialog open={recoveryKeyDisplayOpen} onOpenChange={setRecoveryKeyDisplayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t('settings.security.newRecoveryKeyDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t('settings.security.newRecoveryKeyDialogDesc')}
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
                  <Check size={12} className="mr-1" /> {t('common.copied')}
                </>
              ) : (
                <>
                  <Copy size={12} className="mr-1" /> {t('common.copy')}
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRecoveryKeyDisplayOpen(false)} size="sm" className="text-sm">
              {t('settings.security.saved')}
            </Button>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t('settings.security.reauthDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t('settings.security.reauthDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="reauth-password" className="text-sm">
                {t('settings.security.masterPasswordLabel')}
              </Label>
              <PasswordInput
                id="reauth-password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                disabled={reauthLoading}
                placeholder={t('settings.security.masterPasswordLabel')}
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && reauthPassword && !reauthLoading) {
                    handleReauthConfirm()
                  }
                }}
              />
            </div>
            {reauthError && (
              <div className="text-sm text-danger bg-danger/10 px-2 py-1.5 rounded">
                {reauthError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => setReauthOpen(false)}
              disabled={reauthLoading}
              size="sm"
              className="text-sm"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleReauthConfirm}
              disabled={reauthLoading || !reauthPassword}
              size="sm"
              className="text-sm"
            >
              {reauthLoading ? t('settings.security.verifying') : t('common.confirm')}
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
            <DialogTitle className="text-sm">
              {t('settings.storage.transferDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t('settings.storage.transferDialogDesc')}
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
                      <Check size={12} className="mr-1" /> {t('common.copied')}
                    </>
                  ) : (
                    <>
                      <Copy size={12} className="mr-1" /> {t('settings.storage.copyTransferCode')}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="transfer-password" className="text-sm">
                    {t('settings.storage.transferPasswordLabel')}
                  </Label>
                  <PasswordInput
                    id="transfer-password"
                    value={transferPassword}
                    onChange={(e) => setTransferPassword(e.target.value)}
                    disabled={transferLoading}
                    placeholder={t('settings.storage.transferPasswordPlaceholder')}
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
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleGenerateTransferConfig}
                  disabled={transferLoading || !transferPassword}
                  size="sm"
                  className="text-sm"
                >
                  {transferLoading
                    ? t('settings.storage.generating')
                    : t('settings.storage.generateTransferButton')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setTransferDialogOpen(false)} size="sm" className="text-sm">
                {t('common.close')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
