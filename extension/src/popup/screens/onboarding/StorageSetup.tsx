import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { useOnboardingDraft } from '../../hooks/useOnboardingDraft'
import { saveToStorage } from '../../../shared/storage'
import { STORAGE_KEYS } from '../../../shared/constants'
import type { S3Config } from '../../../shared/types'

export default function StorageSetup() {
  const navigate = useNavigate()
  const { draft, setDraft, clearDraft, draftLoaded } = useOnboardingDraft()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { region, bucket, key, accessKeyId, secretAccessKey, endpoint } = draft

  const isFormValid = () => {
    return region && bucket && accessKeyId && secretAccessKey
  }

  const handleNext = async () => {
    setLoading(true)
    setError('')
    try {
      const configToSave: S3Config = {
        region,
        bucket,
        ...(key ? { key } : {}),
        ...(endpoint ? { endpoint } : {}),
        accessKeyId,
        secretAccessKey,
      }
      console.log('[StorageSetup] Saving config:', configToSave)
      await saveToStorage(STORAGE_KEYS.S3_CONFIG, configToSave)
      console.log('[StorageSetup] Config saved successfully')

      // DOWNLOAD_VAULT メッセージを送信してVault存在確認
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'DOWNLOAD_VAULT' },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(resp)
            }
          }
        )
      })

      if (!response?.success) {
        throw new Error(response?.error || 'Vault確認に失敗しました')
      }

      // clearDraftは成功後のみ実行
      await clearDraft()

      // vaultExists の結果に基づいて分岐
      if (response.vaultExists) {
        // 既存Vault使用フロー
        console.log('[StorageSetup] Vault exists, navigating to unlock-existing')
        navigate('/onb/unlock-existing', { state: { fromOnboarding: true } })
      } else {
        // 新規作成フロー
        console.log('[StorageSetup] Vault not found, navigating to password')
        navigate('/onb/password')
      }
    } catch (err) {
      console.error('[StorageSetup] Error:', err)
      setError(String(err))
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
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader
        title="ストレージ設定"
        subtitle="S3互換のクラウドストレージを設定します"
      />

      <div className="p-4 space-y-4">
        {/* エラー表示 */}
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-xs text-danger">⚠️ {error}</p>
          </div>
        )}

        {/* 接続情報入力 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs font-medium">接続情報</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            {/* リージョン */}
            <div className="space-y-1">
              <Label htmlFor="region" className="text-xs">
                リージョン <span className="text-danger">*</span>
              </Label>
              <Input
                id="region"
                type="text"
                value={region}
                onChange={(e) => setDraft({ region: e.target.value })}
                placeholder="例: ap-northeast-1"
                className="text-xs"
                disabled={loading}
              />
            </div>

            {/* バケット */}
            <div className="space-y-1">
              <Label htmlFor="bucket" className="text-xs">
                バケット <span className="text-danger">*</span>
              </Label>
              <Input
                id="bucket"
                type="text"
                value={bucket}
                onChange={(e) => setDraft({ bucket: e.target.value })}
                placeholder="例: my-vault"
                className="text-xs"
                disabled={loading}
              />
            </div>

            {/* ファイルパス */}
            <div className="space-y-1">
              <Label htmlFor="key" className="text-xs">
                ファイルパス <span className="text-text-muted">(オプション)</span>
              </Label>
              <Input
                id="key"
                type="text"
                value={key}
                onChange={(e) => setDraft({ key: e.target.value })}
                placeholder="vault.json"
                className="text-xs"
                disabled={loading}
              />
              <p className="text-xs text-text-muted mt-1">
                バケット内の保存パス。デフォルト: vault.json
              </p>
            </div>

            {/* アクセスキーID */}
            <div className="space-y-1">
              <Label htmlFor="access-key" className="text-xs">
                アクセスキーID <span className="text-danger">*</span>
              </Label>
              <Input
                id="access-key"
                type="text"
                value={accessKeyId}
                onChange={(e) => setDraft({ accessKeyId: e.target.value })}
                placeholder="AKIA..."
                className="text-xs"
                disabled={loading}
              />
            </div>

            {/* シークレットアクセスキー */}
            <div className="space-y-1">
              <Label htmlFor="secret-key" className="text-xs">
                シークレットアクセスキー <span className="text-danger">*</span>
              </Label>
              <Input
                id="secret-key"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setDraft({ secretAccessKey: e.target.value })}
                className="text-xs"
                disabled={loading}
              />
            </div>

            {/* エンドポイント */}
            <div className="space-y-1">
              <Label htmlFor="endpoint" className="text-xs">
                エンドポイント <span className="text-text-muted">(オプション)</span>
              </Label>
              <Input
                id="endpoint"
                type="text"
                value={endpoint}
                onChange={(e) => setDraft({ endpoint: e.target.value })}
                placeholder="例: https://s3.example.com"
                className="text-xs"
                disabled={loading}
              />
              <p className="text-xs text-text-muted mt-1">
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
