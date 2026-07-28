import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as commands from '../../commands'
import { Button } from '../../components/ui/button'
import { PasswordInput } from '../../components/ui/password-input'

interface UnlockRitualProps {
  onUnlocked: () => void
  onCancel: () => void
}

export default function UnlockRitual({ onUnlocked, onCancel }: UnlockRitualProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setError(t('settings.security.passwordRequired'))
      return
    }
    setLoading(true)
    try {
      await commands.unlock(password)
      onUnlocked()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [password, t, onUnlocked])

  return (
    <div className="min-h-screen bg-bg-base flex flex-col p-4 gap-3">
      <div>
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 mb-2">
          <Lock className="w-4 h-4 text-accent" />
        </div>
        <h1 className="text-sm font-semibold text-text-primary">
          {t('webauthn.ritual.unlockTitle')}
        </h1>
        <p className="text-xs text-text-muted mt-0.5">{t('webauthn.ritual.unlockDescription')}</p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2">
        {error && (
          <div className="p-2 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}
        <PasswordInput
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          placeholder={t('common.passwordPlaceholder')}
          disabled={loading}
          autoFocus
          className="text-sm"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" className="flex-1" onClick={handleUnlock} disabled={loading || !password}>
          {loading ? t('auth.lock.unlocking') : t('webauthn.ritual.unlockButton')}
        </Button>
      </div>
    </div>
  )
}
