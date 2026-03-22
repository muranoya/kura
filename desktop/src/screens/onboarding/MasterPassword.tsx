import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

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
      // Store recovery key in session/context for display on next screen
      sessionStorage.setItem('recoveryKey', recoveryKey)
      navigate('/onb/recovery')
    } catch (err) {
      setError(`エラー: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const passwordStrength = password.length >= 8 ? 'strong' : password.length >= 4 ? 'medium' : 'weak'

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="マスターパスワード設定" subtitle="Vault全体を保護するパスワードを設定します" />

      <div className="max-w-2xl mx-auto p-6">
        {/* セキュリティアラート */}
        <div className="mb-6 p-4 bg-accent-subtle rounded-lg border border-accent/20 flex gap-3">
          <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-accent font-medium mb-1">重要なセキュリティ情報</p>
            <p className="text-text-muted">
              このパスワードを忘れると、すべてのデータにアクセスできなくなります。次の画面で表示されるリカバリーキーを必ず保管してください。
            </p>
          </div>
        </div>

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
                <Input
                  id="password"
                  type="password"
                  placeholder="強力なパスワードを入力"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                />
                <p className="text-xs text-text-muted mt-1.5">8文字以上の強力なパスワードを設定してください</p>

                {/* パスワード強度インジケータ */}
                {password && (
                  <div className="mt-2 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        passwordStrength === 'strong'
                          ? 'w-full bg-success'
                          : passwordStrength === 'medium'
                          ? 'w-2/3 bg-warning'
                          : 'w-1/3 bg-danger'
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* パスワード確認 */}
              <div>
                <Label htmlFor="confirm-password">
                  パスワード確認 <span className="text-danger">*</span>
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
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
