import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { decryptTransferConfig, downloadVault } from '../../commands'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'

export default function StorageSetup() {
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
      setError('すべての必須フィールドを入力してください')
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
        `ストレージへのアクセスに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
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
        `転送コードの復号に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="ストレージ設定" subtitle="S3互換のクラウドストレージを設定します" />

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
              <CardTitle>別の端末から設定を転送</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-text-muted">
                設定済みの端末で生成した転送コードと転送パスワードを入力してください。
              </p>
              <div>
                <Label htmlFor="transfer-string">転送コード</Label>
                <textarea
                  id="transfer-string"
                  value={transferString}
                  onChange={(e) => setTransferString(e.target.value)}
                  placeholder="kura-config-v1$..."
                  className="w-full min-h-[100px] mt-1.5 rounded-md border border-border bg-input-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="transfer-password">転送パスワード</Label>
                <PasswordInput
                  id="transfer-password"
                  value={transferPassword}
                  onChange={(e) => setTransferPassword(e.target.value)}
                  disabled={isLoading}
                  placeholder="転送コード生成時に設定したパスワード"
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
                  キャンセル
                </Button>
                <Button
                  onClick={handleTransferImport}
                  disabled={isLoading || !transferString.trim() || !transferPassword}
                  className="flex-1"
                  isLoading={isLoading}
                >
                  設定を読み込む
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="secondary" onClick={() => setShowTransfer(true)} className="w-full">
            別の端末から設定を転送
          </Button>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* リージョン */}
              <div>
                <Label htmlFor="region">
                  リージョン <span className="text-danger">*</span>
                </Label>
                <Input
                  id="region"
                  placeholder="例: ap-northeast-1"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  AWS S3 のリージョンコードを入力してください
                </p>
              </div>

              {/* バケット */}
              <div>
                <Label htmlFor="bucket">
                  バケット <span className="text-danger">*</span>
                </Label>
                <Input
                  id="bucket"
                  placeholder="例: my-vault"
                  value={bucket}
                  onChange={(e) => {
                    setBucket(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">vaultファイルを保存するバケット名</p>
              </div>

              {/* ファイルパス */}
              <div>
                <Label htmlFor="key">
                  ファイルパス <span className="text-danger">*</span>
                </Label>
                <Input
                  id="key"
                  placeholder="vault.json"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <p className="text-xs text-text-muted mt-1.5">バケット内の保存パス</p>
              </div>

              {/* アクセスキーID */}
              <div>
                <Label htmlFor="access-key">
                  アクセスキーID <span className="text-danger">*</span>
                </Label>
                <Input
                  id="access-key"
                  placeholder="AKIA..."
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
                  シークレットアクセスキー <span className="text-danger">*</span>
                </Label>
                <PasswordInput
                  id="secret-key"
                  placeholder="••••••••••••••••"
                  value={secretAccessKey}
                  onChange={(e) => {
                    setSecretAccessKey(e.target.value)
                    setError('')
                  }}
                />
              </div>

              {/* エンドポイント */}
              <div>
                <Label htmlFor="endpoint">エンドポイント (オプション)</Label>
                <Input
                  id="endpoint"
                  placeholder="例: https://s3.example.com"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  自社ホストの S3 互換サーバーを使用する場合のみ入力
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
                  戻る
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1"
                  disabled={isLoading}
                  isLoading={isLoading}
                >
                  次へ
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
