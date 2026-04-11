import { CheckCircle2, Copy } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as commands from '../../commands'
import { copySensitive } from '../../lib/clipboard'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

interface RecoveryKeyProps {
  onComplete?: () => void
}

export default function RecoveryKey({ onComplete }: RecoveryKeyProps) {
  const location = useLocation()
  const recoveryKey = (location.state as { recoveryKey?: string })?.recoveryKey ?? ''
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copySensitive(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = async () => {
    try {
      // Get vault bytes and save to local file
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)

      onComplete?.()
    } catch (error) {
      alert(`エラー: ${error}`)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="リカバリーキー" subtitle="Vaultの復旧に必要です" />

      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>あなたのリカバリーキー</CardTitle>
          </CardHeader>
          <CardContent>
            {/* コードブロック */}
            <div className="mb-6">
              <div className="bg-bg-elevated rounded-lg border border-border p-6 font-mono text-sm text-text-primary break-all select-all hover:bg-bg-surface/80 transition-colors">
                {recoveryKey}
              </div>
            </div>

            {/* コピーボタン */}
            <Button
              variant="secondary"
              onClick={handleCopy}
              className="w-full mb-4 justify-center gap-2"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>コピーしました</span>
                </>
              ) : (
                <>
                  <Copy size={18} />
                  <span>リカバリーキーをコピー</span>
                </>
              )}
            </Button>

            {/* 完了ボタン */}
            <Button onClick={handleComplete} className="w-full">
              完了
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
