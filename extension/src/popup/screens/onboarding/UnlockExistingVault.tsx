import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { STORAGE_KEYS } from '../../../shared/constants'
import { removeFromStorage } from '../../../shared/storage'
import type { S3Config } from '../../../shared/types'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { useOnboardingDraft } from '../../hooks/useOnboardingDraft'

export default function UnlockExistingVault() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { draft } = useOnboardingDraft()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBack = async () => {
    await removeFromStorage(STORAGE_KEYS.VAULT_BYTES)
    navigate('/onb/storage')
  }

  const handleUnlock = async () => {
    if (!password) {
      setError(t('onboarding.unlockExisting.passwordRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const s3Config: S3Config = {
        region: draft.region,
        bucket: draft.bucket,
        key: draft.key,
        accessKeyId: draft.accessKeyId,
        secretAccessKey: draft.secretAccessKey,
        ...(draft.endpoint ? { endpoint: draft.endpoint } : {}),
      }

      const response = await new Promise<{ success?: boolean; error?: string }>(
        (resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'UNLOCK_EXISTING', password, s3Config }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(resp)
            }
          })
        },
      )

      if (!response?.success) {
        throw new Error(response?.error || t('onboarding.unlockExisting.unlockFailed'))
      }

      await removeFromStorage(STORAGE_KEYS.ONBOARDING_DRAFT)
      navigate('/entries')
    } catch (err) {
      setError(String(err) || t('onboarding.unlockExisting.invalidPassword'))
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader
        title={t('onboarding.unlockExisting.title')}
        subtitle={t('onboarding.unlockExisting.subtitle')}
      />

      <div className="p-4 flex flex-col items-center justify-center flex-1">
        <Card className="w-full">
          <CardContent className="pt-6 flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-accent" />
            </div>

            <p className="text-sm text-center text-text-secondary">
              {t('onboarding.unlockExisting.cardDescription')}
            </p>

            {error && (
              <div className="w-full p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">⚠️ {error}</p>
              </div>
            )}

            <form
              className="w-full space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleUnlock()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">
                  {t('onboarding.unlockExisting.passwordLabel')}
                </Label>
                <PasswordInput
                  id="password"
                  placeholder={t('onboarding.unlockExisting.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="text-sm"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1"
                  size="sm"
                >
                  {t('common.back')}
                </Button>
                <Button type="submit" disabled={loading || !password} className="flex-1" size="sm">
                  {loading
                    ? t('onboarding.unlockExisting.unlocking')
                    : t('onboarding.unlockExisting.unlockButton')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
