import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'

interface RecoveryProps {
  onUnlocked?: () => void
}

export default function Recovery({ onUnlocked }: RecoveryProps) {
  const navigate = useNavigate()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRecover = async () => {
    if (!recoveryKey || !newPassword || !confirmPassword) {
      setError('すべてのフィールドを入力してください')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      await commands.unlockWithRecoveryKey(recoveryKey)
      onUnlocked?.()
    } catch (err) {
      setError(`復旧失敗: ${err}`)
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-bg-base px-4">
      <div className="w-full max-w-md">
        {/* ヘッダー */}
        <button
          type="button"
          onClick={() => navigate('/auth/lock')}
          className="flex items-center gap-2 text-accent hover:text-accent-hover mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">戻る</span>
        </button>

        <Card>
          <CardHeader>
            <CardTitle>リカバリーキーで復旧</CardTitle>
          </CardHeader>
          <CardContent>
            {/* エラーメッセージ */}
            {error && (
              <div className="mb-4 p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            {/* リカバリーキー */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="recovery-key">リカバリーキー</Label>
              <Input
                id="recovery-key"
                type="text"
                placeholder="リカバリーキーを入力"
                value={recoveryKey}
                onChange={(e) => {
                  setRecoveryKey(e.target.value)
                  setError('')
                }}
              />
            </div>

            {/* 新しいパスワード */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="new-password">新しいパスワード</Label>
              <PasswordInput
                id="new-password"
                placeholder="新しいパスワード"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setError('')
                }}
              />
            </div>

            {/* パスワード確認 */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="confirm-password">パスワード確認</Label>
              <PasswordInput
                id="confirm-password"
                placeholder="パスワードを再入力"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
              />
            </div>

            {/* 復旧ボタン */}
            <Button onClick={handleRecover} disabled={loading} className="w-full">
              {loading ? '復旧中...' : '復旧'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
