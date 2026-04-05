import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export default function RecoveryKey() {
  const navigate = useNavigate()
  const location = useLocation()
  const passedRecoveryKey = (location.state as { recoveryKey?: string })?.recoveryKey
  const [recoveryKey] = useState(passedRecoveryKey || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')
  const [copied, setCopied] = useState(false)
  const [completing, setCompleting] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = async () => {
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
    <div className="h-full overflow-y-auto pb-4 flex flex-col">
      <PageHeader title="リカバリーキー" showBackButton={false} />

      <div className="p-4 space-y-4">
        {/* リカバリーキー表示 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">あなたのリカバリーキー</CardTitle>
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
                  <Copy size={14} /> リカバリーキーをコピー
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 完了ボタン */}
        <Button
          onClick={handleComplete}
          disabled={completing}
          className="w-full text-sm"
          size="sm"
        >
          {completing ? '確認中...' : '完了'}
        </Button>
      </div>
    </div>
  )
}
