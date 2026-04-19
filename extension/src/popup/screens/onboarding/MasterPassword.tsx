import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { S3Config } from '../../../shared/types'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { useOnboardingDraft } from '../../hooks/useOnboardingDraft'

export default function MasterPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { draft } = useOnboardingDraft()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (password !== confirmPassword) {
      setError(t('onboarding.masterPassword.passwordMismatch'))
      return
    }

    setError('')
    setLoading(true)
    try {
      const s3Config: S3Config = {
        region: draft.region,
        bucket: draft.bucket,
        key: draft.key,
        accessKeyId: draft.accessKeyId,
        secretAccessKey: draft.secretAccessKey,
        ...(draft.endpoint ? { endpoint: draft.endpoint } : {}),
      }

      const response = await new Promise<{
        success?: boolean
        recoveryKey?: string
        error?: string
      }>((resolve, _reject) => {
        chrome.runtime.sendMessage(
          { type: 'CREATE_VAULT', masterPassword: password, s3Config },
          (response) => {
            resolve(response)
          },
        )
      })

      if (response?.success) {
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage({ type: 'UNLOCK', password: password }, () => {
            resolve()
          })
        })

        navigate('/onb/recovery', {
          state: { recoveryKey: response.recoveryKey, fromOnboarding: true },
        })
      } else {
        setError(response?.error || t('onboarding.masterPassword.vaultCreateFailed'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const passwordsMatch = confirmPassword && password === confirmPassword

  return (
    <div className="h-full overflow-y-auto pb-4 flex flex-col">
      <PageHeader title={t('onboarding.masterPassword.title')} showBackButton={true} />

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-2.5 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">
              {t('onboarding.masterPassword.cardTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">
                {t('onboarding.masterPassword.passwordLabel')}
              </Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('onboarding.masterPassword.passwordPlaceholder')}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-sm">
                {t('onboarding.masterPassword.confirmLabel')}
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('onboarding.masterPassword.confirmPlaceholder')}
                className="text-sm"
              />

              {confirmPassword && (
                <div
                  className={`flex items-center gap-1 text-sm ${
                    passwordsMatch ? 'text-success' : 'text-danger'
                  }`}
                >
                  {passwordsMatch ? (
                    <>
                      <Check size={14} /> {t('onboarding.masterPassword.passwordsMatch')}
                    </>
                  ) : (
                    <>
                      <X size={14} /> {t('onboarding.masterPassword.passwordsMismatch')}
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/onb/storage')}
            disabled={loading}
            className="flex-1 text-sm"
            size="sm"
          >
            {t('common.back')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || password !== confirmPassword || !password}
            className="flex-1 text-sm"
            size="sm"
          >
            {loading
              ? t('onboarding.masterPassword.creating')
              : t('onboarding.masterPassword.createButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
