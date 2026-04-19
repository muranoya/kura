import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { decryptTransferConfig, downloadVault } from '../../commands'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'

export default function StorageSetup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [region, setRegion] = useState('')
  const [bucket, setBucket] = useState('')
  const [key, setKey] = useState('vault.json')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferString, setTransferString] = useState('')
  const [transferPassword, setTransferPassword] = useState('')

  useEffect(() => {
    const pendingJson = sessionStorage.getItem('pendingS3Config')
    if (pendingJson) {
      const config = JSON.parse(pendingJson)
      setRegion(config.region ?? '')
      setBucket(config.bucket ?? '')
      setKey(config.key ?? 'vault.json')
      setAccessKeyId(config.accessKeyId ?? '')
      setSecretAccessKey(config.secretAccessKey ?? '')
      setEndpoint(config.endpoint ?? '')
    }
  }, [])

  const handleNext = async () => {
    if (!region || !bucket || !key || !accessKeyId || !secretAccessKey) {
      setError(t('onboarding.storageSetup.errorRequired'))
      return
    }

    const config: Record<string, string> = {
      region,
      bucket,
      key,
      accessKeyId,
      secretAccessKey,
    }

    // Only add endpoint if provided
    if (endpoint) {
      config.endpoint = endpoint
    }

    // S3設定はマスターパスワードで暗号化して保存するため、ここでは一時保存のみ
    sessionStorage.setItem('pendingS3Config', JSON.stringify(config))

    // Check if vault file exists on S3
    setIsLoading(true)
    try {
      const vaultExists = await downloadVault(JSON.stringify(config))
      if (vaultExists) {
        navigate('/onb/unlock-existing')
      } else {
        navigate('/onb/password')
      }
    } catch (err) {
      setError(
        t('onboarding.storageSetup.errorAccess', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      setIsLoading(false)
    }
  }

  const handleTransferImport = async () => {
    if (!transferString.trim() || !transferPassword) return
    setIsLoading(true)
    setError('')
    try {
      const configJson = await decryptTransferConfig(transferPassword, transferString.trim())
      const config = JSON.parse(configJson)
      setRegion(config.region ?? '')
      setBucket(config.bucket ?? '')
      setKey(config.key ?? 'vault.json')
      setAccessKeyId(config.accessKeyId ?? '')
      setSecretAccessKey(config.secretAccessKey ?? '')
      setEndpoint(config.endpoint ?? '')
      setShowTransfer(false)
      setTransferString('')
      setTransferPassword('')
    } catch (err) {
      setError(
        t('onboarding.storageSetup.errorTransfer', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader
        title={t('onboarding.storageSetup.title')}
        subtitle={t('onboarding.storageSetup.subtitle')}
      />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* エラーメッセージ */}
        {error && (
          <div className="p-4 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* 転送インポート */}
        {showTransfer ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('onboarding.storageSetup.transferTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-text-muted">
                {t('onboarding.storageSetup.transferDescription')}
              </p>
              <div>
                <Label htmlFor="transfer-string">
                  {t('onboarding.storageSetup.transferStringLabel')}
                </Label>
                <textarea
                  id="transfer-string"
                  value={transferString}
                  onChange={(e) => setTransferString(e.target.value)}
                  placeholder={t('onboarding.storageSetup.transferStringPlaceholder')}
                  className="w-full min-h-[100px] mt-1.5 rounded-md border border-border bg-input-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="transfer-password">
                  {t('onboarding.storageSetup.transferPasswordLabel')}
                </Label>
                <PasswordInput
                  id="transfer-password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  disabled={isLoading}
                  placeholder={t('onboarding.storageSetup.transferPasswordPlaceholder')}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowTransfer(false)
                    setError('')
                  }}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleTransferImport}
                  disabled={isLoading || !transferString.trim() || !transferPassword}
                  className="flex-1"
                  isLoading={isLoading}
                >
                  {t('onboarding.storageSetup.transferLoad')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="secondary" onClick={() => setShowTransfer(true)} className="w-full">
            {t('onboarding.storageSetup.transferShow')}
          </Button>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* リージョン */}
              <div>
                <Label htmlFor="region">
                  {t('onboarding.storageSetup.regionLabel')} <span className="text-danger">*</span>
                </Label>
                <Input
                  id="region"
                  placeholder={t('onboarding.storageSetup.regionPlaceholder')}
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  {t('onboarding.storageSetup.regionHelp')}
                </p>
              </div>

              {/* バケット */}
              <div>
                <Label htmlFor="bucket">
                  {t('onboarding.storageSetup.bucketLabel')} <span className="text-danger">*</span>
                </Label>
                <Input
                  id="bucket"
                  placeholder={t('onboarding.storageSetup.bucketPlaceholder')}
                  value={bucket}
                  onChange={(e) => {
                    setBucket(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  {t('onboarding.storageSetup.bucketHelp')}
                </p>
              </div>

              {/* ファイルパス */}
              <div>
                <Label htmlFor="key">
                  {t('onboarding.storageSetup.keyLabel')} <span className="text-danger">*</span>
                </Label>
                <Input
                  id="key"
                  placeholder={t('onboarding.storageSetup.keyPlaceholder')}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  {t('onboarding.storageSetup.keyHelp')}
                </p>
              </div>

              {/* アクセスキーID */}
              <div>
                <Label htmlFor="access-key">
                  {t('onboarding.storageSetup.accessKeyLabel')}{' '}
                  <span className="text-danger">*</span>
                </Label>
                <Input
                  id="access-key"
                  placeholder={t('onboarding.storageSetup.accessKeyPlaceholder')}
                  value={accessKeyId}
                  onChange={(e) => {
                    setAccessKeyId(e.target.value)
                    setError('')
                  }}
                />
              </div>

              {/* シークレットアクセスキー */}
              <div>
                <Label htmlFor="secret-key">
                  {t('onboarding.storageSetup.secretKeyLabel')}{' '}
                  <span className="text-danger">*</span>
                </Label>
                <PasswordInput
                  id="secret-key"
                  placeholder={t('onboarding.storageSetup.secretKeyPlaceholder')}
                  value={secretAccessKey}
                  onChange={(e) => {
                    setSecretAccessKey(e.target.value)
                    setError('')
                  }}
                />
              </div>

              {/* エンドポイント */}
              <div>
                <Label htmlFor="endpoint">{t('onboarding.storageSetup.endpointLabel')}</Label>
                <Input
                  id="endpoint"
                  placeholder={t('onboarding.storageSetup.endpointPlaceholder')}
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  {t('onboarding.storageSetup.endpointHelp')}
                </p>
              </div>

              {/* ボタン */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/')}
                  className="flex-1"
                  disabled={isLoading}
                >
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1"
                  disabled={isLoading}
                  isLoading={isLoading}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
