import { useState } from 'react'
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
      // S3設定はマスターパスワードで暗号化して保存するため、ここでは永続保存しない
      // DOWNLOAD_VAULTにS3設定を渡してVault存在確認
      const response = await sendMessage({ type: 'DOWNLOAD_VAULT' as const, s3Config })

      if (!response.success) {
        const errorMsg = 'error' in response ? response.error : 'Vault確認に失敗しました'
        throw new Error(errorMsg)
      }

      // vaultExists の結果に基づいて分岐
      if ('vaultExists' in response && response.vaultExists) {
        // 既存Vault使用フロー
        navigate('/onb/unlock-existing', { state: { fromOnboarding: true } })
      } else {
        // 新規作成フロー
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
        const errorMsg = 'error' in response ? response.error : '転送コードの復号に失敗しました'
        throw new Error(errorMsg)
      }
      if (!('configJson' in response) || !response.configJson) {
        throw new Error('復号結果が空です')
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
      <PageHeader title="ストレージ設定" subtitle="S3互換のクラウドストレージを設定します" />

      <div className="p-4 space-y-4">
        {/* エラー表示 */}
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* 転送インポート */}
        {showTransfer ? (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">別の端末から設定を転送</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-3">
              <p className="text-sm text-text-muted">
                設定済みの端末で生成した転送コードと転送パスワードを入力してください。
              </p>
              <div className="space-y-1">
                <Label htmlFor="transfer-string" className="text-sm">
                  転送コード
                </Label>
                <textarea
                  id="transfer-string"
                  value={transferString}
                  onChange={(e) => setTransferString(e.target.value)}
                  placeholder="kura-config-v1$..."
                  className="w-full min-h-[80px] rounded-md border border-border bg-input-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transfer-password" className="text-sm">
                  転送パスワード
                </Label>
                <PasswordInput
                  id="transfer-password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  placeholder="転送コード生成時に設定したパスワード"
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
                  キャンセル
                </Button>
                <Button
                  onClick={handleTransferImport}
                  disabled={loading || !transferString.trim() || !transferPassword}
                  className="flex-1 text-sm"
                  size="sm"
                >
                  {loading ? '復号中...' : '設定を読み込む'}
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
            別の端末から設定を転送
          </Button>
        )}

        {/* 接続情報入力 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">接続情報</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            {/* リージョン */}
            <div className="space-y-1">
              <Label htmlFor="region" className="text-sm">
                リージョン <span className="text-danger">*</span>
              </Label>
              <Input
                id="region"
                type="text"
                value={region}
                onChange={(e) => setDraft({ region: e.target.value })}
                placeholder="例: ap-northeast-1"
                className="text-sm"
                disabled={loading}
              />
            </div>

            {/* バケット */}
            <div className="space-y-1">
              <Label htmlFor="bucket" className="text-sm">
                バケット <span className="text-danger">*</span>
              </Label>
              <Input
                id="bucket"
                type="text"
                value={bucket}
                onChange={(e) => setDraft({ bucket: e.target.value })}
                placeholder="例: my-vault"
                className="text-sm"
                disabled={loading}
              />
            </div>

            {/* ファイルパス */}
            <div className="space-y-1">
              <Label htmlFor="key" className="text-sm">
                ファイルパス <span className="text-danger">*</span>
              </Label>
              <Input
                id="key"
                type="text"
                value={key}
                onChange={(e) => setDraft({ key: e.target.value })}
                placeholder="vault.json"
                className="text-sm"
                disabled={loading}
              />
              <p className="text-sm text-text-muted mt-1">バケット内の保存パス</p>
            </div>

            {/* アクセスキーID */}
            <div className="space-y-1">
              <Label htmlFor="access-key" className="text-sm">
                アクセスキーID <span className="text-danger">*</span>
              </Label>
              <Input
                id="access-key"
                type="text"
                value={accessKeyId}
                onChange={(e) => setDraft({ accessKeyId: e.target.value })}
                placeholder="AKIA..."
                className="text-sm"
                disabled={loading}
              />
            </div>

            {/* シークレットアクセスキー */}
            <div className="space-y-1">
              <Label htmlFor="secret-key" className="text-sm">
                シークレットアクセスキー <span className="text-danger">*</span>
              </Label>
              <PasswordInput
                id="secret-key"
                value={secretAccessKey}
                onChange={(e) => setDraft({ secretAccessKey: e.target.value })}
                className="text-sm"
                disabled={loading}
              />
            </div>

            {/* エンドポイント */}
            <div className="space-y-1">
              <Label htmlFor="endpoint" className="text-sm">
                エンドポイント <span className="text-text-muted">(オプション)</span>
              </Label>
              <Input
                id="endpoint"
                type="text"
                value={endpoint}
                onChange={(e) => setDraft({ endpoint: e.target.value })}
                placeholder="例: https://s3.example.com"
                className="text-sm"
                disabled={loading}
              />
              <p className="text-sm text-text-muted mt-1">
                自社ホストの S3 互換サーバーを使用する場合のみ入力
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ボタン */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={loading}
            className="flex-1 text-sm"
            size="sm"
          >
            戻る
          </Button>
          <Button
            onClick={handleNext}
            disabled={loading || !isFormValid()}
            className="flex-1 text-sm"
            size="sm"
          >
            {loading ? 'Vaultを確認中...' : '次へ'}
          </Button>
        </div>
      </div>
    </div>
  )
}
