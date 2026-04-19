import {
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  Lock,
  RotateCw,
  ScrollText,
  Terminal,
  Trash2,
} from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { EntryRow } from '../../../shared/types'
import { Button } from '../ui/button'

const getEntryIcon = (type: string) => {
  switch (type) {
    case 'login':
      return <KeyRound size={20} />
    case 'bank':
      return <Building2 size={20} />
    case 'ssh_key':
      return <Terminal size={20} />
    case 'secure_note':
      return <FileText size={20} />
    case 'credit_card':
      return <CreditCard size={20} />
    case 'password':
      return <Lock size={20} />
    case 'software_license':
      return <ScrollText size={20} />
    default:
      return <KeyRound size={20} />
  }
}

interface EntryCardNormalProps {
  variant: 'normal'
  entry: EntryRow
  onClick: (id: string) => void

  isSelected?: boolean
}

interface EntryCardTrashProps {
  variant: 'trash'
  entry: EntryRow
  onRestore: (id: string) => void
  onPurge: (id: string) => void
}

type EntryCardProps = EntryCardNormalProps | EntryCardTrashProps

export default function EntryCard(props: EntryCardProps) {
  const { t, i18n } = useTranslation()

  if (props.variant === 'normal') {
    const isSelected = props.isSelected || false

    return (
      <button
        type="button"
        className={`w-full text-left px-3 py-1.5 transition-colors cursor-pointer group ${
          isSelected
            ? 'bg-accent-subtle border-l-2 border-l-accent'
            : 'border-l-2 border-l-transparent hover:bg-bg-elevated'
        }`}
        onClick={() => props.onClick(props.entry.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-shrink-0 w-6 h-6 rounded bg-accent/10 flex items-center justify-center text-accent">
              {React.cloneElement(
                getEntryIcon(props.entry.entryType) as React.ReactElement<{ size: number }>,
                { size: 14 },
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-text-primary truncate">
                {props.entry.name}
              </h3>
              {props.entry.subtitle && (
                <p className="text-xs text-text-muted truncate mt-0.5">{props.entry.subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="px-3 py-2 border-l-2 border-l-transparent">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary truncate">{props.entry.name}</h3>
          <p className="text-sm text-text-muted mt-1">
            {t('entries.deletedAt')}:{' '}
            {props.entry.deletedAt
              ? new Date(props.entry.deletedAt * 1000).toLocaleString(i18n.language)
              : '-'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => props.onRestore(props.entry.id)}
            className="gap-1"
          >
            <RotateCw size={16} />
            {t('entries.restore')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => props.onPurge(props.entry.id)}
            className="gap-1"
          >
            <Trash2 size={16} />
            {t('entries.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export { getEntryIcon }
