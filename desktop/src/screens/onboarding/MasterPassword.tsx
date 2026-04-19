import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { STORAGE_KEYS } from '../../shared/constants'
import { saveToStorage } from '../../shared/storage'

export default function MasterPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!password || !confirmPassword) {
      setError(t('onboarding.masterPassword.errorRequired'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('onboarding.masterPassword.errorMismatch'))
      return
    }

    if (password.length < 8) {
      setError(t('onboarding.masterPassword.errorMinLength'))
      return
    }

    setLoading(true)
    try {
      const recoveryKey = await commands.createVault(password)
      // S3設定をマスターパスワードで暗号化して永続保存
      const pendingConfig = sessionStorage.getItem('pendingS3Config')
      if (pendingConfig) {
        const encrypted = await commands.encryptConfig(password, pendingConfig)
        await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
        sessionStorage.removeItem('pendingS3Config')
        // 復号済みS3設定をRustプロセスメモリに保持（同期で使用）
        await commands.setS3ConfigSession(pendingConfig)
      }
      navigate('/onb/recovery', { state: { recoveryKey } })
    } catch (err) {
      setError(t('onboarding.masterPassword.errorGeneric', { error: String(err) }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader
        title={t('onboarding.masterPassword.title')}
        subtitle={t('onboarding.masterPassword.subtitle')}
      />

      <div className="max-w-2xl mx-auto p-6">
        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* パスワード */}
              <div>
                <Label htmlFor="password">
                  {t('onboarding.masterPassword.passwordLabel')}{' '}
                  <span className="text-danger">*</span>
                </Label>
                <PasswordInput
                  id="password"
                  placeholder={t('onboarding.masterPassword.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  {t('onboarding.masterPassword.passwordHelp')}
                </p>
              </div>

              {/* パスワード確認 */}
              <div>
                <Label htmlFor="confirm-password">
                  {t('onboarding.masterPassword.confirmLabel')}{' '}
                  <span className="text-danger">*</span>
                </Label>
                <PasswordInput
                  id="confirm-password"
                  placeholder={t('onboarding.masterPassword.confirmPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setError('')
                  }}
                />
                {confirmPassword && password === confirmPassword && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <p className="text-xs text-success">{t('onboarding.masterPassword.matchOk')}</p>
                  </div>
                )}
              </div>

              {/* ボタン */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/onb/storage')}
                  className="flex-1"
                  disabled={loading}
                >
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={loading || !password || !confirmPassword}
                  className="flex-1"
                >
                  {loading ? t('common.creating') : t('onboarding.masterPassword.createVault')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
