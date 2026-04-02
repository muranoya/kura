import { AlertTriangle, X } from 'lucide-react'
import { useDismissError, useErrors } from '../../contexts/ErrorContext'

export default function ErrorBar() {
  const errors = useErrors()
  const dismissError = useDismissError()

  if (errors.length === 0) return null

  const latest = errors[errors.length - 1]

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-danger text-xs shrink-0">
      <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
      <span className="text-danger flex-1 truncate">{latest.message}</span>
      {errors.length > 1 && (
        <span className="text-danger/70 text-xs shrink-0">+{errors.length - 1}</span>
      )}
      <button
        onClick={() => dismissError(latest.key)}
        className="shrink-0 text-danger/70 hover:text-danger cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
