import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { S3Config } from '../../../shared/types'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { useOnboardingDraft } from '../../hooks/useOnboardingDraft'

export default function MasterPassword() {
  const navigate = useNavigate()
  const { draft } = useOnboardingDraft()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (password !== confirmPassword) {
      alert('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      // オンボーディングドラフトからS3設定を構築
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
        // Service Worker 再起動対策: 作成直後に UNLOCK を送ってメモリにロードさせる
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage({ type: 'UNLOCK', password: password }, () => {
            resolve()
          })
        })

        navigate('/onb/recovery', {
          state: { recoveryKey: response.recoveryKey, fromOnboarding: true },
        })
      } else {
        const errorMsg = response?.error || 'Vault作成に失敗しました'
        alert(errorMsg)
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setLoading(false)
    }
  }

  const passwordsMatch = confirmPassword && password === confirmPassword

  return (
    <div className="h-full overflow-y-auto pb-4 flex flex-col">
      <PageHeader title="マスターパスワード設定" showBackButton={true} />

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">パスワード設定</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            {/* パスワード入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">
                マスターパスワード
              </Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="強力なパスワードを設定してください"
                className="text-sm"
              />
            </div>

            {/* パスワード確認入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-sm">
                パスワード確認
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="パスワードを再入力してください"
                className="text-sm"
              />

              {/* マッチング状態 */}
              {confirmPassword && (
                <div
                  className={`flex items-center gap-1 text-sm ${
                    passwordsMatch ? 'text-success' : 'text-danger'
                  }`}
                >
                  {passwordsMatch ? (
                    <>
                      <Check size={14} /> 一致しています
                    </>
                  ) : (
                    <>
                      <X size={14} /> 一致していません
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* アクションボタン */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/onb/storage')}
            disabled={loading}
            className="flex-1 text-sm"
            size="sm"
          >
            戻る
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || password !== confirmPassword || !password}
            className="flex-1 text-sm"
            size="sm"
          >
            {loading ? '作成中...' : '作成'}
          </Button>
        </div>
      </div>
    </div>
  )
}
