import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadVault } from '../../commands'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { getFromStorage, saveToStorage } from '../../shared/storage'

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

  useEffect(() => {
    getFromStorage<Record<string, string>>('s3Config').then((config) => {
      if (config) {
        setRegion(config.region ?? '')
        setBucket(config.bucket ?? '')
        setKey(config.key ?? 'vault.json')
        setAccessKeyId(config.accessKeyId ?? '')
        setSecretAccessKey(config.secretAccessKey ?? '')
        setEndpoint(config.endpoint ?? '')
      }
    })
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

    await saveToStorage('s3Config', config)

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

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="ストレージ設定" subtitle="S3互換のクラウドストレージを設定します" />

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
                <Input
                  id="secret-key"
                  type="password"
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
