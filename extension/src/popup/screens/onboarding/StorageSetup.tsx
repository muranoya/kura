import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { sendMessage } from '../../../shared/messages'
import type { S3Config } from '../../../shared/types'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { useOnboardingDraft } from '../../hooks/useOnboardingDraft'

export default function StorageSetup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { draft, setDraft, draftLoaded } = useOnboardingDraft()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferString, setTransferString] = useState('')
  const [transferPassword, setTransferPassword] = useState('')

  const { region, bucket, key, accessKeyId, secretAccessKey, endpoint } = draft

  const isFormValid = () => {
    return region && bucket && key && accessKeyId && secretAccessKey
  }

  const handleNext = async () => {
    setLoading(true)
    setError('')
    try {
      const s3Config: S3Config = {
        region,
        bucket,
        key,
        ...(endpoint ? { endpoint } : {}),
        accessKeyId,
        secretAccessKey,
      }
      const response = await sendMessage({ type: 'DOWNLOAD_VAULT' as const, s3Config })

      if (!response.success) {
        const errorMsg =
          'error' in response ? response.error : t('onboarding.storage.vaultCheckFailed')
        throw new Error(errorMsg)
      }

      if ('vaultExists' in response && response.vaultExists) {
        navigate('/onb/unlock-existing', { state: { fromOnboarding: true } })
      } else {
        navigate('/onb/password')
      }
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  const handleTransferImport = async () => {
    if (!transferString.trim() || !transferPassword) return
    setLoading(true)
    setError('')
    try {
      const response = await sendMessage({
        type: 'DECRYPT_TRANSFER_CONFIG',
        password: transferPassword,
        transferString: transferString.trim(),
      })
      if (!response.success) {
        const errorMsg =
          'error' in response ? response.error : t('onboarding.storage.transferDecryptFailed')
        throw new Error(errorMsg)
      }
      if (!('configJson' in response) || !response.configJson) {
        throw new Error(t('onboarding.storage.decryptResultEmpty'))
      }
      const config: S3Config = JSON.parse(response.configJson)
      setDraft({
        region: config.region || '',
        bucket: config.bucket || '',
        key: config.key || 'vault.json',
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || '',
        endpoint: config.endpoint || '',
      })
      setShowTransfer(false)
      setTransferString('')
      setTransferPassword('')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate(-1)
  }

  if (!draftLoaded) {
    return null
  }

  return (
    <div className="h-full overflow-y-auto pb-4 flex flex-col">
      <PageHeader
        title={t('onboarding.storage.title')}
        subtitle={t('onboarding.storage.subtitle')}
      />

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {showTransfer ? (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">
                {t('onboarding.storage.transferSectionTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-3">
              <p className="text-sm text-text-muted">
                {t('onboarding.storage.transferSectionDesc')}
              </p>
              <div className="space-y-1">
                <Label htmlFor="transfer-string" className="text-sm">
                  {t('onboarding.storage.transferStringLabel')}
                </Label>
                <textarea
                  id="transfer-string"
                  value={transferString}
                  onChange={(e) => setTransferString(e.target.value)}
                  placeholder={t('onboarding.storage.transferStringPlaceholder')}
                  className="w-full min-h-[80px] rounded-md border border-border bg-input-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transfer-password" className="text-sm">
                  {t('onboarding.storage.transferPasswordLabel')}
                </Label>
                <PasswordInput
                  id="transfer-password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  placeholder={t('onboarding.storage.transferPasswordPlaceholder')}
                  className="text-sm"
                  disabled={loading}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowTransfer(false)
                    setError('')
                  }}
                  disabled={loading}
                  className="flex-1 text-sm"
                  size="sm"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleTransferImport}
                  disabled={loading || !transferString.trim() || !transferPassword}
                  className="flex-1 text-sm"
                  size="sm"
                >
                  {loading
                    ? t('onboarding.storage.decrypting')
                    : t('onboarding.storage.loadConfigButton')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setShowTransfer(true)}
            className="w-full text-sm"
            size="sm"
          >
            {t('onboarding.storage.transferModeButton')}
          </Button>
        )}

        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">
              {t('onboarding.storage.connectionTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="region" className="text-sm">
                {t('onboarding.storage.regionLabel')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="region"
                type="text"
                value={region}
                onChange={(e) => setDraft({ region: e.target.value })}
                placeholder={t('onboarding.storage.regionPlaceholder')}
                className="text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="bucket" className="text-sm">
                {t('onboarding.storage.bucketLabel')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="bucket"
                type="text"
                value={bucket}
                onChange={(e) => setDraft({ bucket: e.target.value })}
                placeholder={t('onboarding.storage.bucketPlaceholder')}
                className="text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="key" className="text-sm">
                {t('onboarding.storage.keyLabel')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="key"
                type="text"
                value={key}
                onChange={(e) => setDraft({ key: e.target.value })}
                placeholder={t('onboarding.storage.keyPlaceholder')}
                className="text-sm"
                disabled={loading}
              />
              <p className="text-sm text-text-muted mt-1">{t('onboarding.storage.keyDesc')}</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="access-key" className="text-sm">
                {t('onboarding.storage.accessKeyIdLabel')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="access-key"
                type="text"
                value={accessKeyId}
                onChange={(e) => setDraft({ accessKeyId: e.target.value })}
                placeholder={t('onboarding.storage.accessKeyIdPlaceholder')}
                className="text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="secret-key" className="text-sm">
                {t('onboarding.storage.secretAccessKeyLabel')}{' '}
                <span className="text-danger">*</span>
              </Label>
              <PasswordInput
                id="secret-key"
                value={secretAccessKey}
                onChange={(e) => setDraft({ secretAccessKey: e.target.value })}
                className="text-sm"
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="endpoint" className="text-sm">
                {t('onboarding.storage.endpointLabel')}{' '}
                <span className="text-text-muted">({t('common.optional')})</span>
              </Label>
              <Input
                id="endpoint"
                type="text"
                value={endpoint}
                onChange={(e) => setDraft({ endpoint: e.target.value })}
                placeholder={t('onboarding.storage.endpointPlaceholder')}
                className="text-sm"
                disabled={loading}
              />
              <p className="text-sm text-text-muted mt-1">{t('onboarding.storage.endpointDesc')}</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={loading}
            className="flex-1 text-sm"
            size="sm"
          >
            {t('common.back')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={loading || !isFormValid()}
            className="flex-1 text-sm"
            size="sm"
          >
            {loading ? t('onboarding.storage.checkingVault') : t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
