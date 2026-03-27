import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'

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
  const strengthColors = [
    'bg-gray-300',
    'bg-danger',
    'bg-warning',
    'bg-warning',
    'bg-success',
  ]

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
      console.log('[MasterPassword] Sending CREATE_VAULT message')
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'CREATE_VAULT', masterPassword: password },
          (response) => {
            console.log('[MasterPassword] CREATE_VAULT response:', response)
            resolve(response)
          }
        )
      })

      if (response?.success) {
        console.log('[MasterPassword] Vault created successfully, recovery key:', response.recoveryKey)

        // Service Worker 再起動対策: 作成直後に UNLOCK を送ってメモリにロードさせる
        console.log('[MasterPassword] Sending UNLOCK to ensure vault is loaded in background')
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'UNLOCK', password: password },
            (unlockResponse) => {
              console.log('[MasterPassword] UNLOCK response:', unlockResponse)
              resolve()
            }
          )
        })

        navigate('/onb/recovery', { state: { recoveryKey: response.recoveryKey } })
      } else {
        const errorMsg = response?.error || 'Vault作成に失敗しました'
        console.error('[MasterPassword] Vault creation failed:', errorMsg)
        alert(errorMsg)
      }
    } catch (err) {
      console.error('[MasterPassword] Exception:', err)
      alert(String(err))
    } finally {
      setLoading(false)
    }
  }

  const passwordsMatch = confirmPassword && password === confirmPassword

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader
        title="マスターパスワード設定"
        showBackButton={true}
      />

      <div className="p-4 space-y-4">
        {/* パスワード説明 */}
        <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
          <p className="text-xs text-text-primary">
            📌 すべてのデータを保護するマスターパスワードです。安全で予測困難なパスワードを設定してください。
          </p>
        </div>

        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-xs font-medium">パスワード設定</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-3">
            {/* パスワード入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">
                マスターパスワード
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="強力なパスワードを設定してください"
                className="text-xs"
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
                  <p className="text-xs text-text-muted">
                    強度: {strengthLabels[strength]}
                  </p>
                </div>
              )}
            </div>

            {/* パスワード確認入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs">
                パスワード確認
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="パスワードを再入力してください"
                className="text-xs"
              />

              {/* マッチング状態 */}
              {confirmPassword && (
                <div
                  className={`flex items-center gap-1 text-xs ${
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
              <span className="text-xs text-text-primary">
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
