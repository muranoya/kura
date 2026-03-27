import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent } from '../../components/ui/card'
import * as commands from '../../commands'

export default function Recovery() {
  const navigate = useNavigate()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRecover = async () => {
    if (!recoveryKey || !newPassword || !confirmPassword) {
      setError('すべてのフィールドを入力してください')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません')
      return
    }

    setLoading(true)
    setError('')
    try {
      await commands.recoverWithRecoveryKey(recoveryKey, newPassword)
      window.location.reload()
    } catch (err) {
      setError(`リカバリー失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-base px-4">
      <div className="w-full max-w-sm">
        {/* ヘッダー */}
        <button
          onClick={() => navigate('/auth/lock')}
          className="flex items-center gap-1 text-accent hover:text-accent-hover mb-6 text-xs"
        >
          <ArrowLeft size={14} />
          戻る
        </button>

        {/* タイトル */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary mb-1">リカバリーキーで復旧</h1>
          <p className="text-xs text-text-secondary">
            マスターパスワードを忘れた場合、リカバリーキーを使って新しいパスワードを設定できます
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* エラーメッセージ */}
            {error && (
              <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {/* リカバリーキー入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="recovery-key" className="text-xs">
                リカバリーキー
              </Label>
              <Input
                id="recovery-key"
                type="text"
                placeholder="XXXX-XXXX-XXXX-..."
                value={recoveryKey}
                onChange={(e) => {
                  setRecoveryKey(e.target.value)
                  setError('')
                }}
                disabled={loading}
                className="text-sm font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                セットアップ時に保管したリカバリーキーを入力してください
              </p>
            </div>

            {/* 新しいパスワード入力 */}
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs">
                新しいマスターパスワード
              </Label>
              <Input
                id="new-password"
                type="password"
                placeholder="新しいパスワード"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setError('')
                }}
                disabled={loading}
                className="text-sm"
              />
            </div>

            {/* パスワード確認 */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs">
                パスワード確認
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
                onKeyPress={(e) => e.key === 'Enter' && handleRecover()}
                disabled={loading}
                className="text-sm"
              />
            </div>

            {/* 復旧ボタン */}
            <Button
              onClick={handleRecover}
              disabled={loading || !recoveryKey || !newPassword || !confirmPassword}
              className="w-full text-sm mt-2"
            >
              {loading ? '復旧中...' : '復旧'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
