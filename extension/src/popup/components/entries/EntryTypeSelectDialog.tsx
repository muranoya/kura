import { getEntryTypeLabel } from '../../../shared/constants'
import EntryTypeIcon from '../EntryTypeIcon'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

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
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>アイテム種別を選択</DialogTitle>
          <DialogDescription>作成するアイテムの種別を選んでください</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {ENTRY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-bg-base hover:border-accent/50 hover:bg-accent/5 transition-colors text-left"
            >
              <EntryTypeIcon type={type} size={20} />
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
