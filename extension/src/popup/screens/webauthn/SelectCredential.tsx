import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WebauthnRitualContext } from '../../../shared/webauthn-messages'
import { Button } from '../../components/ui/button'
import UserVerificationField from './UserVerificationField'

interface SelectCredentialProps {
  context: Extract<WebauthnRitualContext, { kind: 'get' }>
  /** masterPassword is set when context.requireUserVerification */
  onConfirm: (credentialId: string, masterPassword?: string) => void
  onCancel: () => void
  /** Error from the previous confirmation attempt (e.g. wrong master password) */
  error: string | null
  busy: boolean
}

export default function SelectCredential({
  context,
  onConfirm,
  onCancel,
  error,
  busy,
}: SelectCredentialProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const confirm = (credentialId: string) => {
    if (!context.requireUserVerification) {
      onConfirm(credentialId)
      return
    }
    if (!password) {
      setLocalError(t('settings.security.passwordRequired'))
      return
    }
    setLocalError(null)
    onConfirm(credentialId, password)
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col p-4 gap-3">
      <div>
        <h1 className="text-sm font-semibold text-text-primary">{t('webauthn.ritual.getTitle')}</h1>
        <p className="text-xs text-text-muted mt-0.5">{context.rpId}</p>
      </div>

      {context.requireUserVerification && (
        <UserVerificationField
          password={password}
          onChange={(value) => {
            setPassword(value)
            setLocalError(null)
          }}
          error={localError ?? error}
          disabled={busy}
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {context.candidates.map((candidate) => (
          <button
            key={candidate.customFieldId}
            type="button"
            disabled={busy}
            onClick={() => confirm(candidate.credentialId)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-bg-surface hover:border-accent hover:bg-accent-subtle transition-colors text-left"
          >
            <div className="w-7 h-7 rounded bg-accent/10 flex items-center justify-center text-accent shrink-0">
              <KeyRound size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary truncate">
                {candidate.entryName}
              </div>
              <div className="text-xs text-text-muted truncate">
                {candidate.userDisplayName || candidate.userName}
              </div>
            </div>
          </button>
        ))}
      </div>

      <Button variant="secondary" size="sm" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}
