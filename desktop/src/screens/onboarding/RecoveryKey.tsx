import { AlertCircle, CheckCircle2, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

export default function RecoveryKey() {
  const navigate = useNavigate()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const key = sessionStorage.getItem('recoveryKey')
    if (key) {
      setRecoveryKey(key)
    }
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = async () => {
    try {
      // Get vault bytes and save to local file
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)

      sessionStorage.removeItem('recoveryKey')
      navigate('/')
      // Redirect to lock screen after file is saved
      window.location.reload()
    } catch (error) {
      alert(`エラー: ${error}`)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="リカバリーキー" subtitle="Vaultの復旧に必要です" />

      <div className="max-w-2xl mx-auto p-6">
        {/* 重要な説明 */}
        <div className="mb-6 p-4 bg-danger/10 rounded-lg border border-danger/20 flex gap-3">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-danger font-medium mb-1">必ず保管してください</p>
            <p className="text-text-muted">
              このリカバリーキーはマスターパスワードを忘れた場合の唯一の復旧手段です。
              紙に印刷するか、パスワード管理ツールに保管してください。
            </p>
          </div>
        </div>

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

            {/* 保管方法のヒント */}
            <div className="mb-6 p-4 bg-accent-subtle rounded-lg border border-accent/20">
              <h4 className="text-sm font-medium text-accent mb-2">💡 保管方法</h4>
              <ul className="text-xs text-text-secondary space-y-1">
                <li>✓ 紙に印刷して金庫に保管</li>
                <li>✓ 別のパスワードマネージャーに保管</li>
                <li>✓ 信頼できる人に複製を渡す</li>
              </ul>
            </div>

            {/* 完了ボタン */}
            <Button onClick={handleComplete} className="w-full">
              完了
            </Button>
          </CardContent>
        </Card>

        {/* 下部メモ */}
        <div className="mt-6 p-4 bg-bg-surface rounded-lg border border-border">
          <p className="text-xs text-text-muted">
            次の画面からVaultにロックがかかり、マスターパスワードで保護されます。
            リカバリーキーを必ず安全な場所に保管してください。
          </p>
        </div>
      </div>
    </div>
  )
}
