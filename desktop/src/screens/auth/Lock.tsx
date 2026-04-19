import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { Separator } from '../../components/ui/separator'
import { STORAGE_KEYS } from '../../shared/constants'
import { clearStorage, getFromStorage } from '../../shared/storage'

interface LockScreenProps {
  onUnlocked?: () => void
}

export default function LockScreen({ onUnlocked }: LockScreenProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setError(t('auth.lock.errorRequired'))
      return
    }

    setLoading(true)
    try {
      await commands.unlock(password)
      // 暗号化されたS3設定を復号してRustプロセスメモリに保持
      const encryptedConfig = await getFromStorage<string>(STORAGE_KEYS.S3_CONFIG)
      if (encryptedConfig) {
        const configJson = await commands.decryptConfig(password, encryptedConfig)
        await commands.setS3ConfigSession(configJson)
      }
      commands.syncVaultIfConfigured().catch(() => {}) // バックグラウンド
      onUnlocked?.()
    } catch (err) {
      setError(t('auth.lock.errorUnlock', { error: String(err) }))
      setLoading(false)
    }
  }, [password, onUnlocked, t])

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
      setError(t('auth.lock.errorLogout', { error: String(err) }))
      setShowLogoutDialog(false)
    }
  }, [t])

  return (
    <div className="flex items-center justify-center h-screen bg-bg-base px-4">
      <div className="w-full max-w-md">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">{t('app.name')}</h1>
          <p className="text-text-secondary">{t('auth.lock.subtitle')}</p>
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
              <Label htmlFor="password">{t('auth.lock.masterPasswordLabel')}</Label>
              <PasswordInput
                id="password"
                placeholder={t('auth.lock.passwordPlaceholder')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              />
            </div>

            {/* ロック解除ボタン */}
            <Button onClick={handleUnlock} disabled={loading} className="w-full mb-2">
              {loading ? t('auth.lock.unlocking') : t('auth.lock.unlock')}
            </Button>

            {/* リカバリーキーボタン */}
            <Button
              variant="secondary"
              onClick={() => navigate('/auth/recovery')}
              className="w-full"
            >
              {t('auth.lock.recoveryAction')}
            </Button>
          </CardContent>
        </Card>

        {/* ログアウトセクション */}
        <div className="mt-8">
          <Separator className="mb-6" />
          <Button variant="destructive" onClick={handleLogout} className="w-full">
            {t('auth.lock.logout')}
          </Button>
        </div>

        <ConfirmDialog
          open={showLogoutDialog}
          title={t('auth.lock.logoutDialog.title')}
          description={t('auth.lock.logoutDialog.description')}
          confirmText={t('auth.lock.logoutDialog.confirm')}
          isDangerous={true}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowLogoutDialog(false)}
        />
      </div>
    </div>
  )
}
