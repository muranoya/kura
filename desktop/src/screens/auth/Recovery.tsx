import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'

interface RecoveryProps {
  onUnlocked?: () => void
}

export default function Recovery({ onUnlocked }: RecoveryProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRecover = async () => {
    if (!recoveryKey || !newPassword || !confirmPassword) {
      setError(t('auth.recovery.errorRequired'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.recovery.errorMismatch'))
      return
    }

    setLoading(true)
    try {
      await commands.unlockWithRecoveryKey(recoveryKey)
      onUnlocked?.()
    } catch (err) {
      setError(t('auth.recovery.errorRecover', { error: String(err) }))
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-bg-base px-4">
      <div className="w-full max-w-md">
        {/* ヘッダー */}
        <button
          type="button"
          onClick={() => navigate('/auth/lock')}
          className="flex items-center gap-2 text-accent hover:text-accent-hover mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">{t('auth.recovery.back')}</span>
        </button>

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.recovery.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* エラーメッセージ */}
            {error && (
              <div className="mb-4 p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* リカバリーキー */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="recovery-key">{t('auth.recovery.recoveryKeyLabel')}</Label>
              <Input
                id="recovery-key"
                type="text"
                placeholder={t('auth.recovery.recoveryKeyPlaceholder')}
                value={recoveryKey}
                onChange={(e) => {
                  setRecoveryKey(e.target.value)
                  setError('')
                }}
              />
            </div>

            {/* 新しいパスワード */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="new-password">{t('auth.recovery.newPasswordLabel')}</Label>
              <PasswordInput
                id="new-password"
                placeholder={t('auth.recovery.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setError('')
                }}
              />
            </div>

            {/* パスワード確認 */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="confirm-password">{t('auth.recovery.confirmLabel')}</Label>
              <PasswordInput
                id="confirm-password"
                placeholder={t('auth.recovery.confirmPlaceholder')}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
              />
            </div>

            {/* 復旧ボタン */}
            <Button onClick={handleRecover} disabled={loading} className="w-full">
              {loading ? t('auth.recovery.recovering') : t('auth.recovery.recover')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
