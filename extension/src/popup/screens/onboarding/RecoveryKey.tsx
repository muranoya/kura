import { AlertTriangle, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'

export default function RecoveryKey() {
  const navigate = useNavigate()
  const location = useLocation()
  const passedRecoveryKey = (location.state as { recoveryKey?: string })?.recoveryKey
  const [recoveryKey] = useState(passedRecoveryKey || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')
  const [confirmed, setConfirmed] = useState(false)
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [completing, setCompleting] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = async () => {
    if (recoveryKey.replace(/-/g, '') !== recoveryKeyInput.replace(/-/g, '')) {
      alert('リカバリーキーが一致しません')
      return
    }

    setCompleting(true)
    try {
      // Onboarding draft をクリア
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await new Promise<void>((resolve) => {
          chrome.storage.local.remove('onboardingDraft', () => {
            resolve()
          })
        })
      }

      // Vault が unlocked されていることを確認
      const isUnlocked = await new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ type: 'IS_UNLOCKED' }, (response: { unlocked?: boolean }) => {
          resolve(response?.unlocked ?? false)
        })
      })

      if (isUnlocked) {
        // ナビゲーション前に少し待機して、state の更新を確保
        await new Promise((resolve) => setTimeout(resolve, 100))
        navigate('/entries')
      } else {
        alert('Vault の準備ができていません。もう一度お試しください。')
      }
    } catch (err) {
      console.error('[RecoveryKey] Error:', err)
      alert(`エラー: ${String(err)}`)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="リカバリーキー" showBackButton={false} />

      <div className="p-4 space-y-4">
        {/* 警告 */}
        <div className="p-3 rounded-md bg-danger/10 border border-danger/20 flex gap-3">
          <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">
            このキーを失うと復旧不可能です。紙に書き写して安全な場所に保管してください。
          </p>
        </div>

        {/* リカバリーキー表示 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">リカバリーキー</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <div className="bg-bg-elevated p-3 rounded-md border border-border font-mono text-sm text-text-primary break-all">
              {recoveryKey}
            </div>
            <Button
              variant="secondary"
              onClick={handleCopy}
              className="w-full text-sm gap-1"
              size="sm"
            >
              {copied ? (
                <>
                  <Check size={14} /> コピーしました
                </>
              ) : (
                <>
                  <Copy size={14} /> コピー
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 紙に書き写し確認 */}
        <label className="flex items-start gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-bg-elevated">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 mt-0.5 flex-shrink-0"
          />
          <span className="text-sm text-text-primary">リカバリーキーを紙に書き写しました</span>
        </label>

        {/* 確認入力 */}
        {confirmed && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">リカバリーキーを確認</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              <p className="text-sm text-text-muted mb-2">
                リカバリーキーを入力して保管を確認してください
              </p>
              <Input
                type="text"
                value={recoveryKeyInput}
                onChange={(e) => setRecoveryKeyInput(e.target.value)}
                placeholder="XXXX-XXXX-..."
                className="text-sm font-mono"
              />
            </CardContent>
          </Card>
        )}

        {/* アクションボタン */}
        <Button
          onClick={handleComplete}
          disabled={!confirmed || !recoveryKeyInput || completing}
          className="w-full text-sm"
          size="sm"
        >
          {completing ? '確認中...' : '完了'}
        </Button>
      </div>
    </div>
  )
}
