import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'

interface LargeTextDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  value: string
}

export function LargeTextDialog({ open, onOpenChange, label, value }: LargeTextDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div
          className="py-4 px-3 text-2xl text-text-primary tracking-[0.15em] break-all leading-relaxed text-center max-h-[50vh] overflow-y-auto"
          style={{ fontFamily: "'JetBrains Mono Bundled', monospace" }}
        >
          {value}
        </div>
      </DialogContent>
    </Dialog>
  )
}
