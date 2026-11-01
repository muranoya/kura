import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { PasswordInput } from './ui/password-input'

export function RecoveryForm({
  onBack,
  onRecover,
}: {
  onBack: () => void
  onRecover: (recoveryKey: string, newPassword: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRecover = async () => {
    if (!recoveryKey || !newPassword || !confirmPassword) {
      setError(t('settings.security.passwordRequiredAll'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.recovery.passwordMismatch'))
      return
    }

    setLoading(true)
    setError('')
    try {
      await onRecover(recoveryKey, newPassword)
      setRecoveryKey('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(`${t('auth.recovery.submitting')}: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-bg-base px-4">
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-accent hover:text-accent-hover mb-6 text-sm"
        >
          <ArrowLeft size={14} />
          {t('common.back')}
        </button>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary mb-1">{t('auth.recovery.title')}</h1>
          <p className="text-sm text-text-secondary">{t('auth.recovery.subtitle')}</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="recovery-key" className="text-sm">
                {t('auth.recovery.recoveryKeyLabel')}
              </Label>
              <Input
                id="recovery-key"
                type="text"
                placeholder="XXXX-XXXX-XXXX-..."
                value={recoveryKey}
                onChange={(e) => {
                  setRecoveryKey(e.target.value)
                  setError('')
                }}
                disabled={loading}
                className="text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-sm">
                {t('auth.recovery.newPasswordLabel')}
              </Label>
              <PasswordInput
                id="new-password"
                placeholder={t('auth.recovery.newPasswordLabel')}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setError('')
                }}
                disabled={loading}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-sm">
                {t('auth.recovery.confirmPasswordLabel')}
              </Label>
              <PasswordInput
                id="confirm-password"
                placeholder={t('auth.recovery.confirmPasswordLabel')}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleRecover()}
                disabled={loading}
                className="text-sm"
              />
            </div>

            <Button
              onClick={handleRecover}
              disabled={loading || !recoveryKey || !newPassword || !confirmPassword}
              className="w-full text-sm mt-2"
            >
              {loading ? t('auth.recovery.submitting') : t('auth.recovery.submitButton')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
