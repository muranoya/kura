import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WebauthnRitualContext } from '../../../shared/webauthn-messages'
import { Button } from '../../components/ui/button'

interface SelectCredentialProps {
  context: Extract<WebauthnRitualContext, { kind: 'get' }>
  onConfirm: (credentialId: string) => void
  onCancel: () => void
}

export default function SelectCredential({ context, onConfirm, onCancel }: SelectCredentialProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-bg-base flex flex-col p-4 gap-3">
      <div>
        <h1 className="text-sm font-semibold text-text-primary">{t('webauthn.ritual.getTitle')}</h1>
        <p className="text-xs text-text-muted mt-0.5">{context.rpId}</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {context.candidates.map((candidate) => (
          <button
            key={candidate.customFieldId}
            type="button"
            onClick={() => onConfirm(candidate.credentialId)}
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
