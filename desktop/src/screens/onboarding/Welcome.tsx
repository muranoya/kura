import { Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'

export default function Welcome() {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-bg-base to-bg-surface px-4">
      <div className="w-full max-w-md text-center">
        {/* ロゴ */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-accent/10 mb-8">
          <Shield className="w-12 h-12 text-accent" />
        </div>

        {/* タイトル */}
        <h1 className="text-4xl font-bold text-text-primary mb-4">kura</h1>

        {/* キャッチコピー */}
        <p className="text-lg text-text-secondary mb-2">サーバ不要、自分一人のための</p>
        <p className="text-lg text-text-secondary mb-8">運用コストゼロのパスワードマネージャー</p>

        {/* CTA */}
        <Button onClick={() => navigate('/onb/storage')} size="lg" className="w-full">
          始める
        </Button>
      </div>
    </div>
  )
}
