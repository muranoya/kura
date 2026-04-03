import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { STORAGE_KEYS } from '../../shared/constants'
import { saveToStorage } from '../../shared/storage'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'

export default function MasterPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!password || !confirmPassword) {
      setError('パスワードを入力してください')
      return
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    if (password.length < 8) {
      setError('パスワードは8文字以上である必要があります')
      return
    }

    setLoading(true)
    try {
      const recoveryKey = await commands.createVault(password)
      // S3設定をマスターパスワードで暗号化して永続保存
      const pendingConfig = sessionStorage.getItem('pendingS3Config')
      if (pendingConfig) {
        const encrypted = await commands.encryptConfig(password, pendingConfig)
        await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
        sessionStorage.removeItem('pendingS3Config')
        // 復号済みS3設定をセッションに保持（同期で使用）
        sessionStorage.setItem('decryptedS3Config', pendingConfig)
      }
      // Store recovery key in session/context for display on next screen
      sessionStorage.setItem('recoveryKey', recoveryKey)
      navigate('/onb/recovery')
    } catch (err) {
      setError(`エラー: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader
        title="マスターパスワード設定"
        subtitle="Vault全体を保護するパスワードを設定します"
      />

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
              {/* パスワード */}
              <div>
                <Label htmlFor="password">
                  パスワード <span className="text-danger">*</span>
                </Label>
                <PasswordInput
                  id="password"
                  placeholder="強力なパスワードを入力"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  8文字以上の強力なパスワードを設定してください
                </p>
              </div>

              {/* パスワード確認 */}
              <div>
                <Label htmlFor="confirm-password">
                  パスワード確認 <span className="text-danger">*</span>
                </Label>
                <PasswordInput
                  id="confirm-password"
                  placeholder="パスワードを再入力"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setError('')
                  }}
                />
                {confirmPassword && password === confirmPassword && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <p className="text-xs text-success">パスワードが一致しています</p>
                  </div>
                )}
              </div>

              {/* ボタン */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/onb/storage')}
                  className="flex-1"
                  disabled={loading}
                >
                  戻る
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={loading || !password || !confirmPassword}
                  className="flex-1"
                >
                  {loading ? '作成中...' : 'Vaultを作成'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
