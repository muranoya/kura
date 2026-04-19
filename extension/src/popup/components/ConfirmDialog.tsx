import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText,
  isDangerous = false,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm()
    } finally {
      setIsProcessing(false)
    }
  }

  const resolvedConfirm = confirmText ?? t('components.confirmDialog.defaultConfirm')
  const resolvedCancel = cancelText ?? t('components.confirmDialog.defaultCancel')

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4">
            {isDangerous && (
              <div className="flex-shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-danger" />
              </div>
            )}
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-2">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isProcessing || isLoading}>
            {resolvedCancel}
          </Button>
          <Button
            variant={isDangerous ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            disabled={isProcessing || isLoading}
          >
            {isProcessing || isLoading ? t('components.confirmDialog.processing') : resolvedConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
