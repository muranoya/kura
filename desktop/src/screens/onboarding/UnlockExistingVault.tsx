import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'
import { STORAGE_KEYS } from '../../shared/constants'
import { saveToStorage } from '../../shared/storage'

interface UnlockExistingVaultProps {
  onUnlocked?: () => void
}

export default function UnlockExistingVault({ onUnlocked }: UnlockExistingVaultProps) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setError('パスワードを入力してください')
      return
    }

    setLoading(true)
    try {
      await commands.unlock(password)
      // S3設定をマスターパスワードで暗号化して永続保存
      const pendingConfig = sessionStorage.getItem('pendingS3Config')
      if (pendingConfig) {
        const encrypted = await commands.encryptConfig(password, pendingConfig)
        await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
        sessionStorage.removeItem('pendingS3Config')
        await commands.setS3ConfigSession(pendingConfig)
      }
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch(() => {}) // バックグラウ���ド
      onUnlocked?.()
    } catch (_err) {
      setError('パスワードが違います')
      setLoading(false)
    }
  }, [password])

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader
        title="既存のVaultを使用"
        subtitle="このストレージには既にVaultが存在しています"
      />

      <div className="flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              {/* ロゴ */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-3">
                  <Lock className="w-6 h-6 text-accent" />
                </div>
              </div>

              {/* 説明文 */}
              <p className="text-center text-text-secondary mb-6 text-sm">
                このVaultを使用するためには、マスターパスワードを入力してください。
              </p>

              {/* エラーメッセージ */}
              {error && (
                <div className="mb-4 p-3 rounded-md bg-danger/10 border border-danger/20">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {/* パスワード入力 */}
              <div className="space-y-2 mb-6">
                <Label htmlFor="password">マスターパスワード</Label>
                <PasswordInput
                  id="password"
                  placeholder="パスワードを入力"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
                  disabled={loading}
                  autoFocus
                />
              </div>

              {/* ボタン */}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/onb/storage')}
                  className="flex-1"
                  disabled={loading}
                >
                  戻る
                </Button>
                <Button
                  onClick={handleUnlock}
                  disabled={loading}
                  isLoading={loading}
                  className="flex-1"
                >
                  このVaultを使う
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
