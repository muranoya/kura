import { useTranslation } from 'react-i18next'
import { getEntryTypeLabel } from '../../shared/constants'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { getEntryIcon } from './EntryCard'

const ENTRY_TYPES = [
  'login',
  'bank',
  'ssh_key',
  'secure_note',
  'credit_card',
  'password',
  'software_license',
] as const

interface EntryTypeSelectDialogProps {
  open: boolean
  onSelect: (type: string) => void
  onCancel: () => void
}

export default function EntryTypeSelectDialog({
  open,
  onSelect,
  onCancel,
}: EntryTypeSelectDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('entries.typeSelectDialog.title')}</DialogTitle>
          <DialogDescription>{t('entries.typeSelectDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {ENTRY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-bg-base hover:border-accent/50 hover:bg-accent/5 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                {getEntryIcon(type)}
              </div>
              <span className="text-sm font-medium text-text-primary">
                {getEntryTypeLabel(type)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
