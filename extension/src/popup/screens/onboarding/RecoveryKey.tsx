import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { copySensitive } from '../../lib/clipboard'

export default function RecoveryKey() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const passedRecoveryKey = (location.state as { recoveryKey?: string })?.recoveryKey
  const [recoveryKey] = useState(passedRecoveryKey || 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')
  const [copied, setCopied] = useState(false)
  const [completing, setCompleting] = useState(false)

  const handleCopy = () => {
    copySensitive(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = async () => {
    setCompleting(true)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await new Promise<void>((resolve) => {
          chrome.storage.local.remove('onboardingDraft', () => {
            resolve()
          })
        })
      }

      const isUnlocked = await new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ type: 'IS_UNLOCKED' }, (response: { unlocked?: boolean }) => {
          resolve(response?.unlocked ?? false)
        })
      })

      if (isUnlocked) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        navigate('/entries')
      } else {
        alert(t('onboarding.recoveryKey.vaultNotReady'))
      }
    } catch (err) {
      console.error('[RecoveryKey] Error:', err)
      alert(`${t('onboarding.recoveryKey.errorPrefix')}: ${String(err)}`)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-4 flex flex-col">
      <PageHeader title={t('onboarding.recoveryKey.title')} showBackButton={false} />

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">
              {t('onboarding.recoveryKey.cardTitle')}
            </CardTitle>
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
                  <Check size={14} /> {t('common.copied')}
                </>
              ) : (
                <>
                  <Copy size={14} /> {t('onboarding.recoveryKey.copyKey')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Button onClick={handleComplete} disabled={completing} className="w-full text-sm" size="sm">
          {completing
            ? t('onboarding.recoveryKey.completing')
            : t('onboarding.recoveryKey.completeButton')}
        </Button>
      </div>
    </div>
  )
}
