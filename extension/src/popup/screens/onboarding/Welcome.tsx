import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'

export default function Welcome() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleStart = () => {
    navigate('/onb/storage')
  }

  return (
    <div className="flex items-center justify-center h-full bg-bg-base px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-accent/10 mb-4">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">kura</h1>
          <p className="text-sm text-text-secondary">{t('onboarding.welcome.subtitle')}</p>
        </div>

        <p className="mb-4 text-xs text-text-secondary leading-relaxed text-center">
          {t('onboarding.welcome.disclaimer')}
        </p>

        <Button onClick={handleStart} className="w-full text-sm" size="sm">
          {t('onboarding.welcome.startButton')}
        </Button>
      </div>
    </div>
  )
}
