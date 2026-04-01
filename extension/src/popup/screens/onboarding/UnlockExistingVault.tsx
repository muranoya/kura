import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { STORAGE_KEYS } from '../../../shared/constants'
import { removeFromStorage } from '../../../shared/storage'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

export default function UnlockExistingVault() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBack = async () => {
    // vaultBytesをクリアして、App.tsxがonboarding状態を維持できるようにする
    await removeFromStorage(STORAGE_KEYS.VAULT_BYTES)
    navigate('/onb/storage')
  }

  const handleUnlock = async () => {
    if (!password) {
      setError('パスワードを入力してください')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await new Promise<{ success?: boolean; error?: string }>(
        (resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'UNLOCK', password }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(resp)
            }
          })
        },
      )

      if (!response?.success) {
        throw new Error(response?.error || 'アンロックに失敗しました')
      }

      await removeFromStorage(STORAGE_KEYS.ONBOARDING_DRAFT)
      navigate('/entries')
    } catch (err) {
      setError(String(err) || '不正なパスワード')
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader
        title="既存のVaultを使用"
        subtitle="このストレージには既にVaultが存在しています"
      />

      <div className="p-4 flex flex-col items-center justify-center flex-1">
        <Card className="w-full">
          <CardContent className="pt-6 flex flex-col items-center space-y-4">
            {/* ロックアイコン */}
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-accent" />
            </div>

            {/* 説明文 */}
            <p className="text-sm text-center text-text-secondary">
              このVaultを使用するためには、マスターパスワードを入力してください。
            </p>

            {/* エラーメッセージ */}
            {error && (
              <div className="w-full p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">⚠️ {error}</p>
              </div>
            )}

            {/* パスワード入力フォーム */}
            <form
              className="w-full space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleUnlock()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">
                  マスターパスワード
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="マスターパスワードを入力"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="text-sm"
                  autoFocus
                />
              </div>

              {/* ボタン */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1"
                  size="sm"
                >
                  戻る
                </Button>
                <Button type="submit" disabled={loading || !password} className="flex-1" size="sm">
                  {loading ? 'アンロック中...' : 'このVaultを使う'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
