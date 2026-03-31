import { Check, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'

export default function Welcome() {
  const navigate = useNavigate()

  const handleStart = () => {
    navigate('/onb/storage')
  }

  return (
    <div className="flex items-center justify-center h-full bg-bg-base px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">kura</h1>
          <p className="text-sm text-text-secondary">
            サーバ不要、自分一人のための
            <br />
            運用コストゼロのパスワードマネージャー
          </p>
        </div>

        {/* 特徴説明 */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <div className="flex gap-3">
              <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">完全なゼロ知識設計</p>
                <p className="text-sm text-text-muted mt-0.5">
                  すべての暗号化はクライアント側で行われます
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">クラウドストレージ連携</p>
                <p className="text-sm text-text-muted mt-0.5">S3互換サービスなら何でも対応</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">ベンダーロックインなし</p>
                <p className="text-sm text-text-muted mt-0.5">いつでも他のサービスに切り替え可能</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <Button onClick={handleStart} className="w-full text-sm" size="sm">
          始める
        </Button>
      </div>
    </div>
  )
}
