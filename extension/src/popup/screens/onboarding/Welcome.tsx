import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'

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

        {/* CTA */}
        <Button onClick={handleStart} className="w-full text-sm" size="sm">
          始める
        </Button>
      </div>
    </div>
  )
}
