import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { PasswordInput } from '../../components/ui/password-input'

export default function LockScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setError(t('settings.security.passwordRequired'))
      return
    }

    setLoading(true)
    try {
      await commands.unlock(password)
      window.location.reload()
    } catch (err) {
      setError(`${t('auth.lock.unlocking')}: ${err}`)
      setLoading(false)
    }
  }, [password, t])

  const handleLogout = useCallback(() => {
    setShowLogoutDialog(true)
  }, [])

  const handleLogoutConfirm = useCallback(async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.clear(() => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve()
            }
          })
        } else {
          resolve()
        }
      })

      window.close()
    } catch (err) {
      setError(t('errors.logoutFailed', { error: String(err) }))
      setShowLogoutDialog(false)
    }
  }, [t])

  return (
    <div className="flex items-center justify-center h-full bg-bg-base px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-3">
            <Lock className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">kura</h1>
          <p className="text-sm text-text-secondary">{t('auth.lock.title')}</p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {error && (
              <div className="mb-3 p-2 rounded-md bg-danger/10 border border-danger/20">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <div className="space-y-1.5 mb-4">
              <Label htmlFor="password" className="text-sm">
                {t('auth.lock.passwordLabel')}
              </Label>
              <PasswordInput
                id="password"
                placeholder={t('auth.lock.subtitle')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
                disabled={loading}
                autoFocus
                className="text-sm"
              />
            </div>

            <Button onClick={handleUnlock} disabled={loading} className="w-full mb-2 text-sm">
              {loading ? t('auth.lock.unlocking') : t('auth.lock.unlockButton')}
            </Button>

            <Button
              variant="secondary"
              onClick={() => navigate('/auth/recovery')}
              className="w-full text-sm"
            >
              {t('auth.lock.forgotPassword')}
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6">
          <div className="border-t border-border mb-4" />
          <Button variant="destructive" onClick={handleLogout} className="w-full text-sm">
            {t('settings.security.logout')}
          </Button>
        </div>

        <ConfirmDialog
          open={showLogoutDialog}
          title={t('settings.security.logoutDialogTitle')}
          description={t('settings.security.logoutDialogDesc')}
          confirmText={t('settings.security.logoutButton')}
          isDangerous={true}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setShowLogoutDialog(false)}
        />
      </div>
    </div>
  )
}
