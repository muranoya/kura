import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WebauthnRitualContext } from '../../../shared/webauthn-messages'
import { Button } from '../../components/ui/button'

interface CreateConfirmProps {
  context: Extract<WebauthnRitualContext, { kind: 'create' }>
  onConfirm: (entryId: string | undefined) => void
  onCancel: () => void
}

const NEW_ENTRY_OPTION = '__new__'

export default function CreateConfirm({ context, onConfirm, onCancel }: CreateConfirmProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>(
    context.matchingEntries.length > 0 ? context.matchingEntries[0].id : NEW_ENTRY_OPTION,
  )

  return (
    <div className="min-h-screen bg-bg-base flex flex-col p-4 gap-3">
      <div>
        <h1 className="text-sm font-semibold text-text-primary">
          {t('webauthn.ritual.createTitle')}
        </h1>
        <p className="text-xs text-text-muted mt-0.5">{context.rpName || context.rpId}</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        <p className="text-xs text-text-secondary">{t('webauthn.ritual.chooseEntry')}</p>

        {context.matchingEntries.map((entry) => (
          <label
            key={entry.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
              selected === entry.id
                ? 'border-accent bg-accent-subtle'
                : 'border-border bg-bg-surface hover:border-accent/50'
            }`}
          >
            <input
              type="radio"
              name="target-entry"
              className="shrink-0"
              checked={selected === entry.id}
              onChange={() => setSelected(entry.id)}
            />
            <KeyRound size={14} className="text-accent shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary truncate">{entry.name}</div>
              {entry.username && (
                <div className="text-xs text-text-muted truncate">{entry.username}</div>
              )}
            </div>
          </label>
        ))}

        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
            selected === NEW_ENTRY_OPTION
              ? 'border-accent bg-accent-subtle'
              : 'border-border bg-bg-surface hover:border-accent/50'
          }`}
        >
          <input
            type="radio"
            name="target-entry"
            className="shrink-0"
            checked={selected === NEW_ENTRY_OPTION}
            onChange={() => setSelected(NEW_ENTRY_OPTION)}
          />
          <Plus size={14} className="text-accent shrink-0" />
          <span className="text-sm text-text-primary">{t('webauthn.ritual.createNewEntry')}</span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onConfirm(selected === NEW_ENTRY_OPTION ? undefined : selected)}
        >
          {t('webauthn.ritual.confirm')}
        </Button>
      </div>
    </div>
  )
}
