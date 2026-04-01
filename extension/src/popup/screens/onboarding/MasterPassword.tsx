import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

export default function MasterPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  const passwordStrength = (pwd: string) => {
    if (!pwd) return 0
    let strength = 0
    if (pwd.length >= 8) strength++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    if (/[0-9]/.test(pwd)) strength++
    if (/[!@#$%^&*]/.test(pwd)) strength++
    return strength
  }

  const strength = passwordStrength(password)
  const strengthLabels = ['', '弱', '中弱', '中', '強']
  const strengthColors = ['bg-gray-300', 'bg-danger', 'bg-warning', 'bg-warning', 'bg-success']

  const handleCreate = async () => {
    if (!confirmed) {
      alert('パスワードを忘れないことを確認してください')
      return
    }

    if (password !== confirmPassword) {
      alert('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      const response = await new Promise<{
        success?: boolean
        recoveryKey?: string
        error?: string
      }>((resolve, _reject) => {
        chrome.runtime.sendMessage(
          { type: 'CREATE_VAULT', masterPassword: password },
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

        navigate('/onb/recovery', { state: { recoveryKey: response.recoveryKey } })
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
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="マスターパスワード設定" showBackButton={true} />

      <div className="p-4 space-y-4">
        {/* パスワード説明 */}
        <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
          <p className="text-sm text-text-primary">
            📌
            すべてのデータを保護するマスターパスワードです。安全で予測困難なパスワードを設定してください。
          </p>
        </div>

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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="強力なパスワードを設定してください"
                className="text-sm"
              />

              {/* 強度インジケータ */}
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i <= strength ? strengthColors[strength] : 'bg-border'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-text-muted">強度: {strengthLabels[strength]}</p>
                </div>
              )}
            </div>

            {/* パスワード確認入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-sm">
                パスワード確認
              </Label>
              <Input
                id="confirm-password"
                type="password"
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

            {/* 確認チェックボックス */}
            <label className="flex items-start gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-bg-elevated">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4 mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-text-primary">
                このパスワードを忘れないことを確認します
              </span>
            </label>
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
            disabled={loading || password !== confirmPassword || !password || !confirmed}
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
