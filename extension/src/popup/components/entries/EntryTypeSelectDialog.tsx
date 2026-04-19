import { useTranslation } from 'react-i18next'
import { ENTRY_TYPE_KEYS } from '../../../shared/constants'
import EntryTypeIcon from '../EntryTypeIcon'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('entries.selectTypeDialog.title')}</DialogTitle>
          <DialogDescription>{t('entries.selectTypeDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {ENTRY_TYPE_KEYS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-bg-base hover:border-accent/50 hover:bg-accent/5 transition-colors text-left"
            >
              <EntryTypeIcon type={type} size={20} />
              <span className="text-sm font-medium text-text-primary">
                {t(`entries.types.${type}`)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
